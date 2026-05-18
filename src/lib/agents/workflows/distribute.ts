import { type WorkflowNode, node } from "./node";

/**
 * Widen `never` result slots to `unknown`.
 *
 * Workers that always throw are inferred as `WorkflowNode<X, never>`.
 * TypeScript then assigns `TResults[K] = never`, making `Partial<TResults>`
 * have `{ key?: never }`. Aggregators that declare `{ key?: SomeType }` fail
 * the bivariant method-parameter check because `SomeType` is not assignable
 * to `never`. Widening those slots to `unknown` avoids the incompatibility
 * without losing type information for workers that do return a value.
 */
type SafeResults<TResults extends Record<string, unknown>> = {
  [K in keyof TResults]: [TResults[K]] extends [never] ? unknown : TResults[K];
};

export interface DistributeAggregatorInput<
  TResults extends Record<string, unknown>,
  TErrors extends Record<string, unknown>,
  TTasks extends Record<string, unknown>,
  TInput,
> {
  /** Successfully resolved results, keyed by worker name. */
  results: Partial<TResults>;
  /** Errors captured from rejected worker executions, keyed by worker name. */
  errors: Partial<TErrors>;
  /** The original tasks produced by the decomposer. */
  tasks: TTasks;
  /** The original input passed to distribute.execute(). */
  input: TInput;
}

/**
 * Decompose an input into a map of heterogeneous tasks, execute each task
 * with its corresponding worker in parallel, then aggregate all results.
 *
 * Each worker is a distinct `WorkflowNode` mapped by name. The decomposer
 * produces a task object where every key must have a matching worker in the
 * `workers` map. If a key is missing from `workers`, the run aborts.
 *
 * Individual worker rejections are captured as errors and do NOT abort the
 * run. The aggregator decides how to handle partial failures.
 *
 * @example
 *   distribute(
 *     planNode,
 *     { cv: cvWorker, cover: coverWorker },
 *     mergeNode,
 *   )
 */
export function distribute<
  TTasks extends Record<string, unknown>,
  TResults extends { [K in keyof TTasks]: unknown },
  TErrors extends { [K in keyof TTasks]: unknown },
  TAggregated,
  TInput,
>(
  decomposer: WorkflowNode<TInput, TTasks>,
  workers: { [K in keyof TTasks]: WorkflowNode<TTasks[K], TResults[K]> },
  aggregator: WorkflowNode<
    DistributeAggregatorInput<SafeResults<TResults>, TErrors, TTasks, TInput>,
    TAggregated
  >,
): WorkflowNode<TInput, TAggregated> {
  return node(async (input: TInput): Promise<TAggregated> => {
    const tasks = await decomposer.execute(input);
    const taskKeys = Object.keys(tasks) as Array<keyof TTasks>;
    const workerKeys = Object.keys(workers) as Array<keyof TTasks>;

    for (const key of taskKeys) {
      if (!workerKeys.includes(key)) {
        throw new Error(
          `distribute: missing worker for task key "${String(key)}"`,
        );
      }
    }

    const results = {} as Partial<SafeResults<TResults>>;
    const errors = {} as Partial<TErrors>;

    /**
     * Generic helper that preserves the per-key correlation between
     * `tasks[K]` and `workers[K]`. Because `key` is typed as a specific
     * `K extends keyof TTasks` (not the full union), TypeScript resolves:
     *   workers[key] → WorkflowNode<TTasks[K], TResults[K]>
     *   tasks[key]   → TTasks[K]
     * …and accepts the call without any type assertion.
     */
    function runWorker<K extends keyof TTasks>(key: K): Promise<TResults[K]> {
      return workers[key].execute(tasks[key]);
    }

    const settled = await Promise.allSettled(
      taskKeys.map(async (key) => {
        const result = await runWorker(key);
        return { key, result };
      }),
    );

    for (let i = 0; i < taskKeys.length; i++) {
      const item = settled[i];
      const key = taskKeys[i];
      if (item.status === "fulfilled") {
        (results as Record<string, TResults[keyof TTasks]>)[String(key)] =
          item.value.result;
      } else {
        (errors as Record<string, unknown>)[String(key)] = item.reason;
      }
    }

    return aggregator.execute({ results, errors, tasks, input });
  });
}
