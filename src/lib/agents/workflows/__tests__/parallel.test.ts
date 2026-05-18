import { describe, it, expect } from "vitest";
import { node } from "../node.js";
import { parallel, ParallelAggregatorInput } from "../parallel.js";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Flush the microtask queue so any pending continuations run before assertions.
const flush = (): Promise<void> =>
  new Promise((resolve) => setImmediate(() => resolve()));

describe("parallel", () => {
  it("Scenario: processes every task and preserves input order in results", async () => {
    const worker = node(async (n: number) => n * 10);
    const aggregator = node(
      async (
        agg: ParallelAggregatorInput<number, number, { tasks: number[] }>,
      ) => agg.results,
    );
    const wf = parallel(worker, aggregator, { maxParallel: 2 });
    const out = await wf.execute({ tasks: [1, 2, 3, 4, 5] });
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it("Scenario: result order matches task order regardless of completion order", async () => {
    const tasks = [0, 1, 2, 3];
    const gates = tasks.map(() => deferred<void>());
    const worker = node(async (i: number) => {
      await gates[i].promise;
      return i * 100;
    });
    const aggregator = node(
      async (
        agg: ParallelAggregatorInput<number, number, { tasks: number[] }>,
      ) => agg.results,
    );
    const wf = parallel(worker, aggregator, { maxParallel: 4 });

    const p = wf.execute({ tasks });
    // Resolve in reverse order.
    gates[3].resolve();
    gates[2].resolve();
    gates[1].resolve();
    gates[0].resolve();
    expect(await p).toEqual([0, 100, 200, 300]);
  });

  it("Scenario: per-task errors are captured without aborting other tasks", async () => {
    const worker = node(async (i: number) => {
      if (i % 2 === 0) throw new Error(`fail-${i}`);
      return i * 10;
    });
    const aggregator = node(
      async (
        agg: ParallelAggregatorInput<number, number, { tasks: number[] }>,
      ) => agg,
    );
    const wf = parallel(worker, aggregator, { maxParallel: 3 });
    const out = await wf.execute({ tasks: [0, 1, 2, 3, 4] });

    expect(out.results).toEqual([10, 30]);
    expect(out.errors).toHaveLength(3);
    expect(out.errors.map((e) => e.task)).toEqual([0, 2, 4]);
    expect((out.errors[0].error as Error).message).toBe("fail-0");
    expect((out.errors[1].error as Error).message).toBe("fail-2");
    expect((out.errors[2].error as Error).message).toBe("fail-4");
  });

  it("Scenario: empty tasks array yields empty results and errors without invoking the worker", async () => {
    let workerCalls = 0;
    const worker = node(async (n: number) => {
      workerCalls++;
      return n;
    });
    const aggregator = node(
      async (
        agg: ParallelAggregatorInput<number, number, { tasks: number[] }>,
      ) => ({
        resultsLen: agg.results.length,
        errorsLen: agg.errors.length,
        tasksLen: agg.tasks.length,
      }),
    );
    const wf = parallel(worker, aggregator, { maxParallel: 4 });
    const out = await wf.execute({ tasks: [] });
    expect(out).toEqual({ resultsLen: 0, errorsLen: 0, tasksLen: 0 });
    expect(workerCalls).toBe(0);
  });

  it("Scenario: aggregator receives the original input, tasks, results and errors", async () => {
    type Input = { tasks: number[]; ctx: string };
    const worker = node(async (n: number) => n + 1);
    const aggregator = node(
      async (agg: ParallelAggregatorInput<number, number, Input>) => agg,
    );
    const wf = parallel(worker, aggregator, { maxParallel: 2 });
    const input: Input = { tasks: [10, 20, 30], ctx: "trace-1" };
    const out = await wf.execute(input);

    expect(out.input).toBe(input);
    expect(out.tasks).toEqual([10, 20, 30]);
    expect(out.results).toEqual([11, 21, 31]);
    expect(out.errors).toEqual([]);
  });

  it("Scenario: never exceeds maxParallel workers in flight at the same time", async () => {
    const tasks = [0, 1, 2, 3, 4, 5];
    const gates = tasks.map(() => deferred<void>());
    let active = 0;
    let peak = 0;

    const worker = node(async (i: number) => {
      active++;
      peak = Math.max(peak, active);
      await gates[i].promise;
      active--;
      return i;
    });
    const aggregator = node(
      async (
        agg: ParallelAggregatorInput<number, number, { tasks: number[] }>,
      ) => agg.results,
    );
    const wf = parallel(worker, aggregator, { maxParallel: 2 });

    const p = wf.execute({ tasks });
    await flush();
    expect(active).toBe(2);

    // Release tasks one by one; a fresh slot should pick the next task each time.
    for (const g of gates) {
      g.resolve();
      await flush();
    }

    await p;
    expect(peak).toBe(2);
  });

  it("Scenario: slot count is capped at tasks.length when maxParallel exceeds tasks", async () => {
    let active = 0;
    let peak = 0;
    const gate = deferred<void>();

    const worker = node(async (i: number) => {
      active++;
      peak = Math.max(peak, active);
      await gate.promise;
      active--;
      return i;
    });
    const aggregator = node(
      async (
        agg: ParallelAggregatorInput<number, number, { tasks: number[] }>,
      ) => agg.results,
    );
    const wf = parallel(worker, aggregator, { maxParallel: 10 });

    const p = wf.execute({ tasks: [1, 2] });
    await flush();
    expect(active).toBe(2); // not 10
    gate.resolve();
    await p;
    expect(peak).toBe(2);
  });

  it("Scenario: a finished slot immediately picks up the next pending task (no batch waiting)", async () => {
    const tasks = [0, 1, 2, 3];
    const gates = tasks.map(() => deferred<void>());
    const started: number[] = [];

    const worker = node(async (i: number) => {
      started.push(i);
      await gates[i].promise;
      return i;
    });
    const aggregator = node(
      async (
        agg: ParallelAggregatorInput<number, number, { tasks: number[] }>,
      ) => agg.results,
    );
    const wf = parallel(worker, aggregator, { maxParallel: 2 });

    const p = wf.execute({ tasks });
    await flush();
    // Two slots claim tasks 0 and 1 up front.
    expect(started).toEqual([0, 1]);

    // Finish task 0; the freed slot should pick up task 2 even though task 1 is still pending.
    gates[0].resolve();
    await flush();
    expect(started).toEqual([0, 1, 2]);

    // Finish task 2; slot picks up task 3 while task 1 is still pending.
    gates[2].resolve();
    await flush();
    expect(started).toEqual([0, 1, 2, 3]);

    // Drain.
    gates[1].resolve();
    gates[3].resolve();
    expect(await p).toEqual([0, 1, 2, 3]);
  });

  it("Scenario: maxParallel=1 serializes execution (no overlap between tasks)", async () => {
    const trace: string[] = [];
    const worker = node(async (i: number) => {
      trace.push(`start-${i}`);
      await Promise.resolve();
      await Promise.resolve();
      trace.push(`end-${i}`);
      return i;
    });
    const aggregator = node(
      async (
        agg: ParallelAggregatorInput<number, number, { tasks: number[] }>,
      ) => agg.results,
    );
    const wf = parallel(worker, aggregator, { maxParallel: 1 });

    await wf.execute({ tasks: [1, 2, 3] });
    expect(trace).toEqual([
      "start-1",
      "end-1",
      "start-2",
      "end-2",
      "start-3",
      "end-3",
    ]);
  });

  it("Scenario: extra fields on the input are forwarded to the aggregator untouched", async () => {
    type Input = { tasks: string[]; meta: { id: number } };
    const worker = node(async (s: string) => s.toUpperCase());
    const aggregator = node(
      async (agg: ParallelAggregatorInput<string, string, Input>) => ({
        results: agg.results,
        meta: agg.input.meta,
      }),
    );
    const wf = parallel(worker, aggregator, { maxParallel: 2 });
    const out = await wf.execute({ tasks: ["a", "b", "c"], meta: { id: 7 } });
    expect(out).toEqual({ results: ["A", "B", "C"], meta: { id: 7 } });
  });

  it("Scenario: aggregator's return value is the workflow's output", async () => {
    const worker = node(async (n: number) => n);
    const aggregator = node(
      async (
        agg: ParallelAggregatorInput<number, number, { tasks: number[] }>,
      ) => ({
        sum: agg.results.reduce((acc, v) => acc + v, 0),
        count: agg.tasks.length,
      }),
    );
    const wf = parallel(worker, aggregator, { maxParallel: 3 });
    const out = await wf.execute({ tasks: [1, 2, 3, 4] });
    expect(out).toEqual({ sum: 10, count: 4 });
  });

  it("Scenario: errors array preserves task-index order of failures", async () => {
    const worker = node(async (i: number) => {
      if (i === 1 || i === 3) throw new Error(`x-${i}`);
      return i;
    });
    const aggregator = node(
      async (
        agg: ParallelAggregatorInput<number, number, { tasks: number[] }>,
      ) => agg,
    );
    const wf = parallel(worker, aggregator, { maxParallel: 4 });
    const out = await wf.execute({ tasks: [0, 1, 2, 3, 4] });
    expect(out.results).toEqual([0, 2, 4]);
    expect(out.errors.map((e) => e.task)).toEqual([1, 3]);
  });
});
