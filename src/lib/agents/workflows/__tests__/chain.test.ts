import { describe, it, expect } from "vitest";
import { node } from "../node.js";
import { chain } from "../chain.js";

describe("chain", () => {
  it("Scenario: output of first node is the input of second", async () => {
    const first = node(async (x: number) => x + 1);
    const second = node(async (y: number) => y * 2);
    const wf = chain(first, second);
    expect(await wf.execute(3)).toBe(8);
  });

  it("Scenario: type transformation across nodes (number → string → number)", async () => {
    const first = node(async (x: number) => x.toString());
    const second = node(async (s: string) => s.length);
    const wf = chain(first, second);
    expect(await wf.execute(12345)).toBe(5);
  });

  it("Scenario: error in first node aborts the chain, second is not invoked", async () => {
    let secondCalls = 0;
    const first = node(async (_: number): Promise<number> => {
      throw new Error("first-failed");
    });
    const second = node(async (y: number) => {
      secondCalls++;
      return y;
    });
    const wf = chain(first, second);
    await expect(wf.execute(1)).rejects.toThrow("first-failed");
    expect(secondCalls).toBe(0);
  });

  it("Scenario: error in second node propagates", async () => {
    const first = node(async (x: number) => x);
    const second = node(async (_: number): Promise<number> => {
      throw new Error("second-failed");
    });
    const wf = chain(first, second);
    await expect(wf.execute(1)).rejects.toThrow("second-failed");
  });

  it("Scenario: nodes execute strictly in sequence, second starts after first resolves", async () => {
    const order: string[] = [];
    const first = node(async (x: number) => {
      order.push("first-start");
      await Promise.resolve();
      order.push("first-end");
      return x;
    });
    const second = node(async (x: number) => {
      order.push("second-start");
      await Promise.resolve();
      order.push("second-end");
      return x;
    });
    await chain(first, second).execute(1);
    expect(order).toEqual([
      "first-start",
      "first-end",
      "second-start",
      "second-end",
    ]);
  });

  it("Scenario: associativity — chain(chain(a,b),c) equals chain(a,chain(b,c))", async () => {
    const a = node(async (x: number) => x + 1);
    const b = node(async (x: number) => x * 2);
    const c = node(async (x: number) => x - 3);

    const left = chain(chain(a, b), c);
    const right = chain(a, chain(b, c));

    // 5 → 6 → 12 → 9
    expect(await left.execute(5)).toBe(9);
    expect(await right.execute(5)).toBe(9);
  });

  it("Scenario: chain returns a fresh WorkflowNode reusable for multiple executions", async () => {
    const wf = chain(
      node(async (x: number) => x + 1),
      node(async (x: number) => x * 10),
    );
    expect(await wf.execute(0)).toBe(10);
    expect(await wf.execute(1)).toBe(20);
    expect(await wf.execute(2)).toBe(30);
  });
});
