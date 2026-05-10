import React from "react";
import { nanoid } from "nanoid";
import fs from "node:fs";
import path from "node:path";
import { renderToFile, type DocumentProps } from "@react-pdf/renderer";
import { loadProfile } from "@/lib/profile/load";
import { parseProfile } from "@/lib/profile/parse";
import { hashProfile } from "@/lib/profile/hash";
import { getJobById } from "@/lib/db/jobs";
import { insertGeneration, getGenerationById } from "@/lib/db/generations";
import { CvTemplate } from "@/lib/writer/templates/cv";
import { CoverLetterTemplate } from "@/lib/writer/templates/cover-letter";
import { appendAgentStep } from "@/lib/runtime/agent-trace";
import {
  runWithContext,
  makeRunId,
  setRunOutcome,
} from "@/lib/runtime/run-context";
import { LOG_DIR, GENERATED_PDFS_DIR } from "@/lib/runtime/paths";
import { createWriterAgent } from "./agent";
import { log } from "@/lib/utils/log";
import type { WriterRunContext } from "./tools";

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

export async function runWriter(input: WriterInput): Promise<WriterOutput> {
  const { jobId, parentGenerationId, feedbackRating, feedbackComment } = input;
  const runId = makeRunId();
  const runDir = path.join(LOG_DIR, runId);

  return runWithContext(
    { runId, runDir, kind: "writer", input: { jobId, generationId: parentGenerationId } },
    async () => {
      const job = getJobById(jobId);
      if (!job)
        throw Object.assign(new Error(`Job ${jobId} not found`), { status: 404 });

      const profileContent = loadProfile();
      const profileHash = hashProfile(profileContent);
      log.info(MODULE, "profile loaded", {
        hash: profileHash,
        length: profileContent.length,
      });

      const { profile, anchors, skillCategories } = parseProfile(profileContent);

      // Build prompt
      const jobDescription = job.raw_snapshot || job.description_md;
      let prompt = `Adapt the CV and cover letter for the offer below. Read the offer first, extract its 3-5 priority requirements, then compose the experience, skill_categories, and education accordingly. Apply bullet_rules, recency_budget, and cover_letter structure from your system instructions.\n\n`;
      prompt += `<target_company>${job.company}</target_company>\n`;
      prompt += `<target_title>${job.title}</target_title>\n`;
      prompt += `<job_offer>\n${jobDescription}\n</job_offer>\n\n`;
      prompt += `<candidate_profile>\n${profileContent}\n</candidate_profile>\n\n`;

      if (anchors.bullets.length > 0 || anchors.skills.length > 0) {
        prompt += `<anchors note="These are MUST-INCLUDE items from the profile. Drop only if there is a hard incompatibility with the offer; if dropped, explain why in the rationale.">\n`;
        if (anchors.bullets.length > 0) {
          prompt += `bullets (match by case-insensitive substring against the profile bullet text):\n`;
          for (const b of anchors.bullets) prompt += `  - ${b}\n`;
        }
        if (anchors.skills.length > 0) {
          prompt += `skills (must appear in skill_categories under the matching category):\n`;
          for (const s of anchors.skills) prompt += `  - ${s}\n`;
        }
        prompt += `</anchors>\n\n`;
      }

      if (skillCategories.length > 0) {
        prompt += `<skill_categories note="Preserve these category labels. Pick 2-5 items per category by relevance to the offer. Use 2-4 categories total to fit one page.">\n`;
        for (const cat of skillCategories) {
          prompt += `${cat.label}: ${cat.items.join(", ")}\n`;
        }
        prompt += `</skill_categories>\n`;
      }

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
        promptLen: prompt.length,
      });

      const ctx: WriterRunContext = {
        experience: null,
        skillCategories: null,
        education: null,
        coverParagraphs: null,
        rationale: null,
        finalized: false,
      };

      try {
        const agent = createWriterAgent(ctx, isIteration);
        log.info(MODULE, "agent created", { mode });
        const agentT0 = Date.now();

        await agent.generate({
          prompt,
          onStepFinish: (step) => {
            log.info(MODULE, `agent step ${step.stepNumber} finish`, {
              finishReason: step.finishReason,
              usage: step.usage,
              text:
                step.text?.slice(0, 100) + (step.text?.length > 100 ? "..." : ""),
              reasoning: (step as any).reasoningText?.slice(0, 100),
              toolCalls: step.toolCalls?.map((tc) => ({
                tool: tc.toolName,
                args: tc.input,
              })),
            });

            if (step.toolResults && step.toolResults.length > 0) {
              step.toolResults.forEach((tr) => {
                log.info(MODULE, `tool result: ${tr.toolName}`, {
                  args: tr.input,
                  result: tr.output,
                });
              });
            }

            appendAgentStep(step.stepNumber, {
              text: step.text,
              toolCalls: step.toolCalls?.map((tc) => ({
                toolName: tc.toolName,
                input: tc.input,
              })),
              toolResults: step.toolResults?.map((tr) => ({
                toolName: tr.toolName,
                output: tr.output,
              })),
              finishReason: step.finishReason,
              usage: step.usage,
            });
          },
        });

        const agentDuration = Date.now() - agentT0;

        if (
          !ctx.experience ||
          !ctx.skillCategories ||
          !ctx.education ||
          !ctx.coverParagraphs
        ) {
          throw new Error(
            "Writer agent did not produce experience, skill_categories, education, and cover letter",
          );
        }

        const coverLen = ctx.coverParagraphs.join("\n").length;
        log.info(MODULE, "agent result", {
          mode,
          experienceCount: ctx.experience.length,
          coverLen,
          duration: agentDuration,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        log.error(MODULE, "agent failure", { error: error.message });
        setRunOutcome("error", { message: error.message });
        return { kind: "error", message: error.message };
      }

      const generationId = nanoid();
      const outDir = path.join(GENERATED_PDFS_DIR, jobId, generationId);
      fs.mkdirSync(outDir, { recursive: true });

      const cvPath = path.join(outDir, "cv.pdf");
      const coverPath = path.join(outDir, "cover.pdf");

      const flatBullets = ctx.experience.flatMap((e) =>
        e.bullets.map((text) => ({
          company: e.company,
          jobTitle: e.role,
          period: e.period,
          renderedText: text,
          bulletId: nanoid(),
        })),
      );

      // Render CV
      await renderToFile(
        React.createElement(CvTemplate, {
          name: profile.name,
          jobTitle: profile.role,
          email: profile.email,
          phone: profile.phone,
          location: profile.location,
          linkedinUrl: profile.linkedinUrl,
          website: profile.website || undefined,
          bullets: flatBullets,
          education: ctx.education,
          skillCategories: ctx.skillCategories,
        }) as React.ReactElement<DocumentProps>,
        cvPath,
      );

      // Render cover letter
      await renderToFile(
        React.createElement(CoverLetterTemplate, {
          senderName: profile.name,
          senderRole: profile.role,
          senderEmail: profile.email,
          senderPhone: profile.phone,
          senderLinkedin: profile.linkedinUrl,
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
        bullets_json: JSON.stringify(ctx.experience),
        skills_json: JSON.stringify(ctx.skillCategories),
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

      setRunOutcome("ok", { generationId });
      return {
        kind: "success",
        generationId,
        cvUrl: `/api/generations/${generationId}/cv`,
        coverUrl: `/api/generations/${generationId}/cover`,
      };
    },
  );
}
