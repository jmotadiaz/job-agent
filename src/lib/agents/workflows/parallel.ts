import { type WorkflowNode, node } from "./node";

export interface ParallelConfig {
  /** Maximum number of concurrent executions. */
  maxParallel: number;
}

export interface ParallelAggregatorInput<TResult, TTask, TInput> {
  /** Successfully resolved results, in the same order as tasks. */
  results: TResult[];
  /** Errors captured from rejected worker executions. */
  errors: { task: TTask; error: unknown }[];
  /** The original tasks array. */
  tasks: TTask[];
  /** The original input passed to parallel.execute(). */
  input: TInput;
}

/**
 * Execute `worker` on every task found at `input.tasks`, with at most
 * `maxParallel` executions in flight at any time, then pass all results
 * plus the original input to `aggregator`.
 *
 * Concurrency model: a fixed pool of `min(maxParallel, tasks.length)`
 * slots pulls tasks from a shared cursor. As soon as one slot finishes
 * a task, it picks up the next one — no batch boundaries, no waiting
 * for the slowest task of a batch before the next task starts.
 *
 * Individual worker rejections are captured as errors and do NOT abort
 * the run. The aggregator decides how to handle partial failures.
 *
 * Result ordering: `results` and `errors` are emitted in the same order
 * as the original `tasks` array (failures excluded from `results`,
 * successes excluded from `errors`).
 *
 * @example
 *   parallel(writerNode, metaNode, { maxParallel: 3 })
 */
export function parallel<
  TTask,
  TResult,
  TAggregated,
  TInput extends Record<"tasks", TTask[]>,
>(
  worker: WorkflowNode<TTask, TResult>,
  aggregator: WorkflowNode<
    ParallelAggregatorInput<TResult, TTask, TInput>,
    TAggregated
  >,
  config: ParallelConfig,
): WorkflowNode<TInput, TAggregated> {
  return node(async (input: TInput): Promise<TAggregated> => {
    const tasks: TTask[] = input.tasks;
    const outcomes: PromiseSettledResult<TResult>[] = new Array(tasks.length);
    let nextIndex = 0;

    const runSlot = async (): Promise<void> => {
      while (true) {
        const i = nextIndex++;
        if (i >= tasks.length) return;
        try {
          outcomes[i] = {
            status: "fulfilled",
            value: await worker.execute(tasks[i]),
          };
        } catch (error) {
          outcomes[i] = { status: "rejected", reason: error };
        }
      }
    };

    const slotCount = Math.min(config.maxParallel, tasks.length);
    await Promise.all(
      Array.from({ length: slotCount }, () => runSlot()),
    );

    const results: TResult[] = [];
    const errors: { task: TTask; error: unknown }[] = [];
    for (let i = 0; i < tasks.length; i++) {
      const o = outcomes[i];
      if (o.status === "fulfilled") {
        results.push(o.value);
      } else {
        errors.push({ task: tasks[i], error: o.reason });
      }
    }

    return aggregator.execute({ results, errors, tasks, input });
  });
}
