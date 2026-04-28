import { tool } from "ai";
import { z } from "zod";
import { log } from "@/lib/utils/log";
import type { WriterRunContext } from "../types";

const MODULE = "writer/tool";

export function makeComposeCVTool(ctx: WriterRunContext) {
  return tool({
    description:
      "Submit the structured content for the CV: experience (bullets rewritten for the offer), skills (ordered list), and education. This replaces the individual selection tools.",
    inputSchema: z.object({
      experience: z.array(z.object({
        company: z.string().describe("Company name as it appears in the profile."),
        role: z.string().describe("Job title as it appears in the profile."),
        period: z.string().describe("Time period as it appears in the profile."),
        bullets: z.array(z.string()).describe("List of rewritten, telegraphic CV bullets for this specific role. Follow the recency budget rules (4-6 for recent, 2-3 for mid, 0-2 for older). No pronouns, no weak openers.")
      })).min(1),
      skills: z.array(z.string()).min(1).describe("Ordered list of skills most relevant to the offer."),
      education: z.array(z.object({
        institution: z.string(),
        degree: z.string(),
        period: z.string()
      })).describe("Education entries from the profile.")
    }),
    execute: async (input) => {
      log.info(MODULE, "composeCV begin", {
        experienceCount: input.experience.length,
        skillsCount: input.skills.length,
        educationCount: input.education.length
      });
      
      ctx.experience = input.experience;
      ctx.skills = input.skills;
      ctx.education = input.education;
      
      log.info(MODULE, "composeCV end");
      return { ok: true, experienceCount: input.experience.length };
    },
  });
}
