import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runWithContext } from "@/lib/runtime/run-context";
import { dismissBlockingOverlays } from "@/lib/agent-browser/exec";

let tmpDir: string;
let snapshotQueue: Array<{ snapshot: string; refs: Record<string, unknown> }>;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dismiss-test-"));
  snapshotQueue = [];
  mockExecFile.mockClear();

  mockExecFile.mockImplementation(
    (_cmd: string, args: string[], _opts: unknown, cb: Function) => {
      const hasSnapshot = args.includes("snapshot");
      const hasClick = args.includes("click");

      if (hasSnapshot) {
        const data = snapshotQueue.shift() ?? { snapshot: "", refs: {} };
        cb(null, { stdout: JSON.stringify({ success: true, data }), stderr: "" });
      } else {
        cb(null, { stdout: JSON.stringify({ success: true }), stderr: "" });
      }
    },
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("dismissBlockingOverlays", () => {
  it("emits dismiss-hit when a dismiss pattern matches", async () => {
    const runDir = path.join(tmpDir, "run-1");
    fs.mkdirSync(runDir, { recursive: true });

    snapshotQueue.push({
      snapshot: '- button "Descartar" [ref=e123]\n- link "Job" [ref=e456]',
      refs: {},
    });
    snapshotQueue.push({ snapshot: "", refs: {} });

    await runWithContext(
      { runId: "dismiss-1", runDir, kind: "scout", input: {} },
      async () => {
        await dismissBlockingOverlays();
      },
    );

    const clickCalls = mockExecFile.mock.calls.filter(
      (c: any[]) => c[1]?.includes("click") && c[1]?.includes("@e123"),
    );
    expect(clickCalls.length).toBeGreaterThan(0);

    const timelinePath = path.join(runDir, "timeline.jsonl");
    expect(fs.existsSync(timelinePath)).toBe(true);
    const lines = fs.readFileSync(timelinePath, "utf8").trim().split("\n");
    const events = lines.map((l) => JSON.parse(l));
    const hitEvent = events.find((e: any) => e.event === "dismiss-hit");
    expect(hitEvent).toBeDefined();
    expect(hitEvent.payload.kind).toBe("login-wall");
  });

  it("emits dismiss-hit for cookie banner", async () => {
    const runDir = path.join(tmpDir, "run-2");
    fs.mkdirSync(runDir, { recursive: true });

    snapshotQueue.push({
      snapshot: '- link "Jobs" [ref=e100]',
      refs: {},
    });
    snapshotQueue.push({
      snapshot: '- button "Accept all" [ref=e200]',
      refs: {},
    });

    await runWithContext(
      { runId: "dismiss-2", runDir, kind: "scout", input: {} },
      async () => {
        await dismissBlockingOverlays("test-session");
      },
    );

    const clickCalls = mockExecFile.mock.calls.filter(
      (c: any[]) => {
        const args = c[1] as string[];
        return args?.includes("--session") && args?.includes("click") && args?.includes("@e200");
      },
    );
    expect(clickCalls.length).toBeGreaterThan(0);

    const timelinePath = path.join(runDir, "timeline.jsonl");
    const lines = fs.readFileSync(timelinePath, "utf8").trim().split("\n");
    const events = lines.map((l) => JSON.parse(l));
    const hitEvent = events.find(
      (e: any) =>
        e.event === "dismiss-hit" && e.payload.kind === "cookie-banner",
    );
    expect(hitEvent).toBeDefined();
  });

  it("emits dismiss-miss for unknown button in first 30 lines", async () => {
    const runDir = path.join(tmpDir, "run-3");
    fs.mkdirSync(path.join(runDir, "artifacts"), { recursive: true });

    const snapshotLines = [
      '- button "Verwerfen" [ref=e999]',
      ...Array.from({ length: 35 }, (_, i) => `- text "line ${i}"`),
    ].join("\n");

    snapshotQueue.push({ snapshot: snapshotLines, refs: {} });
    snapshotQueue.push({ snapshot: "", refs: {} });

    await runWithContext(
      { runId: "dismiss-3", runDir, kind: "scout", input: {} },
      async () => {
        await dismissBlockingOverlays();
      },
    );

    const timelinePath = path.join(runDir, "timeline.jsonl");
    const lines = fs.readFileSync(timelinePath, "utf8").trim().split("\n");
    const events = lines.map((l) => JSON.parse(l));
    const missEvent = events.find((e: any) => e.event === "dismiss-miss");
    expect(missEvent).toBeDefined();
    expect(missEvent.payload.snapshotArtifact).toContain("dismiss_miss");

    const artifacts = fs.readdirSync(path.join(runDir, "artifacts"));
    expect(artifacts.some((a) => a.includes("dismiss_miss"))).toBe(true);
  });

  it("only emits dismiss-attempt when page is clean", async () => {
    const runDir = path.join(tmpDir, "run-4");
    fs.mkdirSync(runDir, { recursive: true });

    snapshotQueue.push({
      snapshot: '- text "Clean page"\n- link "Jobs"',
      refs: {},
    });
    snapshotQueue.push({ snapshot: "", refs: {} });

    await runWithContext(
      { runId: "dismiss-4", runDir, kind: "scout", input: {} },
      async () => {
        await dismissBlockingOverlays();
      },
    );

    const timelinePath = path.join(runDir, "timeline.jsonl");
    const lines = fs.readFileSync(timelinePath, "utf8").trim().split("\n");
    const events = lines.map((l) => JSON.parse(l));
    const logEvents = events.filter(
      (e: any) =>
        e.event === "dismiss-attempt" ||
        e.event === "dismiss-hit" ||
        e.event === "dismiss-miss",
    );
    expect(logEvents).toHaveLength(1);
    expect(logEvents[0].event).toBe("dismiss-attempt");
  });
});
