import { tool } from "ai";
import { z } from "zod";
import { log } from "@/lib/utils/log";
import type { WriterRunContext } from "../writer/types";

const MODULE = "writer/tool";

export function makePatchCoverParagraphsTool(ctx: WriterRunContext) {
  return tool({
    description:
      "Replace the cover letter paragraphs with the supplied array. The cover letter is short (2-4 paragraphs) so it is replaced as a whole. " +
      "Structure: (1) hook + intent; (2) one or two evidence paragraphs each connecting one quoted requirement from the offer to a specific profile outcome; (3) confident close. " +
      "Vary sentence openers. Every fact must be traceable to the candidate profile. Use exactly the target company name where it is referenced.",
    inputSchema: z.object({
      paragraphs: z
        .array(z.string().min(1))
        .min(2)
        .max(4)
        .describe(
          "2-4 short paragraphs, one focused idea each, grounded in the profile and tailored to the offer.",
        ),
    }),
    execute: async ({ paragraphs }) => {
      const totalChars = paragraphs.join("\n").length;
      ctx.coverParagraphs = paragraphs;
      log.info(MODULE, "patchCoverParagraphs", {
        paragraphCount: paragraphs.length,
        chars: totalChars,
      });
      return { ok: true, paragraphs: paragraphs.length, chars: totalChars };
    },
  });
}
