import { tool } from "ai";
import { z } from "zod";
import { log } from "@/lib/utils/log";
import type { WriterRunContext } from "../types";

const MODULE = "writer/tool";

export function makeFinalizeGenerationTool(ctx: WriterRunContext) {
  return tool({
    description:
      "Close the writer loop. Only call after selectBullets, selectSkills, composeCoverLetter AND composeRationale, AND after running the pre-flight checklist mentally (action-verb openers, no pronouns/narrative tails/filler adjectives, recency budget respected, ~10-14 bullets, flat skills list <= 12, cover letter 2-4 paragraphs with specific hook and varied sentence openers, CV/cover in English, rationale in Spanish). If any item fails, call the relevant tool again to revise BEFORE finalizing.",
    inputSchema: z.object({}),
    execute: async () => {
      log.info(MODULE, "finalizeGeneration begin");
      if (!ctx.bullets) {
        log.warn(MODULE, "finalizeGeneration: missing bullets");
        return { error: "You must call selectBullets before finalizing." };
      }
      if (!ctx.skillItems) {
        log.warn(MODULE, "finalizeGeneration: missing skillItems");
        return { error: "You must call selectSkills before finalizing." };
      }
      if (!ctx.coverParagraphs) {
        log.warn(MODULE, "finalizeGeneration: missing coverParagraphs");
        return {
          error: "You must call composeCoverLetter before finalizing.",
        };
      }
      if (!ctx.rationale) {
        log.warn(MODULE, "finalizeGeneration: missing rationale");
        return {
          error: "You must call composeRationale before finalizing.",
        };
      }
      ctx.finalized = true;
      log.info(MODULE, "finalizeGeneration end", {
        bulletCount: ctx.bullets.length,
        skillCount: ctx.skillItems.length,
        paragraphCount: ctx.coverParagraphs.length,
        rationaleChars:
          ctx.rationale.bulletsRationale.length +
          ctx.rationale.skillsRationale.length +
          ctx.rationale.coverLetterRationale.length,
      });
      return { ok: true };
    },
  });
}
