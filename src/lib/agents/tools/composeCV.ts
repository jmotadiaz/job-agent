import { tool } from "ai";
import { z } from "zod";
import { log } from "@/lib/utils/log";
import type { WriterRunContext } from "../writer/types";

const MODULE = "writer/tool";

export function makeComposeCVTool(ctx: WriterRunContext) {
  return tool({
    description:
      "Submit the structured content for the CV: experience (bullets rewritten for the offer), skill_categories (preserving the profile's category structure), and education.",
    inputSchema: z.object({
      experience: z.array(z.object({
        company: z.string().describe("Company name as it appears in the profile."),
        role: z.string().describe("Job title as it appears in the profile."),
        period: z.string().describe("Time period as it appears in the profile."),
        bullets: z.array(z.string()).describe("List of rewritten, telegraphic CV bullets for this specific role. Follow the recency budget rules (4-6 for recent, 2-3 for mid, 0-2 for older). No pronouns, no weak openers.")
      })).min(1),
      skill_categories: z
        .array(
          z.object({
            label: z
              .string()
              .describe(
                "Category label from the profile (e.g. 'Core', 'Frameworks/Libs', 'Testing'). Preserve the original label.",
              ),
            items: z
              .array(z.string())
              .min(1)
              .describe(
                "Skills from this category, in the order they should appear. Pick 2-5 per category, ordered by relevance to the offer. Anchored skills declared in the profile MUST appear in the correct category.",
              ),
          }),
        )
        .min(1)
        .max(5)
        .describe(
          "Skills grouped by category. Preserve the profile's category structure. Use 2-4 categories total to fit a one-page CV.",
        ),
      education: z.array(z.object({
        institution: z.string(),
        degree: z.string(),
        period: z.string()
      })).describe("Education entries from the profile.")
    }),
    execute: async (input) => {
      const totalSkills = input.skill_categories.reduce(
        (acc, c) => acc + c.items.length,
        0,
      );
      log.info(MODULE, "composeCV begin", {
        experienceCount: input.experience.length,
        skillCategoriesCount: input.skill_categories.length,
        skillsCount: totalSkills,
        educationCount: input.education.length,
      });

      ctx.experience = input.experience;
      ctx.skillCategories = input.skill_categories;
      ctx.education = input.education;

      log.info(MODULE, "composeCV end");
      return { ok: true, experienceCount: input.experience.length };
    },
  });
}
