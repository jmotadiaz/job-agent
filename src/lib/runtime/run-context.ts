import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import * as fs from "node:fs";
import * as path from "node:path";
import { nanoid } from "nanoid";

export type RunKind = "scout" | "writer" | "manual";

export interface RunContext {
  runId: string;
  runDir: string;
  kind: RunKind;
  persistLogs: boolean;
  sequenceCounter: { value: number };
  outcome: { value: string; result?: unknown };
}

export interface RunInput {
  kind: RunKind;
  runDir: string;
  input: Record<string, unknown>;
}

const storage = new AsyncLocalStorage<RunContext>();

export function makeRunId(): string {
  const iso = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
  return `${iso}_${nanoid(8)}`;
}

export function nextSequenceNumber(): number {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error(
      "nextSequenceNumber() requires an active run context — wrap in runWithContext()",
    );
  }
  return ctx.sequenceCounter.value++;
}

export function getCurrentRunContext(): RunContext | undefined {
  return storage.getStore();
}

export function setRunOutcome(outcome: string, result?: unknown): void {
  const ctx = storage.getStore();
  if (ctx) {
    ctx.outcome = { value: outcome, result };
  }
}

function shouldPersistRunLogs(): boolean {
  return process.env.JOB_AGENT_DISABLE_RUN_LOGS !== "1";
}

export async function runWithContext<T>(
  opts: Omit<RunContext, "sequenceCounter" | "outcome" | "persistLogs"> & { input: Record<string, unknown> },
  fn: () => Promise<T>,
): Promise<T> {
  const { input, ...ctxBase } = opts;
  const runDir = ctxBase.runDir;
  const artifactsDir = path.join(runDir, "artifacts");

  const startedAt = new Date().toISOString();
  const metaPath = path.join(runDir, "meta.json");
  const initialMeta = {
    runId: ctxBase.runId,
    kind: ctxBase.kind,
    startedAt,
    input,
  };
  const persistLogs = shouldPersistRunLogs();

  if (persistLogs) {
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(metaPath, JSON.stringify(initialMeta, null, 2), "utf8");
  }

  const ctx: RunContext = {
    ...ctxBase,
    persistLogs,
    sequenceCounter: { value: 1 },
    outcome: { value: "ok" },
  };
  const t0 = Date.now();

  try {
    const result = await storage.run(ctx, fn);
    const finishedAt = new Date().toISOString();
    const finalMeta = {
      ...initialMeta,
      finishedAt,
      duration_ms: Date.now() - t0,
      outcome: ctx.outcome.value,
      result: ctx.outcome.result ?? null,
    };
    if (persistLogs) {
      fs.writeFileSync(metaPath, JSON.stringify(finalMeta, null, 2), "utf8");
    }
    return result;
  } catch (err) {
    const finishedAt = new Date().toISOString();
    const message = err instanceof Error ? err.message : String(err);
    const finalMeta = {
      ...initialMeta,
      finishedAt,
      duration_ms: Date.now() - t0,
      outcome: "error",
      result: { message },
    };
    if (persistLogs) {
      fs.writeFileSync(metaPath, JSON.stringify(finalMeta, null, 2), "utf8");
    }
    throw err;
  }
}
