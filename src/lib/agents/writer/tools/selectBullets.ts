import { tool } from "ai";
import { z } from "zod";
import { log } from "@/lib/utils/log";
import type { WriterRunContext } from "../types";

const MODULE = "writer/tool";

export function makeSelectBulletsTool(ctx: WriterRunContext) {
  return tool({
    description:
      "Submit the ordered list of CV bullets selected and rewritten for this specific offer. Each renderedText must (1) open with a strong action verb (no weak openers like 'Worked on'/'Helped with'/'Was responsible for', no participles, no personal pronouns), (2) follow the recency budget -- most recent role: 4-6 bullets ~20-25 words; mid roles: 2-3 at ~14-18; older roles: 0-2 at ~10-14; 28 word hard max anywhere, 2 PDF lines max -- and (3) stay traceable to a fact in the profile. Use compact punctuation (semicolons, slashes, em-dashes), drop filler adjectives, drop narrative tails ('enabling...', 'so that...', 'establishing foundation for...'). Aim for ~10-14 bullets total; cut from the oldest end first when over budget. BulletIds must come from the catalog in the prompt.",
    inputSchema: z.object({
      items: z
        .array(
          z.object({
            bulletId: z
              .string()
              .describe("Bullet ID from the catalog provided in the prompt."),
            renderedText: z
              .string()
              .describe(
                "Telegraphic CV line. Pattern: [action verb] + [what was built/changed] + [tech, if relevant] + [quantified outcome, if any]. Length by recency: most recent ~20-25 words, mid ~14-18, older ~10-14, 28 word hard max. No pronouns, no narrative tails, no filler adjectives -- those belong in the cover letter.",
              ),
          }),
        )
        .min(1),
    }),
    execute: async ({ items }) => {
      log.info(MODULE, "selectBullets begin", {
        count: items.length,
        ids: items.map((i) => i.bulletId),
      });
      const invalid = items.filter(
        (i) => !ctx.availableBulletIds.has(i.bulletId),
      );
      if (invalid.length > 0) {
        log.warn(MODULE, "selectBullets: invalid bulletIds", {
          invalid: invalid.map((i) => i.bulletId),
        });
        return {
          error: `Invalid bulletIds: ${invalid.map((i) => i.bulletId).join(", ")}. You may only use IDs from the catalog.`,
        };
      }
      ctx.bullets = items;
      log.info(MODULE, "selectBullets end", { selected: items.length });
      return { ok: true, selected: items.length };
    },
  });
}
