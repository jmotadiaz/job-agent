/**
 * WorkflowNode: the fundamental building block.
 * Every node (atomic or composite) exposes a single `execute` method.
 */
export interface WorkflowNode<TIn, TOut> {
  execute(input: TIn): Promise<TOut>;
}

/**
 * Create an atomic node from a plain async function.
 */
export function node<TIn, TOut>(
  fn: (input: TIn) => Promise<TOut>,
): WorkflowNode<TIn, TOut> {
  return { execute: fn };
}
