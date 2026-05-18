import { tool } from "ai";
import { z } from "zod";
import { log } from "@/lib/utils/log";
import type { WriterRunContext, EducationEntry } from "../writer/types";

const MODULE = "writer/tool";

const EducationUpdateSchema = z.object({
  institution: z.string().describe("Institution name. Match key together with degree."),
  degree: z.string().describe("Degree name. Match key together with institution."),
  period: z
    .string()
    .optional()
    .describe("Time period as it appears in the profile. Required unless delete is true."),
  delete: z
    .boolean()
    .optional()
    .describe("If true, remove this education entry from the CV."),
});

export function makePatchEducationTool(ctx: WriterRunContext) {
  return tool({
    description:
      "Patch the CV education section by entry. Items are matched against the current education by (institution, degree). " +
      "Matched → replace period (or delete if delete:true). Unmatched → append as new entry. " +
      "Entries not mentioned in this call are preserved.",
    inputSchema: z.object({
      updates: z
        .array(EducationUpdateSchema)
        .min(1)
        .describe("One or more education entries to add, replace, or delete."),
    }),
    execute: async ({ updates }) => {
      const current: EducationEntry[] = ctx.education ?? [];
      const next: EducationEntry[] = [...current];
      const stats = { added: 0, replaced: 0, deleted: 0 };

      for (const upd of updates) {
        const idx = next.findIndex(
          (e) => e.institution === upd.institution && e.degree === upd.degree,
        );
        if (upd.delete) {
          if (idx >= 0) {
            next.splice(idx, 1);
            stats.deleted++;
          }
          continue;
        }
        if (!upd.period) {
          return {
            error: `Update for ${upd.institution} / ${upd.degree} must include period or delete:true.`,
          };
        }
        if (idx >= 0) {
          next[idx] = {
            institution: upd.institution,
            degree: upd.degree,
            period: upd.period,
          };
          stats.replaced++;
        } else {
          next.push({
            institution: upd.institution,
            degree: upd.degree,
            period: upd.period,
          });
          stats.added++;
        }
      }

      ctx.education = next;

      log.info(MODULE, "patchEducation", {
        updatesCount: updates.length,
        ...stats,
        finalCount: next.length,
      });
      return { ok: true, ...stats, totalEntries: next.length };
    },
  });
}
