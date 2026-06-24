import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  makeRunId,
  runWithContext,
  getCurrentRunContext,
  nextSequenceNumber,
} from "../run-context";

let tmpDir: string;
let previousDisableRunLogs: string | undefined;

beforeEach(() => {
  previousDisableRunLogs = process.env.JOB_AGENT_DISABLE_RUN_LOGS;
  process.env.JOB_AGENT_DISABLE_RUN_LOGS = "0";
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "run-ctx-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (previousDisableRunLogs === undefined) {
    delete process.env.JOB_AGENT_DISABLE_RUN_LOGS;
  } else {
    process.env.JOB_AGENT_DISABLE_RUN_LOGS = previousDisableRunLogs;
  }
});

describe("makeRunId", () => {
  it("produces <ISO>_<nanoid8> format", () => {
    const id = makeRunId();
    expect(id).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(-\d{3}Z?)?_[A-Za-z0-9_-]{8}$/);
  });

  it("produces unique ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => makeRunId()));
    expect(ids.size).toBe(50);
  });

  it("is lexicographically sortable by time", async () => {
    const id1 = makeRunId();
    await new Promise((r) => setTimeout(r, 10));
    const id2 = makeRunId();
    expect(id1 < id2).toBe(true);
  });
});

describe("getCurrentRunContext", () => {
  it("returns undefined outside runWithContext", () => {
    expect(getCurrentRunContext()).toBeUndefined();
  });

  it("returns the context inside runWithContext", async () => {
    const runDir = path.join(tmpDir, "test-run");
    await runWithContext(
      { runId: "test-123", runDir, kind: "scout", input: { q: "test" } },
      async () => {
        const ctx = getCurrentRunContext();
        expect(ctx).toBeDefined();
        expect(ctx!.runId).toBe("test-123");
        expect(ctx!.kind).toBe("scout");
        expect(ctx!.runDir).toBe(runDir);
      },
    );
  });
});

describe("runWithContext", () => {
  it("creates meta.json with initial fields at start", async () => {
    const runDir = path.join(tmpDir, "meta-test");
    await runWithContext(
      { runId: "meta-1", runDir, kind: "writer", input: { jobId: "j1" } },
      async () => {
        const meta = JSON.parse(
          fs.readFileSync(path.join(runDir, "meta.json"), "utf8"),
        );
        expect(meta.runId).toBe("meta-1");
        expect(meta.kind).toBe("writer");
        expect(meta.input).toEqual({ jobId: "j1" });
        expect(meta.startedAt).toBeDefined();
      },
    );
  });

  it("writes final meta.json with outcome=ok on success", async () => {
    const runDir = path.join(tmpDir, "meta-final");
    await runWithContext(
      { runId: "meta-2", runDir, kind: "scout", input: {} },
      async () => 42,
    );
    const meta = JSON.parse(
      fs.readFileSync(path.join(runDir, "meta.json"), "utf8"),
    );
    expect(meta.outcome).toBe("ok");
    expect(meta.finishedAt).toBeDefined();
    expect(meta.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("writes final meta.json with outcome=error on throw", async () => {
    const runDir = path.join(tmpDir, "meta-err");
    await expect(
      runWithContext(
        { runId: "meta-3", runDir, kind: "manual", input: { url: "x" } },
        async () => {
          throw new Error("boom");
        },
      ),
    ).rejects.toThrow("boom");

    const meta = JSON.parse(
      fs.readFileSync(path.join(runDir, "meta.json"), "utf8"),
    );
    expect(meta.outcome).toBe("error");
    expect(meta.result.message).toBe("boom");
  });

  it("creates artifacts/ subdirectory", async () => {
    const runDir = path.join(tmpDir, "artifacts-test");
    await runWithContext(
      { runId: "art-1", runDir, kind: "scout", input: {} },
      async () => {},
    );
    expect(fs.existsSync(path.join(runDir, "artifacts"))).toBe(true);
  });

  it("is safe for concurrent runs", async () => {
    const runDirA = path.join(tmpDir, "concurrent-a");
    const runDirB = path.join(tmpDir, "concurrent-b");

    const [resultA, resultB] = await Promise.all([
      runWithContext(
        { runId: "a", runDir: runDirA, kind: "scout", input: {} },
        async () => {
          await new Promise((r) => setTimeout(r, 20));
          return getCurrentRunContext()!.runId;
        },
      ),
      runWithContext(
        { runId: "b", runDir: runDirB, kind: "writer", input: {} },
        async () => {
          await new Promise((r) => setTimeout(r, 20));
          return getCurrentRunContext()!.runId;
        },
      ),
    ]);

    expect(resultA).toBe("a");
    expect(resultB).toBe("b");
  });
});

describe("nextSequenceNumber", () => {
  it("throws outside runWithContext", () => {
    expect(() => nextSequenceNumber()).toThrow("requires an active run context");
  });

  it("returns incrementing numbers within a run", async () => {
    const runDir = path.join(tmpDir, "seq-test");
    await runWithContext(
      { runId: "seq-1", runDir, kind: "scout", input: {} },
      async () => {
        expect(nextSequenceNumber()).toBe(1);
        expect(nextSequenceNumber()).toBe(2);
        expect(nextSequenceNumber()).toBe(3);
      },
    );
  });
});
