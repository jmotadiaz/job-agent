import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runWithContext } from "@/lib/runtime/run-context";
import { log } from "../log";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "log-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("log inside run", () => {
  it("writes a line to timeline.jsonl", async () => {
    const runDir = path.join(tmpDir, "run-1");
    fs.mkdirSync(runDir, { recursive: true });

    await runWithContext(
      { runId: "log-test-1", runDir, kind: "scout", input: {} },
      async () => {
        log.info("test-module", "test-event", { key: "value" });
      },
    );

    const timelinePath = path.join(runDir, "timeline.jsonl");
    expect(fs.existsSync(timelinePath)).toBe(true);

    const lines = fs.readFileSync(timelinePath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.level).toBe("info");
    expect(entry.module).toBe("test-module");
    expect(entry.event).toBe("test-event");
    expect(entry.payload).toEqual({ key: "value" });
    expect(entry.ts).toBeDefined();
  });

  it("writes multiple log levels", async () => {
    const runDir = path.join(tmpDir, "run-2");
    fs.mkdirSync(runDir, { recursive: true });

    await runWithContext(
      { runId: "log-test-2", runDir, kind: "scout", input: {} },
      async () => {
        log.info("mod", "info-event");
        log.warn("mod", "warn-event", { reason: "test" });
        log.error("mod", "error-event");
      },
    );

    const lines = fs
      .readFileSync(path.join(runDir, "timeline.jsonl"), "utf8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(3);

    const [info, warn, err] = lines.map((l) => JSON.parse(l));
    expect(info.level).toBe("info");
    expect(warn.level).toBe("warn");
    expect(warn.payload).toEqual({ reason: "test" });
    expect(err.level).toBe("error");
  });

  it("still writes to console", async () => {
    const runDir = path.join(tmpDir, "run-3");
    fs.mkdirSync(runDir, { recursive: true });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runWithContext(
      { runId: "log-test-3", runDir, kind: "scout", input: {} },
      async () => {
        log.info("mod", "event");
      },
    );

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("log outside run", () => {
  it("does not write any file", () => {
    log.info("outside-mod", "outside-event");

    // No files should exist in tmpDir (or anywhere new)
    const files = fs.readdirSync(tmpDir);
    expect(files).toHaveLength(0);
  });

  it("still writes to console", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("outside-mod", "outside-event");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
