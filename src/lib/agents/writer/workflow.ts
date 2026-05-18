import { evaluatorOptimizer } from "@/lib/agents/workflows/evaluator-optimizer";
import { node } from "@/lib/agents/workflows/node";
import { cvGenerator, type CvGeneratorInput } from "./generate/cv";
import { coverGenerator, type CoverGeneratorInput } from "./generate/cover";
import { visualCvEvaluator, visualCoverEvaluator } from "./evaluate/visual";
import { writingCvEvaluator, writingCoverEvaluator } from "./evaluate/writing";
import { makeParallelEvaluator } from "./evaluate/aggregate";
import { firstGenDecomposerNode } from "./first-gen-decomposer";
import { revisionDecomposerNode } from "./revision-decomposer";
import { aggregatorNode } from "./aggregator";
import type { CvSolution, CoverSolution, CompositeFeedback, WriterResult } from "./types";
import type { PlanInput } from "./plan/agent";

const cvEvaluator = makeParallelEvaluator<CvGeneratorInput, CvSolution>(
  visualCvEvaluator,
  writingCvEvaluator,
);

export const cvWorker = evaluatorOptimizer<
  CvGeneratorInput,
  CvSolution,
  CompositeFeedback
>(
  cvGenerator,
  cvEvaluator,
  { maxIterations: 4 },
);

const coverEvaluator = makeParallelEvaluator<CoverGeneratorInput, CoverSolution>(
  visualCoverEvaluator,
  writingCoverEvaluator,
);

export const coverWorker = evaluatorOptimizer<
  CoverGeneratorInput,
  CoverSolution,
  CompositeFeedback
>(
  coverGenerator,
  coverEvaluator,
  { maxIterations: 4 },
);

// First-generation workflow: full plan + both workers
export const writerFirstGenWorkflow = node(
  async (input: PlanInput): Promise<WriterResult> => {
    const tasks = await firstGenDecomposerNode.execute(input);

    const results: {
      cv?: { accepted: boolean; solution: CvSolution; iterations: number };
      cover?: { accepted: boolean; solution: CoverSolution; iterations: number };
    } = {};
    const errors: Record<string, unknown> = {};

    try {
      results.cv = await cvWorker.execute(tasks.cv);
    } catch (e) {
      errors.cv = e;
    }

    try {
      results.cover = await coverWorker.execute(tasks.cover);
    } catch (e) {
      errors.cover = e;
    }

    return aggregatorNode.execute({ results, errors, tasks, input });
  },
);

// Revision workflow: revision decomposer + conditional workers
export const writerRevisionWorkflow = node(
  async (input: PlanInput): Promise<WriterResult> => {
    const tasks = await revisionDecomposerNode.execute(input);

    const results: {
      cv?: { accepted: boolean; solution: CvSolution; iterations: number };
      cover?: { accepted: boolean; solution: CoverSolution; iterations: number };
    } = {};
    const errors: Record<string, unknown> = {};

    if (tasks.cv) {
      try {
        results.cv = await cvWorker.execute(tasks.cv);
      } catch (e) {
        errors.cv = e;
      }
    }

    if (tasks.cover) {
      try {
        results.cover = await coverWorker.execute(tasks.cover);
      } catch (e) {
        errors.cover = e;
      }
    }

    return aggregatorNode.execute({ results, errors, tasks, input });
  },
);
