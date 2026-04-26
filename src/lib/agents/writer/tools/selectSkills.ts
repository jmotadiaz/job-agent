import { tool } from "ai";
import { z } from "zod";
import { log } from "@/lib/utils/log";
import type { WriterRunContext } from "../types";

const MODULE = "writer/tool";

export function makeSelectSkillsTool(ctx: WriterRunContext) {
  return tool({
    description:
      "Submit the offer-prioritized skills list for the CV's Skills section. Output is a SINGLE FLAT ordered list -- no categories, no sub-headers, no embedded labels (e.g. do NOT emit 'Languages: TypeScript, Python' as one item). Pick only catalog skills the offer explicitly requires or rewards; drop generic, outdated, or duplicative entries. 6-10 items typical, 12 hard cap, ordered by relevance with the most offer-critical first. Strings must match the catalog exactly.",
    inputSchema: z.object({
      items: z
        .array(z.string().min(1))
        .min(1)
        .max(12)
        .describe(
          "Flat ordered list of skill names taken verbatim from the catalog, most offer-critical first. No categories, no labels, no sub-headers.",
        ),
    }),
    execute: async ({ items }) => {
      log.info(MODULE, "selectSkills begin", { count: items.length });
      const invalid = items.filter((s) => !ctx.availableSkills.includes(s));
      if (invalid.length > 0) {
        log.warn(MODULE, "selectSkills: unknown skills", { invalid });
        return {
          error: `Unknown skills: ${invalid.join(", ")}. You may only use skills from the available catalog.`,
        };
      }
      ctx.skillItems = items;
      log.info(MODULE, "selectSkills end", { selected: items.length });
      return { ok: true, selected: items.length };
    },
  });
}
