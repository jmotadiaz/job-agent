import { describe, it, expect } from "vitest";
import { node } from "../node.js";
import {
  evaluatorOptimizer,
  EvaluatorVerdict,
  OptimizerInput,
  EvaluatorInput,
} from "../evaluator-optimizer.js";

type Input = { topic: string };
type Solution = { text: string };
type Feedback = { issues: string[] };

describe("evaluatorOptimizer", () => {
  it("Scenario: accepted on first iteration returns accepted=true with iterations=1", async () => {
    const generator = node(
      async (_: OptimizerInput<Input, Solution, Feedback>): Promise<Solution> => ({
        text: "draft-0",
      }),
    );
    const evaluator = node(
      async (_: EvaluatorInput<Input, Solution, Feedback>): Promise<EvaluatorVerdict<Feedback>> => ({
        accepted: true,
      }),
    );

    const workflow = evaluatorOptimizer(generator, evaluator, { maxIterations: 3 });
    const result = await workflow.execute({ topic: "x" });

    expect(result.accepted).toBe(true);
    expect(result.iterations).toBe(1);
    expect(result.solution).toEqual({ text: "draft-0" });
  });

  it("Scenario: feedback from iteration N is forwarded to iteration N+1", async () => {
    const seen: OptimizerInput<Input, Solution, Feedback>[] = [];
    const generator = node(
      async (in_: OptimizerInput<Input, Solution, Feedback>): Promise<Solution> => {
        seen.push(in_);
        return { text: `draft-${in_.iteration}` };
      },
    );
    let calls = 0;
    const evaluator = node(
      async (_: EvaluatorInput<Input, Solution, Feedback>): Promise<EvaluatorVerdict<Feedback>> => {
        calls++;
        if (calls === 1) return { accepted: false, feedback: { issues: ["too short"] } };
        return { accepted: true };
      },
    );

    const workflow = evaluatorOptimizer(generator, evaluator, { maxIterations: 3 });
    const result = await workflow.execute({ topic: "x" });

    expect(result.accepted).toBe(true);
    expect(result.iterations).toBe(2);
    expect(seen[0].iteration).toBe(0);
    expect(seen[0].previousSolution).toBeUndefined();
    expect(seen[0].feedback).toBeUndefined();
    expect(seen[0].previousVerdict).toBeUndefined();
    expect(seen[1].iteration).toBe(1);
    expect(seen[1].previousSolution).toEqual({ text: "draft-0" });
    expect(seen[1].feedback).toEqual({ issues: ["too short"] });
  });

  it("Scenario: previousVerdict is forwarded to generator and evaluator", async () => {
    const generatorSeen: EvaluatorVerdict<Feedback>[] = [];
    const evaluatorSeen: EvaluatorVerdict<Feedback>[] = [];

    const generator = node(
      async (in_: OptimizerInput<Input, Solution, Feedback>): Promise<Solution> => {
        if (in_.previousVerdict) generatorSeen.push(in_.previousVerdict);
        return { text: `draft-${in_.iteration}` };
      },
    );
    let calls = 0;
    const evaluator = node(
      async (in_: EvaluatorInput<Input, Solution, Feedback>): Promise<EvaluatorVerdict<Feedback>> => {
        if (in_.previousVerdict) evaluatorSeen.push(in_.previousVerdict);
        calls++;
        if (calls === 1) return { accepted: false, feedback: { issues: ["too short"] } };
        return { accepted: true };
      },
    );

    const workflow = evaluatorOptimizer(generator, evaluator, { maxIterations: 3 });
    await workflow.execute({ topic: "x" });

    expect(generatorSeen).toHaveLength(1);
    expect(generatorSeen[0]).toEqual({ accepted: false, feedback: { issues: ["too short"] } });
    expect(evaluatorSeen).toHaveLength(1);
    expect(evaluatorSeen[0]).toEqual({ accepted: false, feedback: { issues: ["too short"] } });
  });

  it("Scenario: max iterations reached returns accepted=false with last solution and last feedback", async () => {
    const generator = node(
      async (in_: OptimizerInput<Input, Solution, Feedback>): Promise<Solution> => ({
        text: `draft-${in_.iteration}`,
      }),
    );
    const evaluator = node(
      async ({ solution }: EvaluatorInput<Input, Solution, Feedback>): Promise<EvaluatorVerdict<Feedback>> => ({
        accepted: false,
        feedback: { issues: [`reject-${solution.text}`] },
      }),
    );

    const workflow = evaluatorOptimizer(generator, evaluator, { maxIterations: 2 });
    const result = await workflow.execute({ topic: "x" });

    expect(result.accepted).toBe(false);
    expect(result.iterations).toBe(2);
    expect(result.solution).toEqual({ text: "draft-1" });
    if (result.accepted === false) {
      expect(result.feedback).toEqual({ issues: ["reject-draft-1"] });
    }
  });

  it("Scenario: generator error aborts the loop", async () => {
    const generator = node(
      async (_: OptimizerInput<Input, Solution, Feedback>): Promise<Solution> => {
        throw new Error("boom");
      },
    );
    const evaluator = node(
      async (_: EvaluatorInput<Input, Solution, Feedback>): Promise<EvaluatorVerdict<Feedback>> => ({
        accepted: true,
      }),
    );

    const workflow = evaluatorOptimizer(generator, evaluator, { maxIterations: 3 });
    await expect(workflow.execute({ topic: "x" })).rejects.toThrow("boom");
  });

  it("Scenario: evaluator error aborts the loop", async () => {
    const generator = node(
      async (_: OptimizerInput<Input, Solution, Feedback>): Promise<Solution> => ({
        text: "draft",
      }),
    );
    const evaluator = node(
      async (_: EvaluatorInput<Input, Solution, Feedback>): Promise<EvaluatorVerdict<Feedback>> => {
        throw new Error("eval-failed");
      },
    );

    const workflow = evaluatorOptimizer(generator, evaluator, { maxIterations: 3 });
    await expect(workflow.execute({ topic: "x" })).rejects.toThrow("eval-failed");
  });
});
