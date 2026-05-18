import { ToolLoopAgent, isLoopFinished } from "ai";
import { deepinfra } from "@ai-sdk/deepinfra";
import { log } from "@/lib/utils/log";
import { makeComposeCVTool } from "../../tools/composeCV";
import { makeFinalizeGenerationTool } from "../../tools/finalizeGeneration";
import { CV_SYSTEM_PROMPT } from "./prompt";
import type { WriterRunContext } from "../types";

export function createCvAgent(ctx: WriterRunContext) {
  log.info("writer/agent-cv", "CV agent created");

  return new ToolLoopAgent({
    model: deepinfra("deepseek-ai/DeepSeek-V4-Flash"),
    instructions: CV_SYSTEM_PROMPT,
    tools: {
      composeCV: makeComposeCVTool(ctx),
      finalizeGeneration: makeFinalizeGenerationTool(ctx),
    },
    stopWhen: (state) => {
      if (state.steps.length > 15) {
        log.error("writer/agent-cv", "Too many steps");
        return true;
      }
      if (ctx.finalized) {
        log.info("writer/agent-cv", "Agent finalized via tool");
        return true;
      }
      return isLoopFinished()(state);
    },
  });
}
