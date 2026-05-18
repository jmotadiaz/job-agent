import { nanoid } from "nanoid";
import fs from "node:fs";
import path from "node:path";
import { loadProfile } from "@/lib/profile/load";
import { parseProfile } from "@/lib/profile/parse";
import { hashProfile } from "@/lib/profile/hash";
import { getJobById } from "@/lib/db/jobs";
import { insertGeneration, getGenerationById } from "@/lib/db/generations";
import {
  runWithContext,
  makeRunId,
  setRunOutcome,
} from "@/lib/runtime/run-context";
import { LOG_DIR, GENERATED_PDFS_DIR } from "@/lib/runtime/paths";
import { log } from "@/lib/utils/log";
import type { PlanInput } from "./plan/agent";
import { writerFirstGenWorkflow, writerRevisionWorkflow } from "./workflow";

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

      const jobDescription = job.raw_snapshot || job.description_md;

      let parentGeneration: PlanInput["parentGeneration"] = null;
      if (parentGenerationId) {
        const parent = getGenerationById(parentGenerationId);
        if (parent) {
          parentGeneration = {
            bulletsJson: parent.bullets_json,
            skillsJson: parent.skills_json,
            coverParagraphsJson: parent.cover_paragraphs_json,
            feedbackRating: parent.feedback_rating,
            feedbackComment: parent.feedback_comment,
            cvPath: parent.cv_path,
            coverPath: parent.cover_path,
            rationaleJson: parent.rationale_json,
            educationJson: parent.education_json ?? null,
          };
        }
      }

      const generationId = nanoid();
      const outDir = path.join(GENERATED_PDFS_DIR, jobId, generationId);
      fs.mkdirSync(outDir, { recursive: true });


      const isRevision = !!parentGenerationId;
      const workflow = isRevision ? writerRevisionWorkflow : writerFirstGenWorkflow;

      log.info(MODULE, `${isRevision ? "revision" : "first-gen"} workflow begin`, { jobId, generationId, isRevision });
      const t0 = Date.now();

      try {
        const result = await workflow.execute({
          ...input,
          jobDescription,
          company: job.company,
          title: job.title,
          profileContent,
          anchors,
          skillCategories,
          profile: {
            name: profile.name,
            role: profile.role,
            email: profile.email,
            phone: profile.phone,
            location: profile.location,
            linkedinUrl: profile.linkedinUrl,
            website: profile.website || undefined,
          },
          outDir,
          parentGeneration,
        });

        log.info(MODULE, "workflow end", {
          duration: Date.now() - t0,
          autoReviewPassed: result.autoReviewPassed,
          cvIterations: result.cvIterations,
          coverIterations: result.coverIterations,
        });

        insertGeneration({
          id: generationId,
          job_id: jobId,
          profile_hash: profileHash,
          cv_path: result.cv.pdfPath,
          cover_path: result.cover.pdfPath,
          bullets_json: JSON.stringify(result.cv.experience),
          skills_json: JSON.stringify(result.cv.skillCategories),
          cover_paragraphs_json: JSON.stringify(result.cover.paragraphs),
          education_json: JSON.stringify(result.cv.education),
          rationale_json: JSON.stringify({
            priorityRequirements: result.priorityRequirements,
            text: result.rationale,
          }),
          parent_generation_id: parentGenerationId ?? null,
          feedback_rating: feedbackRating ?? null,
          feedback_comment: feedbackComment ?? null,
        });

        setRunOutcome("ok", { generationId });
        return {
          kind: "success",
          generationId,
          cvUrl: `/api/generations/${generationId}/cv`,
          coverUrl: `/api/generations/${generationId}/cover`,
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        log.error(MODULE, "workflow failed", { error: error.message });
        setRunOutcome("error", { message: error.message });
        return { kind: "error", message: error.message };
      }
    },
  );
}
