import { type WorkflowNode, node } from "./node";

/**
 * Chain two nodes sequentially: first.execute → second.execute.
 * Output of the first becomes input of the second.
 */
export function chain<A, B, C>(
  first: WorkflowNode<A, B>,
  second: WorkflowNode<B, C>,
): WorkflowNode<A, C> {
  return node(async (input: A): Promise<C> => {
    const mid = await first.execute(input);
    return second.execute(mid);
  });
}
