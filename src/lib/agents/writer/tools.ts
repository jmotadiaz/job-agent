import { tool } from "ai";
import { z } from "zod";
import { log } from "@/lib/utils/log";

const MODULE = "writer/tool";

export interface WriterRunContext {
  bullets: Array<{ bulletId: string; renderedText: string }> | null;
  skillItems: string[] | null;
  coverParagraphs: string[] | null;
  finalized: boolean;
  availableBulletIds: Set<string>;
  availableSkills: string[];
}

export function makeWriterTools(ctx: WriterRunContext) {
  return {
    selectBullets: tool({
      description:
        "Select, order and SYNTHESIZE the profile bullets for the CV. The CV must fit on a single A4 page — narrative belongs in the cover letter, not here. Budget by recency: current/most recent role gets 4-6 bullets up to ~20-25 words (strongest evidence); mid roles 2-3 bullets at ~14-18 words; older roles 0-2 bullets at ~10-14 words — drop older roles entirely if nothing speaks to the offer. Hard max 28 words per bullet, two lines max on the PDF. Structure: action verb + what + tech + quantified outcome. Cut 'enabling...' / 'establishing foundation for...' / 'so that...' tails and filler adjectives (scalable, robust, fluid, intuitive, seamless, etc.). Aim for ~10-14 bullets total; when over budget, cut from the oldest end first. BulletIds must belong to the catalog provided in the prompt. Do not introduce facts absent from the profile.",
      inputSchema: z.object({
        items: z
          .array(
            z.object({
              bulletId: z
                .string()
                .describe("ID of the bullet from the profile catalog"),
              renderedText: z
                .string()
                .describe(
                  "Telegraphic CV line. Length follows recency: most recent role up to ~20-25 words, mid roles ~14-18, older roles ~10-14 (28 max anywhere, 2 PDF lines max). Action verb + what + tech + quantified outcome. No narrative tails, no filler adjectives — those go in the cover letter.",
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
    }),

    selectSkills: tool({
      description:
        "Select the skills to display in the CV's Skills section. Pick only skills from the available catalog that are relevant to this specific offer. Merge everything into a single flat list — no categories. Aim for 6-12 items: prioritize technologies and practices explicitly required or valued by the offer; drop generic or outdated items that add no signal for this role. Order by relevance (most critical to the offer first).",
      inputSchema: z.object({
        items: z
          .array(z.string().min(1))
          .min(1)
          .max(15)
          .describe(
            "Ordered list of skill names from the catalog, most offer-relevant first. Single flat list — no categories.",
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
    }),

    composeCoverLetter: tool({
      description:
        "Write the body of the cover letter as an array of paragraphs. Each paragraph must be grounded in facts from the profile and the offer. Do not invent experience.",
      inputSchema: z.object({
        paragraphs: z.array(z.string().min(1)).min(2).max(6),
      }),
      execute: async ({ paragraphs }) => {
        const totalChars = paragraphs.join("\n").length;
        log.info(MODULE, "composeCoverLetter begin", {
          paragraphCount: paragraphs.length,
        });
        ctx.coverParagraphs = paragraphs;
        log.info(MODULE, "composeCoverLetter end", {
          paragraphs: paragraphs.length,
          chars: totalChars,
        });
        return { ok: true, paragraphs: paragraphs.length, chars: totalChars };
      },
    }),

    finalizeGeneration: tool({
      description:
        "Finalize the CV and cover letter generation. Only call after selectBullets, selectSkills, and composeCoverLetter.",
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
        ctx.finalized = true;
        log.info(MODULE, "finalizeGeneration end", {
          bulletCount: ctx.bullets.length,
          skillCount: ctx.skillItems.length,
          paragraphCount: ctx.coverParagraphs.length,
        });
        return { ok: true };
      },
    }),
  };
}
