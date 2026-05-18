import { describe, it, expect, vi } from "vitest";
import { makeParallelEvaluator } from "../aggregate";
import { node } from "@/lib/agents/workflows/node";
import type { CvSolution } from "../../types";

describe("makeParallelEvaluator", () => {
  it("runs both evaluators every time, even if one had passed previously", async () => {
    const visualExec = vi.fn().mockResolvedValue({ accepted: true, issues: [] });
    const writingExec = vi.fn()
      .mockResolvedValueOnce({ accepted: false, feedback: { writing: { accepted: false, issues: ["fail 1"] } } })
      .mockResolvedValueOnce({ accepted: true, issues: [] });

    const visualEvaluator = node(visualExec);
    const writingEvaluator = node(writingExec);

    const parallelEvaluator = makeParallelEvaluator(visualEvaluator, writingEvaluator);

    const solution1 = {
      imageBase64: "img1",
      pageCount: 1,
      experience: [],
      skillCategories: [],
      education: [],
      pdfPath: "p1.pdf",
    } as unknown as CvSolution;
    const verdict1 = await parallelEvaluator.execute({
      input: {},
      solution: solution1,
    });

    expect(verdict1.accepted).toBe(false);
    expect(visualExec).toHaveBeenCalledTimes(1);
    expect(writingExec).toHaveBeenCalledTimes(1);

    const solution2 = {
      imageBase64: "img2",
      pageCount: 1,
      experience: [],
      skillCategories: [],
      education: [],
      pdfPath: "p2.pdf",
    } as unknown as CvSolution;
    const verdict2 = await parallelEvaluator.execute({
      input: {},
      solution: solution2,
      previousVerdict: verdict1,
    });

    // In the old buggy version, visualExec would NOT have been called here because it passed in verdict1.
    // In the fixed version, it should be called again because solution2 is new.
    expect(verdict2.accepted).toBe(true);
    expect(visualExec).toHaveBeenCalledTimes(2);
    expect(writingExec).toHaveBeenCalledTimes(2);
  });
});
