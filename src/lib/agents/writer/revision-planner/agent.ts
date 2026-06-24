import { z } from "zod";
import { opencodeGo } from "@/lib/agents/provider";
import { generateObject } from "ai";
import { node } from "@/lib/agents/workflows/node";
import { log } from "@/lib/utils/log";
import { REVISION_PLANNER_SYSTEM_PROMPT } from "./prompt";
import type { ExperienceEntry, SkillCategoryEntry } from "../types";

const MODULE = "writer/revision-planner";

const RevisionDecisionSchema = z.object({
  editCv: z.boolean().describe("true if the CV needs re-editing based on feedback"),
  editCover: z.boolean().describe("true if the cover letter needs re-editing based on feedback"),
  rationale: z.string().describe("Brief justification of why each document needs editing or not"),
});

export interface RevisionPlannerInput {
  feedbackComment?: string | null;
  feedbackRating?: number | null;
  parentCv?: {
    experience: ExperienceEntry[];
    skillCategories: SkillCategoryEntry[];
  } | null;
  parentCoverParagraphs?: string[] | null;
}

export interface RevisionDecision {
  editCv: boolean;
  editCover: boolean;
  rationale: string;
}

export const revisionPlannerNode = node(
  async (input: RevisionPlannerInput): Promise<RevisionDecision> => {
    const model = "deepseek-v4-flash";
    const t0 = Date.now();

    let prompt = `The user has reviewed a previously generated CV and cover letter pair. Decide what needs to be re-edited.\n\n`;

    if (input.feedbackRating) {
      prompt += `Rating: ${input.feedbackRating}/5\n`;
    }

    if (input.feedbackComment) {
      prompt += `User comment: "${input.feedbackComment}"\n`;
    } else {
      prompt += `User comment: (none)\n`;
    }

    if (input.parentCv) {
      const bulletCount = input.parentCv.experience.reduce(
        (sum, e) => sum + e.bullets.length, 0,
      );
      prompt += `\nParent CV: ${input.parentCv.experience.length} experiences, ${bulletCount} bullets, ${input.parentCv.skillCategories.length} skill categories.\n`;
    }

    if (input.parentCoverParagraphs) {
      prompt += `Parent cover letter: ${input.parentCoverParagraphs.length} paragraphs.\n`;
    }

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
