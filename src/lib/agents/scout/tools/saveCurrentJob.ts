import { tool } from "ai";
import { z } from "zod";
import { log } from "@/lib/utils/log";
import type { ScoutRunContext } from "../types";

const MODULE = "scout/tool";

export function makeSaveCurrentJobTool(ctx: ScoutRunContext) {
  return tool({
    description:
      "Persist the most recently reviewed offer as shortlisted with a score and reason. Only call if the offer fits the profile.",
    inputSchema: z.object({
      external_id: z
        .string()
        .describe(
          "The exact external_id of the job being saved (from fetchJobDetail)"
        ),
      score: z
        .number()
        .min(0)
        .max(1)
        .describe("Relevance score between 0 and 1"),
      reason: z.string().describe("Reason why this offer fits the profile"),
    }),
    execute: async ({ external_id, score, reason }) => {
      log.info(MODULE, "saveCurrentJob begin", { score, external_id });

      const summary =
        ctx.reviewedJobs.get(external_id) ?? ctx.lastSummary;
      if (!summary || summary.external_id !== external_id) {
        log.warn(MODULE, "saveCurrentJob: external_id not found", {
          external_id,
          reviewedCount: ctx.reviewedJobs.size,
          lastSummaryId: ctx.lastSummary?.external_id,
        });
        return {
          error: `No reviewed job with external_id ${external_id} — call fetchJobDetail first`,
        };
      }

      ctx.lastSummary = summary;
      ctx.matchResult = { score, reason };
      ctx.saveMatchCalled = true;
      log.info(MODULE, "saveCurrentJob end", {
        external_id: summary.external_id,
        score,
      });
      return { ok: true, external_id: summary.external_id };
    },
  });
}
