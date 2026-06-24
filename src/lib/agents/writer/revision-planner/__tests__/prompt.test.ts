import { describe, expect, it } from "vitest";

import {
  buildRevisionPlannerPrompt,
  REVISION_PLANNER_SYSTEM_PROMPT,
} from "../prompt";

describe("revision planner prompt", () => {
  it("mentions JSON for structured-output provider compatibility", () => {
    const prompt = buildRevisionPlannerPrompt({
      feedbackRating: 2,
      feedbackComment: "Improve the CV bullets and make the letter warmer",
      previousPlan: {
        priorityRequirements: ["React ownership", "Design systems"],
        rationaleDraft: "Selected frontend evidence for the target role.",
      },
      parentCv: {
        experience: [
          {
            company: "CoolCo",
            role: "Frontend Engineer",
            period: "2020-2024",
            bullets: ["Built React apps", "Led design system work"],
          },
        ],
        skillCategories: [{ label: "Core", items: ["React", "TypeScript"] }],
      },
      parentCoverParagraphs: ["Dear CoolCo,", "I can help..."],
    });

    expect(prompt).toMatch(/\bjson\b/i);
    expect(prompt).toContain("<previous_plan>");
    expect(prompt).toContain("React ownership");
    expect(prompt).toContain('"editCv": true');
    expect(prompt).toContain('"editCover": true');
    expect(prompt).toContain('"rationale"');
  });

  it("keeps decision rules in the system prompt", () => {
    expect(REVISION_PLANNER_SYSTEM_PROMPT).toContain(
      "You are NOT rewriting anything",
    );
  });
});
