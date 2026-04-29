import { tool } from "ai";
import { z } from "zod";
import { log } from "@/lib/utils/log";
import type { WriterRunContext } from "../types";

const MODULE = "writer/tool";

export function makeFinalizeGenerationTool(ctx: WriterRunContext) {
  return tool({
    description:
      "Close the writer loop. Only call after composeCV AND composeCoverLetter, AND after running the pre-flight checklist mentally (action-verb openers, no pronouns/narrative tails/filler adjectives, recency budget respected, ~10-14 bullets, flat skills list <= 12, cover letter 2-4 paragraphs with specific hook and varied sentence openers, CV/cover in English, rationale in Spanish). If any item fails, call the relevant tool again to revise BEFORE finalizing.",
    inputSchema: z.object({
      rationale: z.object({
        priorityRequirements: z.array(z.string()).describe("3-5 signals/requirements extracted from the job offer."),
        text: z.string().describe(
          "Internal curation log in Spanish for the user to review the generation decisions. " +
          "Structure: (1) **Bullets incluidos** — for each selected bullet, which priority requirement it covers; " +
          "(2) **Bullets excluidos** — each dropped bullet with the reason (recency budget / no job signal / replaced by stronger entry); " +
          "(3) **Decisiones de redacción** — key rewrites made and why (what changed from the original profile text); " +
          "(4) **Trade-offs** — hard choices such as a role cut entirely for the page constraint or skills reordered; " +
          "(5) **Feedback sugerido** — 2-3 concrete questions the user could answer to improve the next iteration."
        )
      })
    }),
    execute: async ({ rationale }) => {
      log.info(MODULE, "finalizeGeneration begin");
      if (!ctx.experience) {
        log.warn(MODULE, "finalizeGeneration: missing experience");
        return { error: "You must call composeCV before finalizing." };
      }
      if (!ctx.skills) {
        log.warn(MODULE, "finalizeGeneration: missing skills");
        return { error: "You must call composeCV before finalizing (skills missing)." };
      }
      if (!ctx.education) {
        log.warn(MODULE, "finalizeGeneration: missing education");
        return { error: "You must call composeCV before finalizing (education missing)." };
      }
      if (!ctx.coverParagraphs) {
        log.warn(MODULE, "finalizeGeneration: missing coverParagraphs");
        return {
          error: "You must call composeCoverLetter before finalizing.",
        };
      }
      
      ctx.rationale = rationale;
      ctx.finalized = true;
      
      log.info(MODULE, "finalizeGeneration end", {
        experienceCount: ctx.experience.length,
        skillCount: ctx.skills.length,
        paragraphCount: ctx.coverParagraphs.length,
        rationaleTextLen: ctx.rationale.text.length,
      });
      return { ok: true };
    },
  });
}
