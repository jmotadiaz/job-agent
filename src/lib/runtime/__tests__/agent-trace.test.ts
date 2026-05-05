import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runWithContext } from "../run-context";
import { appendAgentStep } from "../agent-trace";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-trace-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("appendAgentStep", () => {
  it("writes a line to agent-trace.jsonl inside a run", async () => {
    const runDir = path.join(tmpDir, "run-1");
    fs.mkdirSync(runDir, { recursive: true });

    await runWithContext(
      { runId: "trace-1", runDir, kind: "scout", input: {} },
      async () => {
        appendAgentStep(0, {
          text: "Hello",
          toolCalls: [{ toolName: "search", input: { q: "test" } }],
          toolResults: [{ toolName: "search", output: { ok: true } }],
          finishReason: "tool-calls",
          usage: { promptTokens: 100, completionTokens: 50 },
        });
      },
    );

    const tracePath = path.join(runDir, "agent-trace.jsonl");
    expect(fs.existsSync(tracePath)).toBe(true);

    const lines = fs.readFileSync(tracePath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);

    const record = JSON.parse(lines[0]);
    expect(record.step).toBe(0);
    expect(record.messages).toBe("Hello");
    expect(record.toolCalls).toEqual([{ name: "search", args: { q: "test" } }]);
    expect(record.toolResults).toEqual([{ name: "search", output: { ok: true } }]);
    expect(record.finishReason).toBe("tool-calls");
    expect(record.usage.promptTokens).toBe(100);
    expect(record.ts).toBeDefined();
  });

  it("appends multiple steps", async () => {
    const runDir = path.join(tmpDir, "run-2");
    fs.mkdirSync(runDir, { recursive: true });

    await runWithContext(
      { runId: "trace-2", runDir, kind: "scout", input: {} },
      async () => {
        appendAgentStep(0, { text: "step 0", finishReason: "tool-calls" });
        appendAgentStep(1, { text: "step 1", finishReason: "tool-calls" });
        appendAgentStep(2, { text: "step 2", finishReason: "stop" });
      },
    );

    const lines = fs
      .readFileSync(path.join(runDir, "agent-trace.jsonl"), "utf8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(3);

    const records = lines.map((l) => JSON.parse(l));
    expect(records[0].step).toBe(0);
    expect(records[1].step).toBe(1);
    expect(records[2].step).toBe(2);
    expect(records[2].finishReason).toBe("stop");
  });

  it("does nothing outside a run", () => {
    // Should not throw
    appendAgentStep(0, { text: "orphan", finishReason: "stop" });

    // No files should be created
    expect(fs.readdirSync(tmpDir)).toHaveLength(0);
  });

  it("handles missing optional fields", async () => {
    const runDir = path.join(tmpDir, "run-3");
    fs.mkdirSync(runDir, { recursive: true });

    await runWithContext(
      { runId: "trace-3", runDir, kind: "writer", input: {} },
      async () => {
        appendAgentStep(0, { finishReason: "stop" });
      },
    );

    const record = JSON.parse(
      fs.readFileSync(path.join(runDir, "agent-trace.jsonl"), "utf8").trim(),
    );
    expect(record.messages).toBe("");
    expect(record.toolCalls).toEqual([]);
    expect(record.toolResults).toEqual([]);
  });
});
