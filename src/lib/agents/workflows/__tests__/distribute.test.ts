import { describe, it, expect } from "vitest";
import { node } from "../node.js";
import { distribute } from "../distribute.js";

describe("distribute", () => {
  it("decomposes tasks and runs workers in parallel", async () => {
    const decomposer = node(async (input: { value: number }) => ({
      a: input.value * 2,
      b: input.value + 10,
    }));

    const workerA = node(async (task: number) => `a:${task}`);
    const workerB = node(async (task: number) => `b:${task}`);

    const aggregator = node(
      async (input: {
        results: { a?: string; b?: string };
        errors: Record<string, unknown>;
        tasks: { a: number; b: number };
        input: { value: number };
      }) => {
        return {
          a: input.results.a,
          b: input.results.b,
          tasks: input.tasks,
          originalValue: input.input.value,
        };
      },
    );

    const workflow = distribute(decomposer, { a: workerA, b: workerB }, aggregator);
    const result = await workflow.execute({ value: 5 });

    expect(result.a).toBe("a:10");
    expect(result.b).toBe("b:15");
    expect(result.tasks).toEqual({ a: 10, b: 15 });
    expect(result.originalValue).toBe(5);
  });

  it("captures errors without aborting other workers", async () => {
    const decomposer = node(async () => ({
      ok: 42,
      fail: 99,
    }));

    const workerOk = node(async (task: number) => `ok:${task}`);
    const workerFail = node(async () => {
      throw new Error("worker failed");
    });

    const aggregator = node(
      async (input: {
        results: { ok?: string; fail?: string };
        errors: Record<string, unknown>;
        tasks: { ok: number; fail: number };
        input: null;
      }) => {
        return {
          hasOk: "ok" in input.results,
          hasFail: "fail" in input.results,
          errorCount: Object.keys(input.errors).length,
        };
      },
    );

    const workflow = distribute(decomposer, { ok: workerOk, fail: workerFail }, aggregator);
    const result = await workflow.execute(null);

    expect(result.hasOk).toBe(true);
    expect(result.hasFail).toBe(false);
    expect(result.errorCount).toBe(1);
  });

  it("passes typed tasks to typed workers", async () => {
    interface MyInput {
      prefix: string;
    }
    type MyTasks = {
      cv: { bullets: string[] };
      cover: { paragraphs: string[] };
    };

    const decomposer = node(async (input: MyInput): Promise<MyTasks> => ({
      cv: { bullets: [`${input.prefix}-b1`] },
      cover: { paragraphs: [`${input.prefix}-p1`] },
    }));


    const cvWorker = node(async (task: { bullets: string[] }) =>
      task.bullets.join(","),
    );
    const coverWorker = node(async (task: { paragraphs: string[] }) =>
      task.paragraphs.join(","),
    );

    const aggregator = node(
      async (input: {
        results: { cv?: string; cover?: string };
        errors: Record<string, unknown>;
        tasks: MyTasks;
        input: MyInput;
      }) => ({
        cvResult: input.results.cv,
        coverResult: input.results.cover,
        taskKeys: Object.keys(input.tasks),
      }),
    );

    const workflow = distribute(decomposer, { cv: cvWorker, cover: coverWorker }, aggregator);
    const result = await workflow.execute({ prefix: "test" });

    expect(result.cvResult).toBe("test-b1");
    expect(result.coverResult).toBe("test-p1");
    expect(result.taskKeys).toEqual(["cv", "cover"]);
  });
});
