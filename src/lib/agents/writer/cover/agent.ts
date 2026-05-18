import { ToolLoopAgent, isLoopFinished } from "ai";
import { deepinfra } from "@ai-sdk/deepinfra";
import { log } from "@/lib/utils/log";
import { makeComposeCoverLetterTool } from "../../tools/composeCoverLetter";
import { makeFinalizeGenerationTool } from "../../tools/finalizeGeneration";
import { COVER_SYSTEM_PROMPT } from "./prompt";
import type { WriterRunContext } from "../types";

export function createCoverAgent(ctx: WriterRunContext) {
  log.info("writer/agent-cover", "Cover agent created");

  return new ToolLoopAgent({
    model: deepinfra("deepseek-ai/DeepSeek-V4-Flash"),
    instructions: COVER_SYSTEM_PROMPT,
    tools: {
      composeCoverLetter: makeComposeCoverLetterTool(ctx),
      finalizeGeneration: makeFinalizeGenerationTool(ctx),
    },
    stopWhen: (state) => {
      if (state.steps.length > 15) {
        log.error("writer/agent-cover", "Too many steps");
        return true;
      }
      if (ctx.finalized) {
        log.info("writer/agent-cover", "Agent finalized via tool");
        return true;
      }
      return isLoopFinished()(state);
    },
  });
}
