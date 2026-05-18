import { node } from "@/lib/agents/workflows/node";
import type { WorkflowNode } from "@/lib/agents/workflows/node";
import type { EvaluatorInput } from "@/lib/agents/workflows/evaluator-optimizer";
import type {
  CvSolution,
  CoverSolution,
  VisualFeedback,
  WritingFeedback,
  CompositeFeedback,
  CompositeVerdict,
} from "../types";

/**
 * Compose a visual evaluator and a writing evaluator into a single
 * evaluator node that runs both in parallel and aggregates their verdicts.
 *
 * Identity logic:
 * If a previousVerdict exists and a sub-evaluator (visual or writing) had
 * already accepted, that sub-evaluator is skipped in the current iteration
 * and its previous successful verdict is reused.
 */
export function makeParallelEvaluator<
  TIn,
  TSolution extends CvSolution | CoverSolution,
>(
  visualEvaluator: WorkflowNode<
    EvaluatorInput<TIn, TSolution, CompositeFeedback>,
    VisualFeedback
  >,
  writingEvaluator: WorkflowNode<
    EvaluatorInput<TIn, TSolution, CompositeFeedback>,
    WritingFeedback
  >,
): WorkflowNode<
  EvaluatorInput<TIn, TSolution, CompositeFeedback>,
  CompositeVerdict
> {
  return node(
    async (
      evalInput: EvaluatorInput<TIn, TSolution, CompositeFeedback>,
    ): Promise<CompositeVerdict> => {
      const [visual, writing] = await Promise.all([
        visualEvaluator.execute(evalInput),
        writingEvaluator.execute(evalInput),
      ]);

      if (visual.accepted && writing.accepted) {
        return { accepted: true };
      }

      const feedback: CompositeFeedback = {};
      feedback.visual = visual.accepted
        ? { accepted: true, issues: [] }
        : visual;

      feedback.writing = writing.accepted
        ? { accepted: true, issues: [] }
        : writing;

      return { accepted: false, feedback };
    },
  );
}

