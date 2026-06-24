import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runWithContext } from "@/lib/runtime/run-context";
import { dump } from "../dump";

let tmpDir: string;
let previousDisableRunLogs: string | undefined;

beforeEach(() => {
  previousDisableRunLogs = process.env.JOB_AGENT_DISABLE_RUN_LOGS;
  process.env.JOB_AGENT_DISABLE_RUN_LOGS = "0";
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dump-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (previousDisableRunLogs === undefined) {
    delete process.env.JOB_AGENT_DISABLE_RUN_LOGS;
  } else {
    process.env.JOB_AGENT_DISABLE_RUN_LOGS = previousDisableRunLogs;
  }
});

describe("dump inside run", () => {
  it("writes to runDir/artifacts with sequential numbering", async () => {
    const runDir = path.join(tmpDir, "run-1");
    fs.mkdirSync(path.join(runDir, "artifacts"), { recursive: true });

    await runWithContext(
      { runId: "dump-1", runDir, kind: "scout", input: {} },
      async () => {
        dump("first", { a: 1 });
        dump("second", { b: 2 });
        dump("third", { c: 3 });
      },
    );

    const artifacts = fs.readdirSync(path.join(runDir, "artifacts")).sort();
    expect(artifacts).toEqual([
      "01_first.json",
      "02_second.json",
      "03_third.json",
    ]);

    const content1 = JSON.parse(
      fs.readFileSync(path.join(runDir, "artifacts", "01_first.json"), "utf8"),
    );
    expect(content1).toEqual({ a: 1 });
  });

  it("returns the filename", async () => {
    const runDir = path.join(tmpDir, "run-2");
    fs.mkdirSync(path.join(runDir, "artifacts"), { recursive: true });

    await runWithContext(
      { runId: "dump-2", runDir, kind: "scout", input: {} },
      async () => {
        const name = dump("myLabel", { x: 1 });
        expect(name).toBe("01_myLabel.json");
      },
    );
  });

  it("pads NN to 2 digits minimum", async () => {
    const runDir = path.join(tmpDir, "run-3");
    fs.mkdirSync(path.join(runDir, "artifacts"), { recursive: true });

    await runWithContext(
      { runId: "dump-3", runDir, kind: "scout", input: {} },
      async () => {
        for (let i = 0; i < 12; i++) {
          dump(`item${i}`, { i });
        }
      },
    );

    const artifacts = fs.readdirSync(path.join(runDir, "artifacts")).sort();
    expect(artifacts[0]).toBe("01_item0.json");
    expect(artifacts[9]).toBe("10_item9.json");
    expect(artifacts[11]).toBe("12_item11.json");
  });
});

describe("dump outside run", () => {
  it("throws an error", () => {
    expect(() => dump("orphan", { data: true })).toThrow(
      "dump() requires an active run context",
    );
  });

  it("does not create any files", () => {
    try {
      dump("orphan", { data: true });
    } catch {
      // expected
    }
    // No new dirs or files should appear
    expect(fs.readdirSync(tmpDir)).toHaveLength(0);
  });
});
