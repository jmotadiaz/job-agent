import { tool } from "ai";
import { z } from "zod";
import { log } from "@/lib/utils/log";
import type { WriterRunContext } from "../types";

const MODULE = "writer/tool";

export function makeComposeCoverLetterTool(ctx: WriterRunContext) {
  return tool({
    description:
      "Submit the cover letter body as 2-4 short paragraphs (single-page constraint). Recommended structure: (1) hook + intent -- who, which role, one specific reason this offer/company drew the candidate; do NOT open with 'I am writing to apply for...'; (2) one or two paragraphs of evidence -- pick the strongest profile outcomes and connect each to a requirement named in the offer, reframed in different voice from the CV (no verbatim duplication of bullets); (3) brief, confident close -- no cliches ('I would love the opportunity...'). Vary sentence openers (avoid starting most sentences with 'I'). Every fact must be traceable to the profile.",
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
  });
}
