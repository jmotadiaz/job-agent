import type { ExperienceEntry, SkillCategoryEntry } from "../types";

export const REVISION_PLANNER_SYSTEM_PROMPT = `You are a decision-maker for a CV and cover letter revision workflow.

Your job: Given user feedback on a previously generated CV + cover letter pair, decide which document(s) need to be re-edited.

Rules:
- If the feedback mentions bullet content, skill selection, experience phrasing, layout, or anything about the document that lists work experience → editCv = true.
- If the feedback mentions cover letter tone, paragraphs, hook, closing, or anything about the narrative letter → editCover = true.
- If the feedback is generic ("improve everything", "not good enough") → both are true.
- If the feedback is clearly about only one document, set only that one to true.
- Be concise but precise in your rationale: cite what in the feedback triggered each decision.
- You are NOT rewriting anything. You are only deciding what needs editing.`;

export interface RevisionPlannerPromptInput {
  feedbackComment?: string | null;
  feedbackRating?: number | null;
  previousPlan?: {
    priorityRequirements: string[];
    rationaleDraft: string;
  } | null;
  parentCv?: {
    experience: ExperienceEntry[];
    skillCategories: SkillCategoryEntry[];
  } | null;
  parentCoverParagraphs?: string[] | null;
}

export function buildRevisionPlannerPrompt(
  input: RevisionPlannerPromptInput,
): string {
  let prompt = `Decide what needs to be re-edited for this writer iteration.

<iteration_feedback>
Rating: ${input.feedbackRating != null ? `${input.feedbackRating}/5` : "none"}
User comment: ${JSON.stringify(input.feedbackComment ?? null)}
</iteration_feedback>
`;

  if (input.previousPlan) {
    prompt += `\n<previous_plan>\n`;
    if (input.previousPlan.priorityRequirements.length > 0) {
      prompt += `Priority requirements:\n`;
      for (const [
        index,
        requirement,
      ] of input.previousPlan.priorityRequirements.entries()) {
        prompt += `${index + 1}. ${requirement}\n`;
      }
    } else {
      prompt += `Priority requirements: none recorded\n`;
    }
    prompt += `Rationale draft: ${input.previousPlan.rationaleDraft || "none recorded"}\n`;
    prompt += `</previous_plan>\n`;
  }

  if (input.parentCv) {
    const bulletCount = input.parentCv.experience.reduce(
      (sum, experience) => sum + experience.bullets.length,
      0,
    );
    prompt += `\n<parent_cv_summary>\n`;
    prompt += `Experiences: ${input.parentCv.experience.length}\n`;
    prompt += `Bullets: ${bulletCount}\n`;
    prompt += `Skill categories: ${input.parentCv.skillCategories.length}\n`;
    prompt += `</parent_cv_summary>\n`;
  }

  if (input.parentCoverParagraphs) {
    prompt += `\n<parent_cover_summary>\n`;
    prompt += `Paragraphs: ${input.parentCoverParagraphs.length}\n`;
    prompt += `</parent_cover_summary>\n`;
  }

  prompt += `
<output_format>
Return only a JSON object matching this exact structure:
\`\`\`json
{
  "editCv": true,
  "editCover": true,
  "rationale": "Briefly explain which feedback signal triggered each decision."
}
\`\`\`

Use JSON booleans, not strings. Set both booleans to true when the feedback is broad
or ambiguous.
</output_format>`;

  return prompt;
}
