import React from "react";
import { nanoid } from "nanoid";
import fs from "node:fs";
import path from "node:path";
import { renderToFile, type DocumentProps } from "@react-pdf/renderer";
import { loadProfile, PROFILE_PATH } from "@/lib/profile/load";
import { parseProfile } from "@/lib/profile/parse";
import { hashProfile } from "@/lib/profile/hash";
import { getJobById } from "@/lib/db/jobs";
import { insertGeneration, getGenerationById } from "@/lib/db/generations";
import { CvTemplate } from "@/lib/writer/templates/cv";
import { CoverLetterTemplate } from "@/lib/writer/templates/cover-letter";
import { createWriterAgent } from "./agent";
import { log } from "@/lib/utils/log";
import type { WriterRunContext } from "./tools";

const OUTPUT_BASE = path.join(process.cwd(), "generated-pdfs");
const MODULE = "writer/orchestrator";

export interface WriterInput {
  jobId: string;
  parentGenerationId?: string | null;
  feedbackRating?: number | null;
  feedbackComment?: string | null;
}

export type WriterOutput =
  | { kind: "success"; generationId: string; cvUrl: string; coverUrl: string }
  | { kind: "error"; message: string };

function extractBulletCatalog(
  profileContent: string,
): Array<{ bulletId: string; originalText: string }> {
  const catalog: Array<{ bulletId: string; originalText: string }> = [];
  const lines = profileContent.split("\n");
  let bulletIdx = 0;
  for (const line of lines) {
    const m = line.match(/^[-*]\s+(.+)/);
    if (m) {
      catalog.push({ bulletId: `b${bulletIdx}`, originalText: m[1].trim() });
      bulletIdx++;
    }
  }
  return catalog;
}

function extractPersonalInfo(content: string) {
  // Parse "# Name - Job Title" heading
  const headingMatch = content.match(/^#\s+(.+?)(?:\s+[-–]\s+(.+))?$/m);
  const name = headingMatch?.[1]?.trim() ?? "Candidate";
  const jobTitle = headingMatch?.[2]?.trim();

  // Find first line containing | (contact line)
  const contactLine = content.match(/^[^#\n].+\|.+$/m)?.[0] ?? "";
  const parts = contactLine.split("|").map((p) => p.trim());

  let email: string | undefined;
  let phone: string | undefined;
  let location: string | undefined;
  let linkedin: string | undefined;
  let website: string | undefined;

  for (const part of parts) {
    // Strip markdown link syntax, keep display text
    const clean = part.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
    if (clean.includes("@")) email = clean;
    else if (/^\+?\d[\d\s()./-]{5,}/.test(clean)) phone = clean;
    else if (/linkedin/i.test(clean)) linkedin = clean;
    else if (/https?:\/\/|^www\./i.test(clean)) website = clean;
    else if (clean && !location) location = clean;
  }

  return { name, jobTitle, email, phone, location, linkedin, website };
}

function extractJobBulletMap(
  content: string,
): Map<string, { jobTitle: string; company: string; period: string }> {
  const map = new Map<
    string,
    { jobTitle: string; company: string; period: string }
  >();
  const lines = content.split("\n");
  let inExperience = false;
  let currentJob: { jobTitle: string; company: string; period: string } | null =
    null;
  let globalBulletIdx = 0;

  for (const line of lines) {
    if (/^## Experience/i.test(line)) {
      inExperience = true;
      continue;
    }

    if (/^## /.test(line)) inExperience = false;

    if (inExperience) {
      // ### Company | Role | Period
      const jobMatch = line.match(/^###\s+([^|]+)\|\s*([^|]+)\|\s*(.+)$/);
      if (jobMatch) {
        currentJob = {
          company: jobMatch[1].trim(),
          jobTitle: jobMatch[2].trim(),
          period: jobMatch[3].trim(),
        };
      }
    }

    if (/^[-*]\s+/.test(line)) {
      if (inExperience && currentJob)
        map.set(`b${globalBulletIdx}`, currentJob);
      globalBulletIdx++;
    }
  }

  return map;
}

function extractSkills(content: string) {
  const section = content.match(/## Skills\s+([\s\S]*?)(?=\n##|$)/i)?.[1] ?? "";
  const categories: Array<{ label: string; items: string[] }> = [];
  for (const line of section.split("\n")) {
    // Match "- **Label**: item1, item2, ..."
    const m = line.match(/^[-*]\s+\*\*([^*]+)\*\*:\s*(.+)/);
    if (m) {
      const items = m[2]
        .split(/,\s*/)
        .map((s) => s.replace(/\.$/, "").trim())
        .filter(Boolean);
      categories.push({ label: m[1].trim(), items });
    }
  }
  return categories;
}

function extractEducation(content: string) {
  const edu: Array<{ institution: string; degree: string; period: string }> =
    [];
  const section =
    content.match(/## Education\s+([\s\S]*?)(?=\n##|$)/i)?.[1] ?? "";

  for (const line of section.split("\n")) {
    // Format: - **Degree** | Institution | period
    const m = line.match(/^[-*]\s+\*\*([^*]+)\*\*\s*\|\s*([^|]+)\|\s*(.+)$/);
    if (m) {
      edu.push({
        degree: m[1].trim(),
        institution: m[2].trim(),
        period: m[3].trim(),
      });
      continue;
    }
    // Format: ### Institution | Role | period
    const m2 = line.match(/^###\s+([^|]+)\|\s*([^|]+)\|\s*(.+)$/);
    if (m2) {
      edu.push({
        institution: m2[1].trim(),
        degree: m2[2].trim(),
        period: m2[3].trim(),
      });
    }
  }
  return edu;
}

export async function runWriter(input: WriterInput): Promise<WriterOutput> {
  const { jobId, parentGenerationId, feedbackRating, feedbackComment } = input;

  const job = getJobById(jobId);
  if (!job)
    throw Object.assign(new Error(`Job ${jobId} not found`), { status: 404 });

  const profileContent = loadProfile();
  const profileHash = hashProfile(profileContent);
  log.info(MODULE, "profile loaded", {
    hash: profileHash,
    length: profileContent.length,
  });

  const bulletCatalog = extractBulletCatalog(profileContent);
  const personalInfo = extractPersonalInfo(profileContent);
  const { linkedinProfile } = parseProfile(profileContent);
  const education = extractEducation(profileContent);
  const skillCategories = extractSkills(profileContent);
  const jobBulletMap = extractJobBulletMap(profileContent);

  // Build prompt
  const jobDescription = job.raw_snapshot || job.description_md;
  let prompt = `Adapt the CV and cover letter for the offer below. Read the offer first, extract its 3-5 priority requirements, then select and rewrite bullets and skills accordingly. Apply the resume_language_principles, recency budget, and cover_letter structure from your system instructions.\n\n`;
  prompt += `<job_offer>\n${jobDescription}\n</job_offer>\n\n`;
  prompt += `<candidate_profile>\n${profileContent}\n</candidate_profile>\n\n`;
  prompt += `<bullet_catalog note="Only these bulletIds are valid for selectBullets.">\n`;
  for (const b of bulletCatalog) {
    prompt += `- ${b.bulletId}: ${b.originalText}\n`;
  }
  prompt += `</bullet_catalog>\n\n`;

  const flatSkills = skillCategories.flatMap((c) => c.items);
  prompt += `<skills_catalog note="Only these exact strings are valid for selectSkills.">\n`;
  for (const s of flatSkills) {
    prompt += `- ${s}\n`;
  }
  prompt += `</skills_catalog>\n`;

  const isIteration = !!parentGenerationId;

  if (parentGenerationId) {
    const parent = getGenerationById(parentGenerationId);
    if (parent) {
      const hasFeedback = parent.feedback_rating != null;
      log.info(MODULE, "parent loaded", { parentGenerationId, hasFeedback });
      prompt += `\n<previous_generation note="Reference for this iteration. Keep what was working; revise what feedback flags.">\n`;
      prompt += `Selected bullets: ${parent.bullets_json}\n`;
      prompt += `Selected skills: ${parent.skills_json ?? "none"}\n`;
      prompt += `Cover letter body: ${parent.cover_paragraphs_json}\n`;
      prompt += `</previous_generation>\n`;
      if (feedbackRating) {
        prompt += `\n<user_feedback>\nRating: ${feedbackRating}/5\n`;
        if (feedbackComment) prompt += `Comment: ${feedbackComment}\n`;
        prompt += `</user_feedback>\n`;
      }
    }
  }

  const mode = isIteration ? "iteration" : "initial";
  log.info(MODULE, "agent invoke begin", {
    mode,
    jobId,
    bulletCount: bulletCatalog.length,
  });

  const ctx: WriterRunContext = {
    bullets: null,
    skillItems: null,
    coverParagraphs: null,
    rationale: null,
    finalized: false,
    availableBulletIds: new Set(bulletCatalog.map((b) => b.bulletId)),
    availableSkills: skillCategories.flatMap((c) => c.items),
  };

  try {
    const agent = createWriterAgent(ctx, isIteration);
    const agentT0 = Date.now();
    await agent.generate({ prompt });
    const agentDuration = Date.now() - agentT0;

    if (!ctx.bullets || !ctx.skillItems || !ctx.coverParagraphs) {
      throw new Error(
        "Writer agent did not produce bullets, skills, and cover letter",
      );
    }

    const coverLen = ctx.coverParagraphs.join("\n").length;
    log.info(MODULE, "agent result", {
      mode,
      bulletCount: ctx.bullets.length,
      coverLen,
      duration: agentDuration,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    log.error(MODULE, "agent failure", { error: error.message });
    return { kind: "error", message: error.message };
  }

  const generationId = nanoid();
  const outDir = path.join(OUTPUT_BASE, jobId, generationId);
  fs.mkdirSync(outDir, { recursive: true });

  const cvPath = path.join(outDir, "cv.pdf");
  const coverPath = path.join(outDir, "cover.pdf");

  const enrichedBullets = ctx.bullets.map((b) => ({
    ...b,
    ...(jobBulletMap.get(b.bulletId) ?? {}),
  }));

  // Render CV
  await renderToFile(
    React.createElement(CvTemplate, {
      ...personalInfo,
      linkedinUrl: linkedinProfile,
      bullets: enrichedBullets,
      education,
      skillCategories: [{ label: "Skills", items: ctx.skillItems }],
    }) as React.ReactElement<DocumentProps>,
    cvPath,
  );

  // Render cover letter
  await renderToFile(
    React.createElement(CoverLetterTemplate, {
      senderName: personalInfo.name,
      senderEmail: personalInfo.email,
      companyName: job.company,
      jobTitle: job.title,
      paragraphs: ctx.coverParagraphs,
    }) as React.ReactElement<DocumentProps>,
    coverPath,
  );

  const cvSize = fs.statSync(cvPath).size;
  const coverSize = fs.statSync(coverPath).size;
  log.info(MODULE, "pdf rendered", { cvPath, coverPath, cvSize, coverSize });

  insertGeneration({
    id: generationId,
    job_id: jobId,
    profile_hash: profileHash,
    cv_path: cvPath,
    cover_path: coverPath,
    bullets_json: JSON.stringify(ctx.bullets),
    skills_json: JSON.stringify(ctx.skillItems),
    cover_paragraphs_json: JSON.stringify(ctx.coverParagraphs),
    rationale_json: ctx.rationale ? JSON.stringify(ctx.rationale) : null,
    parent_generation_id: parentGenerationId ?? null,
    feedback_rating: feedbackRating ?? null,
    feedback_comment: feedbackComment ?? null,
  });

  log.info(MODULE, "persist", {
    generationId,
    jobId,
    parent: parentGenerationId ?? null,
  });

  return {
    kind: "success",
    generationId,
    cvUrl: `/api/generations/${generationId}/cv`,
    coverUrl: `/api/generations/${generationId}/cover`,
  };
}
