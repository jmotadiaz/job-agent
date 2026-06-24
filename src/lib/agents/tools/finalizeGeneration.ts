import { tool } from "ai";
import { z } from "zod";
import { log } from "@/lib/utils/log";
import type { WriterRunContext } from "../writer/types";

const MODULE = "writer/tool";

export function makeFinalizeGenerationTool(ctx: WriterRunContext) {
  return tool({
    description:
      "Close the writer loop. Only call after the CV state (experience, skill categories, education) and/or cover letter paragraphs are in their final shape, AND after running the pre-flight checklist mentally. CV checklist: action-verb bullet openers, no pronouns/narrative tails/filler adjectives, recency budget respected, ~10-14 bullets, flat skills list <= 12. Cover checklist: 2-4 paragraphs, first-person personal-interest opener, active voice, direct tone, specific hook, varied sentence openers. All CV/cover text must be in English; rationale must be in Spanish. If any item fails, call the relevant patch tool again to revise BEFORE finalizing.",
    inputSchema: z.object({
      rationale: z.object({
        priorityRequirements: z.array(z.string()).describe("3-5 signals/requirements extracted from the job offer."),
        text: z.string().describe(
          "Internal curation log in Spanish, following the active agent's <rationale_rule> in the system instructions exactly."
        )
      })
    }),
    execute: async ({ rationale }) => {
      log.info(MODULE, "finalizeGeneration begin");
      
      const hasCv = !!ctx.experience && !!ctx.skillCategories && ctx.skillCategories.length > 0 && !!ctx.education;
      const hasCover = !!ctx.coverParagraphs && ctx.coverParagraphs.length > 0;

      if (!hasCv && !hasCover) {
        log.warn(MODULE, "finalizeGeneration: missing both CV and Cover Letter content");
        return {
          error:
            "You must populate CV state (patchExperience/patchSkillCategories/patchEducation) or cover paragraphs (patchCoverParagraphs) before finalizing.",
        };
      }
      
      ctx.rationale = rationale;
      ctx.finalized = true;
      
      log.info(MODULE, "finalizeGeneration end", {
        hasCv,
        hasCover,
        experienceCount: ctx.experience?.length ?? 0,
        skillCategoryCount: ctx.skillCategories?.length ?? 0,
        paragraphCount: ctx.coverParagraphs?.length ?? 0,
        rationaleTextLen: ctx.rationale.text.length,
      });
      return { ok: true };
    },
  });
}
