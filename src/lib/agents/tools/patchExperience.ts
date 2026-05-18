import { tool } from "ai";
import { z } from "zod";
import { log } from "@/lib/utils/log";
import type { WriterRunContext, ExperienceEntry } from "../writer/types";

const MODULE = "writer/tool";

const ExperienceUpdateSchema = z.object({
  company: z.string().describe("Company name. Match key together with role and period."),
  role: z.string().describe("Job title. Match key together with company and period."),
  period: z.string().describe("Time period. Match key together with company and role."),
  bullets: z
    .array(z.string())
    .min(1)
    .optional()
    .describe(
      "Full replacement list of bullets for this experience entry. Required unless delete is true.",
    ),
  delete: z
    .boolean()
    .optional()
    .describe("If true, remove this entry from the CV. bullets is ignored."),
});

export function makePatchExperienceTool(ctx: WriterRunContext) {
  return tool({
    description:
      "Patch the CV experience section by entry. Each item is matched against the current experience by (company, role, period). " +
      "Matched item → replace bullets (or delete if delete:true). Unmatched item → append as new entry. " +
      "Entries not mentioned in this call are preserved as-is. " +
      "Send only the entries you need to change; do NOT resend the whole list to keep one bullet edit cheap.",
    inputSchema: z.object({
      updates: z
        .array(ExperienceUpdateSchema)
        .min(1)
        .describe("One or more experience entries to add, replace, or delete."),
    }),
    execute: async ({ updates }) => {
      const current: ExperienceEntry[] = ctx.experience ?? [];
      const next: ExperienceEntry[] = [...current];
      const stats = { added: 0, replaced: 0, deleted: 0 };

      for (const upd of updates) {
        const idx = next.findIndex(
          (e) =>
            e.company === upd.company &&
            e.role === upd.role &&
            e.period === upd.period,
        );
        if (upd.delete) {
          if (idx >= 0) {
            next.splice(idx, 1);
            stats.deleted++;
          }
          continue;
        }
        if (!upd.bullets) {
          return {
            error: `Update for ${upd.company} / ${upd.role} / ${upd.period} must include bullets or delete:true.`,
          };
        }
        if (idx >= 0) {
          next[idx] = { ...next[idx], bullets: upd.bullets };
          stats.replaced++;
        } else {
          next.push({
            company: upd.company,
            role: upd.role,
            period: upd.period,
            bullets: upd.bullets,
          });
          stats.added++;
        }
      }

      ctx.experience = next;

      log.info(MODULE, "patchExperience", {
        updatesCount: updates.length,
        ...stats,
        finalCount: next.length,
      });
      return { ok: true, ...stats, totalEntries: next.length };
    },
  });
}
