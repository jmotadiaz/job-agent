import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import * as fs from "node:fs";
import * as path from "node:path";
import { POST } from "../route";

import { LOG_DIR } from "@/lib/runtime/paths";

vi.mock("@/lib/agents/reviewer/run", () => ({
  reviewRun: vi.fn().mockImplementation(async (runId: string) => {
    const review = `## Analysis\n\nThis is a mock review generated for testing.\n\n### Observations\n- The run completed successfully.`;
    const reviewPath = path.join(LOG_DIR, runId, "review.md");
    fs.mkdirSync(path.dirname(reviewPath), { recursive: true });
    fs.writeFileSync(reviewPath, review, "utf8");
    return review;
  }),
}));

describe("POST /api/log/[runId]/review", () => {
  const runId = "testreviewrun_abc123";
  const runDir = path.join(LOG_DIR, runId);

  beforeEach(() => {
    fs.mkdirSync(runDir, { recursive: true });

    fs.writeFileSync(
      path.join(runDir, "meta.json"),
      JSON.stringify({
        runId,
        kind: "scout",
        startedAt: "2026-05-04T08:00:00.000Z",
        duration_ms: 30000,
        outcome: "match",
      }),
    );
  });

  afterEach(() => {
    if (fs.existsSync(runDir)) {
      fs.rmSync(runDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("generates and persists a review for an existing run", async () => {
    const response = await POST(
      new Request("http://localhost/api/log/" + runId + "/review"),
      { params: Promise.resolve({ runId }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.review).toContain("Analysis");
    expect(body.review).toContain("mock review");

    const reviewPath = path.join(runDir, "review.md");
    expect(fs.existsSync(reviewPath)).toBe(true);
    const persistedReview = fs.readFileSync(reviewPath, "utf8");
    expect(persistedReview).toContain("mock review");
  });

  it("returns 404 for a non-existent run", async () => {
    const response = await POST(
      new Request("http://localhost/api/log/nonexistent/review"),
      { params: Promise.resolve({ runId: "nonexistent" }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toContain("not found");
  });
});
