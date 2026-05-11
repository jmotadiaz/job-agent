import { ToolLoopAgent, isLoopFinished } from "ai";
import { deepinfra } from "@ai-sdk/deepinfra";
import { log } from "@/lib/utils/log";
import { makeWriterTools, type WriterRunContext } from "./tools";
import { BASE_INSTRUCTIONS, ITERATION_INSTRUCTIONS } from "./prompt";

export function createWriterAgent(ctx: WriterRunContext, isIteration: boolean) {
  const instructions = isIteration
    ? BASE_INSTRUCTIONS + ITERATION_INSTRUCTIONS
    : BASE_INSTRUCTIONS;

  log.info("writer/agent", "Agent created", {
    isIteration,
    instructionsLen: instructions.length,
  });

    return new ToolLoopAgent({
      model: deepinfra("deepseek-ai/DeepSeek-V4-Pro"),
      instructions,
      tools: makeWriterTools(ctx),
      stopWhen: (state) => {
      if (state.steps.length > 20) {
        log.error("writer/agent", "Too many steps");
        return true;
      }
      log.info("writer/agent", "step check", { stepCount: state.steps.length });
      if (ctx.finalized) {
        log.info("writer/agent", "Agent finalized via tool");
        return true;
      }
      return isLoopFinished()(state);
    },
  });
}
