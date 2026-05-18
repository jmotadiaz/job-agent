import { node } from "@/lib/agents/workflows/node";
import { log } from "@/lib/utils/log";
import type { CvSolution, CoverSolution, WriterResult } from "./types";

const MODULE = "writer/merge";

export interface MergeInput {
  cvResult: {
    accepted: boolean;
    solution: CvSolution;
    iterations: number;
  };
  coverResult: {
    accepted: boolean;
    solution: CoverSolution;
    iterations: number;
  };
  rationale: string;
  priorityRequirements: string[];
}

export const mergeNode = node(async (input: MergeInput): Promise<WriterResult> => {
  const autoReviewPassed = input.cvResult.accepted && input.coverResult.accepted;

  log.info(MODULE, "merge", {
    cvAccepted: input.cvResult.accepted,
    coverAccepted: input.coverResult.accepted,
    cvIterations: input.cvResult.iterations,
    coverIterations: input.coverResult.iterations,
    autoReviewPassed,
  });

  return {
    cv: input.cvResult.solution,
    cover: input.coverResult.solution,
    rationale: input.rationale,
    priorityRequirements: input.priorityRequirements,
    autoReviewPassed,
    cvIterations: input.cvResult.iterations,
    coverIterations: input.coverResult.iterations,
  };
});
