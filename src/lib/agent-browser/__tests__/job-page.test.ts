import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetText } = vi.hoisted(() => ({
  mockGetText: vi.fn(),
}));

vi.mock("@/lib/agent-browser/exec", () => ({
  getText: mockGetText,
}));

import {
  extractJobPageText,
  isLikelyJobPosting,
} from "@/lib/agent-browser/job-page";

describe("extractJobPageText", () => {
  beforeEach(() => {
    mockGetText.mockReset();
  });

  it("combines LinkedIn header fields with the job description for LLM parsing", async () => {
    mockGetText.mockImplementation(async (selector: string) => {
      const values: Record<string, string> = {
        ".top-card-layout__title": "Senior Software Engineer, Product",
        ".topcard__org-name-link": "RevenueCat",
        ".topcard__flavor--bullet": "Remote",
        ".description__text": "About The Role\nBuild product features.",
      };
      return values[selector] ?? "";
    });

    const result = await extractJobPageText("session-1");

    expect(result.title).toBe("Senior Software Engineer, Product");
    expect(result.company).toBe("RevenueCat");
    expect(result.location).toBe("Remote");
    expect(result.descriptionText).toBe("About The Role\nBuild product features.");
    expect(result.llmText).toBe(
      [
        "Role: Senior Software Engineer, Product",
        "Company: RevenueCat",
        "Location: Remote",
        "",
        "About The Role\nBuild product features.",
      ].join("\n"),
    );
    expect(isLikelyJobPosting(result)).toBe(true);
    expect(mockGetText).toHaveBeenCalledWith(
      ".top-card-layout__title",
      "session-1",
      { optional: true },
    );
  });

  it("falls back across selectors and parses company/location from a header row", async () => {
    mockGetText.mockImplementation(async (selector: string) => {
      const values: Record<string, string> = {
        h1: "Senior Backend Engineer",
        ".topcard__flavor-row": "RevenueCat\nRemote\n2 days ago",
        ".jobs-description__content": "Requirements\n5+ years of experience.",
      };
      return values[selector] ?? "";
    });

    const result = await extractJobPageText("session-2");

    expect(result.title).toBe("Senior Backend Engineer");
    expect(result.company).toBe("RevenueCat");
    expect(result.location).toBe("Remote");
    expect(result.descriptionText).toBe("Requirements\n5+ years of experience.");
  });

  it("rejects LinkedIn's generic landing page as a job posting", () => {
    expect(
      isLikelyJobPosting({
        title: "Welcome to your professional community",
        company: "",
        location: "",
        descriptionText:
          "Welcome to your professional community\nExplore top LinkedIn content\nJoin your colleagues, classmates, and friends on LinkedIn",
        llmText: "",
      }),
    ).toBe(false);
  });
});
