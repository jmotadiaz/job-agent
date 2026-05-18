import { describe, it, expect } from "vitest";
import { node } from "../node.js";

describe("node", () => {
  it("Scenario: wraps an async function and exposes execute", async () => {
    const n = node(async (x: number) => x * 2);
    expect(await n.execute(5)).toBe(10);
  });

  it("Scenario: forwards input by reference to the wrapped function", async () => {
    const seen: unknown[] = [];
    const n = node(async (x: unknown) => {
      seen.push(x);
      return x;
    });
    const obj = { a: 1 };
    await n.execute(obj);
    expect(seen[0]).toBe(obj);
  });

  it("Scenario: returns the function's resolved value verbatim", async () => {
    const value = { ok: true, items: [1, 2] };
    const n = node(async () => value);
    const out = await n.execute(undefined);
    expect(out).toBe(value);
  });

  it("Scenario: propagates thrown errors as a rejected promise", async () => {
    const n = node(async (_: number) => {
      throw new Error("boom");
    });
    await expect(n.execute(1)).rejects.toThrow("boom");
  });

  it("Scenario: propagates rejected promises returned by the function", async () => {
    const n = node((_: number) => Promise.reject(new Error("rejected")));
    await expect(n.execute(1)).rejects.toThrow("rejected");
  });

  it("Scenario: each call invokes the wrapped function once with its own input", async () => {
    const calls: number[] = [];
    const n = node(async (x: number) => {
      calls.push(x);
      return x;
    });
    await n.execute(1);
    await n.execute(2);
    await n.execute(3);
    expect(calls).toEqual([1, 2, 3]);
  });
});
