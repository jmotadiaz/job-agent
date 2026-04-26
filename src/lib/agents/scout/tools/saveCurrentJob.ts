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
      score: z
        .number()
        .min(0)
        .max(1)
        .describe("Relevance score between 0 and 1"),
      reason: z.string().describe("Reason why this offer fits the profile"),
    }),
    execute: async ({ score, reason }) => {
      log.info(MODULE, "saveCurrentJob begin", {
        score,
        external_id: ctx.lastSummary?.external_id,
      });
      if (!ctx.lastSummary) {
        log.warn(MODULE, "saveCurrentJob: no lastSummary available");
        return { error: "No recent offer — call fetchJobDetail first" };
      }
      ctx.matchResult = { score, reason };
      ctx.saveMatchCalled = true;
      log.info(MODULE, "saveCurrentJob end", {
        external_id: ctx.lastSummary.external_id,
        score,
      });
      return { ok: true, external_id: ctx.lastSummary.external_id };
    },
  });
}
