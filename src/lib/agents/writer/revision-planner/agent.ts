import { z } from "zod";
import { opencodeGo } from "@/lib/agents/provider";
import { generateObject } from "ai";
import { node } from "@/lib/agents/workflows/node";
import { log } from "@/lib/utils/log";
import {
  buildRevisionPlannerPrompt,
  REVISION_PLANNER_SYSTEM_PROMPT,
  type RevisionPlannerPromptInput,
} from "./prompt";

const MODULE = "writer/revision-planner";

const RevisionDecisionSchema = z.object({
  editCv: z.boolean().describe("true if the CV needs re-editing based on feedback"),
  editCover: z.boolean().describe("true if the cover letter needs re-editing based on feedback"),
  rationale: z.string().describe("Brief justification of why each document needs editing or not"),
});

export type RevisionPlannerInput = RevisionPlannerPromptInput;

export interface RevisionDecision {
  editCv: boolean;
  editCover: boolean;
  rationale: string;
}

export const revisionPlannerNode = node(
  async (input: RevisionPlannerInput): Promise<RevisionDecision> => {
    const model = "deepseek-v4-flash";
    const t0 = Date.now();

    const prompt = buildRevisionPlannerPrompt(input);

    log.info(MODULE, "revision planner begin", {
      model,
      hasFeedback: !!input.feedbackComment,
      rating: input.feedbackRating,
      promptLen: prompt.length,
    });

    const { object } = await generateObject({
      model: opencodeGo(model),
      schema: RevisionDecisionSchema,
      system: REVISION_PLANNER_SYSTEM_PROMPT,
      prompt,
    });

    log.info(MODULE, "revision planner end", {
      editCv: object.editCv,
      editCover: object.editCover,
      rationale: object.rationale,
      duration: Date.now() - t0,
    });

    return object as RevisionDecision;
  },
);
