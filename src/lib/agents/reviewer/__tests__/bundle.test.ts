import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { buildRunBundle } from "../bundle";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reviewer-bundle-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("buildRunBundle", () => {
  it("serializes a mock run into markdown sections", () => {
    const runDir = path.join(tmpDir, "run-1");
    fs.mkdirSync(runDir, { recursive: true });
    fs.mkdirSync(path.join(runDir, "artifacts"), { recursive: true });

    // Meta
    fs.writeFileSync(
      path.join(runDir, "meta.json"),
      JSON.stringify({
        runId: "2026-05-04T08-00-00Z_abc123",
        kind: "scout",
        startedAt: "2026-05-04T08:00:00.000Z",
        finishedAt: "2026-05-04T08:01:30.000Z",
        duration_ms: 90000,
        outcome: "match",
        input: { query: "software engineer" },
        result: { jobId: "job-123" },
      }),
    );

    // Timeline
    fs.writeFileSync(
      path.join(runDir, "timeline.jsonl"),
      [
        JSON.stringify({ ts: "2026-05-04T08:00:01Z", level: "info", module: "scout/orchestrator", event: "agent invoke begin" }),
        JSON.stringify({ ts: "2026-05-04T08:01:00Z", level: "info", module: "scout/orchestrator", event: "agent result", payload: { kind: "match" } }),
      ].join("\n") + "\n",
    );

    // Agent trace
    fs.writeFileSync(
      path.join(runDir, "agent-trace.jsonl"),
      JSON.stringify({
        ts: "2026-05-04T08:00:30Z",
        step: 0,
        messages: "Evaluating candidates...",
        toolCalls: [{ name: "openSearch", args: { query: "software engineer" } }],
        toolResults: [{ name: "openSearch", output: { jobs: [] } }],
        finishReason: "tool-calls",
      }) + "\n",
    );

    // Artifacts
    fs.writeFileSync(path.join(runDir, "artifacts", "01_openSearch.snapshot.json"), JSON.stringify({ url: "..." }));

    const bundle = buildRunBundle(runDir);

    expect(bundle).toContain("## Meta");
    expect(bundle).toContain("Run ID:** 2026-05-04T08-00-00Z_abc123");
    expect(bundle).toContain("Kind:** scout");
    expect(bundle).toContain("Duration:** 90000ms");
    expect(bundle).toContain("Outcome:** match");

    expect(bundle).toContain("## Timeline");
    expect(bundle).toContain("agent invoke begin");
    expect(bundle).toContain("agent result");

    expect(bundle).toContain("## Agent Trace");
    expect(bundle).toContain("Step 0");
    expect(bundle).toContain("openSearch");

    expect(bundle).toContain("## Artifacts (resumen)");
    expect(bundle).toContain("01_openSearch.snapshot.json");
  });

  it("handles missing files gracefully", () => {
    const runDir = path.join(tmpDir, "run-empty");
    fs.mkdirSync(runDir, { recursive: true });

    const bundle = buildRunBundle(runDir);
    expect(bundle).toBe("");
  });

  it("only lists artifacts by name and size, not full content", () => {
    const runDir = path.join(tmpDir, "run-2");
    fs.mkdirSync(runDir, { recursive: true });
    fs.mkdirSync(path.join(runDir, "artifacts"), { recursive: true });

    // Large artifact
    fs.writeFileSync(
      path.join(runDir, "artifacts", "01_large.json"),
      JSON.stringify({ data: "x".repeat(10000) }),
    );

    const bundle = buildRunBundle(runDir);
    expect(bundle).toContain("01_large.json");
    expect(bundle).toContain("bytes");
    expect(bundle).not.toContain("x".repeat(100));
  });
});
