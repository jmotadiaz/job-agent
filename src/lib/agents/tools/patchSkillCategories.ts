import { tool } from "ai";
import { z } from "zod";
import { log } from "@/lib/utils/log";
import type { WriterRunContext, SkillCategoryEntry } from "../writer/types";

const MODULE = "writer/tool";

const SkillCategoryUpdateSchema = z.object({
  label: z
    .string()
    .describe(
      "Category label as it appears in <skill_categories> (e.g. 'Core', 'Frameworks/Libs'). Used as match key.",
    ),
  items: z
    .array(z.string())
    .min(1)
    .optional()
    .describe(
      "Full replacement list of skills for this category, ordered by relevance. 2-5 items. Required unless delete is true.",
    ),
  delete: z
    .boolean()
    .optional()
    .describe("If true, remove this category from the CV."),
});

export function makePatchSkillCategoriesTool(ctx: WriterRunContext) {
  return tool({
    description:
      "Patch the CV skill categories by label. Each item is matched against the current categories by label. " +
      "Matched → replace items (or delete if delete:true). Unmatched → append as new category. " +
      "Categories not mentioned in this call are preserved. Preserve labels from <skill_categories>; do not invent new ones unless the offer requires it.",
    inputSchema: z.object({
      updates: z
        .array(SkillCategoryUpdateSchema)
        .min(1)
        .describe("One or more skill categories to add, replace, or delete."),
    }),
    execute: async ({ updates }) => {
      const current: SkillCategoryEntry[] = ctx.skillCategories ?? [];
      const next: SkillCategoryEntry[] = [...current];
      const stats = { added: 0, replaced: 0, deleted: 0 };

      for (const upd of updates) {
        const idx = next.findIndex((c) => c.label === upd.label);
        if (upd.delete) {
          if (idx >= 0) {
            next.splice(idx, 1);
            stats.deleted++;
          }
          continue;
        }
        if (!upd.items) {
          return {
            error: `Update for category '${upd.label}' must include items or delete:true.`,
          };
        }
        if (idx >= 0) {
          next[idx] = { label: upd.label, items: upd.items };
          stats.replaced++;
        } else {
          next.push({ label: upd.label, items: upd.items });
          stats.added++;
        }
      }

      ctx.skillCategories = next;

      log.info(MODULE, "patchSkillCategories", {
        updatesCount: updates.length,
        ...stats,
        finalCount: next.length,
      });
      return { ok: true, ...stats, totalCategories: next.length };
    },
  });
}
