import { distribute } from "@/lib/agents/workflows/distribute";
import { evaluatorOptimizer } from "@/lib/agents/workflows/evaluator-optimizer";
import { cvGenerator, type CvGeneratorInput } from "./generate/cv";
import { coverGenerator, type CoverGeneratorInput } from "./generate/cover";
import { visualCvEvaluator, visualCoverEvaluator } from "./evaluate/visual";
import { writingCvEvaluator, writingCoverEvaluator } from "./evaluate/writing";
import { makeParallelEvaluator } from "./evaluate/aggregate";
import { decomposerNode } from "./decomposer";
import { aggregatorNode } from "./aggregator";
import type { CvSolution, CoverSolution, CompositeFeedback } from "./types";

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

export const writerWorkflow = distribute(
  decomposerNode,
  { cv: cvWorker, cover: coverWorker },
  aggregatorNode,
);
