import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDismissBlockingOverlays,
  mockExtractJobPageText,
  mockGenerateObject,
  mockIsLikelyJobPosting,
  mockLogInfo,
  mockLogWarn,
  mockOpenUrl,
  mockOpencodeGo,
  mockWaitForSelector,
  mockModel,
} = vi.hoisted(() => ({
  mockDismissBlockingOverlays: vi.fn(),
  mockExtractJobPageText: vi.fn(),
  mockGenerateObject: vi.fn(),
  mockIsLikelyJobPosting: vi.fn(),
  mockLogInfo: vi.fn(),
  mockLogWarn: vi.fn(),
  mockOpenUrl: vi.fn(),
  mockOpencodeGo: vi.fn(),
  mockWaitForSelector: vi.fn(),
  mockModel: { modelId: "mock-model" },
}));

vi.mock("ai", () => ({
  generateObject: mockGenerateObject,
}));

vi.mock("@/lib/agent-browser/exec", () => ({
  dismissBlockingOverlays: mockDismissBlockingOverlays,
  openUrl: mockOpenUrl,
  waitForSelector: mockWaitForSelector,
}));

vi.mock("@/lib/agent-browser/job-page", () => ({
  extractJobPageText: mockExtractJobPageText,
  isLikelyJobPosting: mockIsLikelyJobPosting,
}));

vi.mock("@/lib/agents/provider", () => ({
  opencodeGo: mockOpencodeGo,
}));

vi.mock("@/lib/utils/log", () => ({
  log: {
    info: mockLogInfo,
    warn: mockLogWarn,
  },
}));

import {
  JOB_OFFER_PAGE_LOADED_SELECTOR,
  JobOfferExtractionError,
  extractJobOfferFromCurrentPage,
  extractJobOfferFromUrl,
} from "@/lib/agents/job-offer/extractor";

describe("job offer extractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenUrl.mockResolvedValue(undefined);
    mockWaitForSelector.mockResolvedValue(undefined);
    mockDismissBlockingOverlays.mockResolvedValue(undefined);
    mockOpencodeGo.mockReturnValue(mockModel);
    mockIsLikelyJobPosting.mockReturnValue(true);
    mockExtractJobPageText.mockResolvedValue({
      title: "Senior Product Engineer",
      company: "RevenueCat",
      location: "Remote",
      descriptionText:
        "About the role\nBuild billing infrastructure and collaborate with product teams on customer-facing systems.",
      llmText:
        "Role: Senior Product Engineer\nCompany: RevenueCat\nLocation: Remote\n\nAbout the role\nBuild billing infrastructure and collaborate with product teams on customer-facing systems.",
    });
    mockGenerateObject.mockResolvedValue({
      object: {
        role: "Software Engineer",
        company: "Not specified",
        location: "Not specified",
        remote: "yes",
        contract: "full-time",
        experience_required: "5+ years",
        role_type: "fullstack",
        primary_tech: ["TypeScript", "React"],
        secondary_tech: ["Python"],
        key_responsibilities: ["Build product features"],
        salary: "Not specified",
        hard_blockers: [],
      },
    });
  });

  it("loads a URL and extracts one structured offer using page header fallbacks", async () => {
    const result = await extractJobOfferFromUrl(
      "https://www.linkedin.com/jobs/view/123",
      "session-1",
      { logModule: "test" },
    );

    expect(mockOpenUrl).toHaveBeenCalledWith(
      "https://www.linkedin.com/jobs/view/123",
      "session-1",
    );
    expect(mockWaitForSelector).toHaveBeenCalledWith(
      JOB_OFFER_PAGE_LOADED_SELECTOR,
      "session-1",
      undefined,
    );
    expect(mockGenerateObject).toHaveBeenCalledOnce();
    expect(mockGenerateObject.mock.calls[0][0].prompt).toContain(
      "Role: Senior Product Engineer",
    );
    expect(result.title).toBe("Senior Product Engineer");
    expect(result.company).toBe("RevenueCat");
    expect(result.location).toBe("Remote");
    expect(result.rawLen).toBe(result.rawText.length);
    expect(result.descriptionMd).toContain(
      "- **Role:** Senior Product Engineer",
    );
  });

  it("rejects unsupported pages before calling the LLM", async () => {
    mockIsLikelyJobPosting.mockReturnValue(false);

    await expect(
      extractJobOfferFromCurrentPage("session-2"),
    ).rejects.toBeInstanceOf(JobOfferExtractionError);
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("dismisses overlays and retries when the job description selector is late", async () => {
    mockWaitForSelector
      .mockRejectedValueOnce(new Error("late selector"))
      .mockResolvedValueOnce(undefined);

    await extractJobOfferFromUrl(
      "https://www.linkedin.com/jobs/view/456",
      "session-3",
      {
        firstWaitMs: 15_000,
        retryWaitMs: 5_000,
      },
    );

    expect(mockWaitForSelector).toHaveBeenNthCalledWith(
      1,
      JOB_OFFER_PAGE_LOADED_SELECTOR,
      "session-3",
      15_000,
    );
    expect(mockWaitForSelector).toHaveBeenNthCalledWith(
      2,
      JOB_OFFER_PAGE_LOADED_SELECTOR,
      "session-3",
      5_000,
    );
    expect(mockDismissBlockingOverlays).toHaveBeenCalledWith("session-3");
  });
});
