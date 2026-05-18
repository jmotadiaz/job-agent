import { describe, it, expect, vi } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("server-only", () => ({}));

import { writingCoverEvaluator } from "../writing";
import { generateObject } from "ai";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

describe("writingCoverEvaluator", () => {
  it("replaces <target_company> in the system prompt", async () => {
    const mockGenerateObject = vi.mocked(generateObject);
    mockGenerateObject.mockResolvedValue({
      object: { accepted: true, issues: [] },
      finishReason: "stop",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    } as unknown as any);

    const input = {
      company: "Qualifyze",
      profileContent: "Senior engineer at past company.",
    };

    const solution = {
      paragraphs: ["Hello Qualifyze"],
    };

    await (writingCoverEvaluator as any).execute({ input, solution });

    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("cover letter targeting Qualifyze"),
      })
    );

    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.not.stringContaining("<target_company>"),
      })
    );
  });

  it("handles CV writing evaluation without placeholders", async () => {
    const { writingCvEvaluator } = await import("../writing");
    const mockGenerateObject = vi.mocked(generateObject);
    mockGenerateObject.mockResolvedValue({
      object: { accepted: true, issues: [] },
      finishReason: "stop",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    } as unknown as any);

    const input = {
      company: "Any Company",
      profileContent: "Profile body.",
    };

    const solution = {
      experience: [],
      skillCategories: [],
      education: [],
    };

    await (writingCvEvaluator as any).execute({ input, solution });

    expect(mockGenerateObject).toHaveBeenCalled();
  });
});
