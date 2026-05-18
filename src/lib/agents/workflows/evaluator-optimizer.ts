import { type WorkflowNode, node } from "./node";

/**
 * Discriminated verdict returned by the evaluator. The `accepted` field is
 * the sole signal used by the loop to decide whether to stop or iterate, so
 * no predicate callback is needed in the config.
 */
export type EvaluatorVerdict<TFeedback> =
  | { accepted: true }
  | { accepted: false; feedback: TFeedback };

/**
 * Input shape received by the generator on every iteration. On the first
 * iteration `previousSolution` and `feedback` are undefined; from the second
 * onwards they carry the previous attempt and the evaluator's critique.
 */
export interface OptimizerInput<TIn, TSolution, TFeedback> {
  input: TIn;
  iteration: number;
  previousSolution?: TSolution;
  feedback?: TFeedback;
  previousVerdict?: EvaluatorVerdict<TFeedback>;
}

export interface EvaluatorInput<TIn, TSolution, TFeedback> {
  input: TIn;
  solution: TSolution;
  previousVerdict?: EvaluatorVerdict<TFeedback>;
}

export interface EvaluatorOptimizerConfig {
  /** Hard cap on attempts. Must be >= 1. */
  maxIterations: number;
}

/**
 * Result of the loop. `accepted: true` means the evaluator accepted a
 * solution; `accepted: false` means the cap was hit and the latest feedback
 * is exposed so the caller can surface it (logs, warnings, downstream lint).
 */
export type EvaluatorOptimizerResult<TSolution, TFeedback> =
  | { accepted: true; solution: TSolution; iterations: number }
  | {
      accepted: false;
      solution: TSolution;
      feedback: TFeedback;
      iterations: number;
    };

/**
 * Compose a generator and an evaluator into a self-refining loop.
 *
 * Each iteration: generator produces a solution → evaluator returns a verdict.
 * When `accepted` is true the loop returns immediately. When false the
 * critique is fed back into the next generator call. If the cap is reached
 * without acceptance, the last solution and feedback are returned with
 * `accepted: false`.
 *
 * Errors from either node propagate and abort the loop (unlike `parallel`,
 * where partial failures are captured per item — here a failed attempt has
 * no meaningful recovery semantics).
 */
export function evaluatorOptimizer<TIn, TSolution, TFeedback>(
  generator: WorkflowNode<
    OptimizerInput<TIn, TSolution, TFeedback>,
    TSolution
  >,
  evaluator: WorkflowNode<
    EvaluatorInput<TIn, TSolution, TFeedback>,
    EvaluatorVerdict<TFeedback>
  >,
  config: EvaluatorOptimizerConfig,
): WorkflowNode<TIn, EvaluatorOptimizerResult<TSolution, TFeedback>> {
  return node(
    async (
      input: TIn,
    ): Promise<EvaluatorOptimizerResult<TSolution, TFeedback>> => {
      let previousSolution: TSolution | undefined;
      let feedback: TFeedback | undefined;
      let previousVerdict: EvaluatorVerdict<TFeedback> | undefined;

      for (let i = 0; i < config.maxIterations; i++) {
        const solution = await generator.execute({
          input,
          iteration: i,
          previousSolution,
          feedback,
          previousVerdict,
        });
        const verdict = await evaluator.execute({
          input,
          solution,
          previousVerdict,
        });
        if (verdict.accepted) {
          return { accepted: true, solution, iterations: i + 1 };
        }
        previousSolution = solution;
        feedback = verdict.feedback;
        previousVerdict = verdict;
      }

      return {
        accepted: false,
        solution: previousSolution as TSolution,
        feedback: feedback as TFeedback,
        iterations: config.maxIterations,
      };
    },
  );
}
