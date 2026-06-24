import { tool } from "ai";
import { z } from "zod";
import { nanoid } from "nanoid";
import { insertJob } from "@/lib/db/jobs";
import { log } from "@/lib/utils/log";
import { detailsToMd } from "@/lib/agents/job-offer/markdown";
import type { ScoutRunContext } from "../scout/types";

const MODULE = "scout/tool";

export function makeSaveJobTool(ctx: ScoutRunContext) {
  return tool({
    description:
      "Persist a reviewed offer that scores >= 0.85 as shortlisted. Call IMMEDIATELY when a strong match is found — do not keep exploring to compare. Returns the saved job's id and the running match count for this session.",
    inputSchema: z.object({
      external_id: z
        .string()
        .describe(
          "The exact external_id of the job being saved (from fetchJobDetail)",
        ),
      score: z
        .number()
        .min(0)
        .max(1)
        .describe("Relevance score between 0 and 1. Must be >= 0.85 to save."),
      reason: z
        .string()
        .describe(
          "Reason why this offer fits the profile. Cite specific tech matched, seniority alignment, location fit.",
        ),
    }),
    execute: async ({ external_id, score, reason }) => {
      log.info(MODULE, "saveJob begin", { score, external_id });

      if (score < 0.85) {
        log.warn(MODULE, "saveJob: score below threshold", { score });
        return {
          error: `Score ${score} is below the 0.85 threshold; do not save weak matches.`,
        };
      }

      const summary = ctx.reviewedJobs.get(external_id);
      const rawSnapshot = ctx.rawTextByExternalId.get(external_id) ?? null;
      if (!summary) {
        log.warn(MODULE, "saveJob: external_id not found", {
          external_id,
          reviewedCount: ctx.reviewedJobs.size,
        });
        return {
          error: `No reviewed job with external_id ${external_id} — call fetchJobDetail first`,
        };
      }
      if (ctx.matches.some((m) => m.external_id === external_id)) {
        log.warn(MODULE, "saveJob: already saved", { external_id });
        return {
          error: `Job ${external_id} is already saved in this run.`,
        };
      }

      const saved = insertJob({
        id: nanoid(),
        source: "linkedin",
        external_id: summary.external_id,
        url: summary.url,
        title: summary.title,
        company: summary.company,
        location: summary.location,
        description_md: detailsToMd(summary.details),
        raw_snapshot: rawSnapshot,
        match_score: score,
        match_reason: reason,
        status: "shortlisted",
        search_query: ctx.activeQuery,
        search_location: ctx.activeLocation,
      });

      ctx.matches.push({
        id: saved.id,
        external_id: saved.external_id,
        url: saved.url,
        title: saved.title,
        company: saved.company,
        location: saved.location,
        description_md: saved.description_md,
        match_score: saved.match_score,
        match_reason: saved.match_reason,
        status: "shortlisted",
        fetched_at: saved.fetched_at,
        search_query: saved.search_query,
        search_location: saved.search_location,
      });

      log.info(MODULE, "saveJob end", {
        external_id,
        score,
        jobId: saved.id,
        totalMatches: ctx.matches.length,
      });
      return {
        ok: true,
        jobId: saved.id,
        external_id,
        savedCount: ctx.matches.length,
      };
    },
  });
}
