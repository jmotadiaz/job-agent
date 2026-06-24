import { z } from "zod";
import { opencodeGo } from "@/lib/agents/provider";
import { generateObject } from "ai";
import { node } from "@/lib/agents/workflows/node";
import { log } from "@/lib/utils/log";
import type { EvaluatorInput } from "@/lib/agents/workflows/evaluator-optimizer";
import type { CvSolution, CoverSolution, VisualFeedback, CompositeFeedback } from "../types";
import {
  CV_VISUAL_EVALUATOR_PROMPT,
  COVER_VISUAL_EVALUATOR_PROMPT,
} from "./prompt-visual";

const MODULE = "writer/evaluate/visual";

const VisualVerdictSchema = z.object({
  accepted: z.boolean(),
  issues: z.array(z.string()),
});

function makeVisualEvaluator<TIn, TSolution extends CvSolution | CoverSolution>(
  prompt: string,
  artifactName: string,
) {
  return node(async (evalInput: EvaluatorInput<TIn, TSolution, CompositeFeedback>): Promise<VisualFeedback> => {
    const { solution } = evalInput;
    const t0 = Date.now();

    if (solution.pageCount > 1) {
      const artifactLabel = artifactName === "cv" ? "CV" : "Cover Letter";
      const instruction = artifactName === "cv"
        ? "Reduce the number of bullets or shorten the descriptions."
        : "Shorten the paragraphs or remove one.";

      const issue = `${artifactLabel} spans ${solution.pageCount} pages; hard constraint is exactly 1. ` +
        `The content is too long. ${instruction}`;

      log.info(MODULE, `${artifactName} visual evaluation short-circuit`, {
        pageCount: solution.pageCount,
      });
      return { accepted: false, issues: [issue] };
    }

    const model = "mimo-v2.5";

    log.info(MODULE, `${artifactName} visual evaluation begin`, {
      model,
      imageLength: solution.imageBase64.length,
      pageCount: solution.pageCount,
    });

    const { object } = await generateObject({
      model: opencodeGo(model),
      schema: VisualVerdictSchema,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image",
              image: `data:image/png;base64,${solution.imageBase64}`,
            },
          ],
        },
      ],
    });

    log.info(MODULE, `${artifactName} visual evaluation end`, {
      accepted: object.accepted,
      issues: object.issues,
      duration: Date.now() - t0,
    });

    return {
      accepted: object.accepted,
      issues: object.issues,
    };
  });
}

export const visualCvEvaluator = makeVisualEvaluator(
  CV_VISUAL_EVALUATOR_PROMPT,
  "cv",
);

export const visualCoverEvaluator = makeVisualEvaluator(
  COVER_VISUAL_EVALUATOR_PROMPT,
  "cover",
);
