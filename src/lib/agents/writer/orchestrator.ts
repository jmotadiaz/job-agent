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
  const get = (key: string) =>
    content
      .match(new RegExp(`${key}:\\s*(.+)`, "i"))?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, "");
  return {
    name: get("name") ?? "Candidate",
    email: get("email"),
    phone: get("phone"),
    location: get("location"),
    linkedin: get("linkedin"),
    website: get("website"),
  };
}

function extractEducation(content: string) {
  const edu: Array<{ institution: string; degree: string; period: string }> =
    [];
  const eduSection =
    content.match(/## Education\s+([\s\S]*?)(?=\n##|$)/i)?.[1] ?? "";
  const blocks = eduSection.match(/###.+[\s\S]*?(?=\n###|\n##|$)/g) ?? [];
  for (const block of blocks) {
    const titleM = block.match(/###\s+(.+)\s+—\s+(.+)\s+\(([^)]+)\)/);
    if (titleM) {
      edu.push({
        institution: titleM[1].trim(),
        degree: titleM[2].trim(),
        period: titleM[3].trim(),
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
  const education = extractEducation(profileContent);

  // Build prompt
  let prompt = `Adapta el CV y carta de presentación para este puesto.\n\n`;
  const jobDescription = job.raw_snapshot || job.description_md;
  prompt += `## Oferta\n${jobDescription}\n\n`;
  prompt += `## Perfil del candidato\n${profileContent}\n\n`;
  prompt += `## Catálogo de bullets disponibles (usa solo estos bulletIds)\n`;
  for (const b of bulletCatalog) {
    prompt += `- ${b.bulletId}: ${b.originalText}\n`;
  }

  const isIteration = !!parentGenerationId;

  if (parentGenerationId) {
    const parent = getGenerationById(parentGenerationId);
    if (parent) {
      const hasFeedback = parent.feedback_rating != null;
      log.info(MODULE, "parent loaded", { parentGenerationId, hasFeedback });
      prompt += `\n## Generación anterior (como referencia para la iteración)\n`;
      prompt += `Bullets seleccionados: ${parent.bullets_json}\n`;
      prompt += `Cuerpo de carta: ${parent.cover_paragraphs_json}\n`;
      if (feedbackRating) {
        prompt += `\n## Feedback del usuario\nRating: ${feedbackRating}/5\n`;
        if (feedbackComment) prompt += `Comentario: ${feedbackComment}\n`;
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
    coverParagraphs: null,
    finalized: false,
    availableBulletIds: new Set(bulletCatalog.map((b) => b.bulletId)),
  };

  try {
    const agent = createWriterAgent(ctx, isIteration);
    const agentT0 = Date.now();
    await agent.generate({ prompt });
    const agentDuration = Date.now() - agentT0;

    if (!ctx.bullets || !ctx.coverParagraphs) {
      throw new Error("Writer agent did not produce bullets and cover letter");
    }

    const coverLen = ctx.coverParagraphs.join("\n").length;
    log.info(MODULE, "agent result", {
      mode,
      bulletCount: ctx.bullets.length,
      coverLen,
      duration: agentDuration,
    });
  } catch (err: any) {
    log.error(MODULE, "agent failure", { error: err.message });
    return { kind: "error", message: err.message };
  }

  const generationId = nanoid();
  const outDir = path.join(OUTPUT_BASE, jobId, generationId);
  fs.mkdirSync(outDir, { recursive: true });

  const cvPath = path.join(outDir, "cv.pdf");
  const coverPath = path.join(outDir, "cover.pdf");

  // Render CV
  await renderToFile(
    React.createElement(CvTemplate, {
      ...personalInfo,
      bullets: ctx.bullets,
      education,
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
    cover_paragraphs_json: JSON.stringify(ctx.coverParagraphs),
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
