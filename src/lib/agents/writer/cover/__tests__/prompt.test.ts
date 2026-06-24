import { describe, expect, it } from "vitest";

import { COVER_WRITING_EVALUATOR_PROMPT } from "../../evaluate/prompt-writing";
import { PLAN_SYSTEM_PROMPT } from "../../plan/prompt";
import { COVER_SYSTEM_PROMPT } from "../prompt";

describe("cover letter prompt style contract", () => {
  it("requires first-person, direct cover letter prose from plan to evaluation", () => {
    expect(PLAN_SYSTEM_PROMPT).toContain("first-person prose");
    expect(PLAN_SYSTEM_PROMPT).toContain("active-voice claims");

    expect(COVER_SYSTEM_PROMPT).toContain("credible first-person human voice");
    expect(COVER_SYSTEM_PROMPT).toContain("personal interest in applying");
    expect(COVER_SYSTEM_PROMPT).toContain("Use active voice and direct verbs");

    expect(COVER_WRITING_EVALUATOR_PROMPT).toContain("FIRST-PERSON INTENT");
  });
});
