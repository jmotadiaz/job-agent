import { node } from "@/lib/agents/workflows/node";
import { mergeNode } from "./merge";
import type { CvSolution, CoverSolution } from "./types";
import type { PlanInput } from "./plan/agent";
import type { CvGeneratorInput } from "./generate/cv";
import type { CoverGeneratorInput } from "./generate/cover";

export const aggregatorNode = node(
  async (aggInput: {
    results: {
      cv?: {
        accepted: boolean;
        solution: CvSolution;
        iterations: number;
      };
      cover?: {
        accepted: boolean;
        solution: CoverSolution;
        iterations: number;
      };
    };
    errors: Record<string, unknown>;
    tasks: {
      cv: CvGeneratorInput;
      cover: CoverGeneratorInput;
    };
    input: PlanInput;
  }) => {
    const cvResult = aggInput.results.cv;
    const coverResult = aggInput.results.cover;

    if (!cvResult || !coverResult) {
      const missing = [!cvResult && "cv", !coverResult && "cover"]
        .filter(Boolean)
        .join(", ");

      const firstError = Object.values(aggInput.errors)[0];
      const errorMsg = firstError instanceof Error ? firstError.message : String(firstError);

      throw new Error(`Writer distributed run failed: missing results for ${missing}. First error: ${errorMsg}`);
    }

    return mergeNode.execute({
      cvResult,
      coverResult,
      rationale: aggInput.tasks.cv.rationaleDraft,
      priorityRequirements: aggInput.tasks.cv.priorityRequirements,
    });
  },
);
