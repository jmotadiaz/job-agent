import { ToolLoopAgent, isLoopFinished } from "ai";
import { opencodeGo } from "@/lib/agents/provider";
import { log } from "@/lib/utils/log";
import { makePatchCoverParagraphsTool } from "../../tools/patchCoverParagraphs";
import { makeFinalizeGenerationTool } from "../../tools/finalizeGeneration";
import { COVER_SYSTEM_PROMPT } from "./prompt";
import type { WriterRunContext } from "../types";

export function createCoverAgent(ctx: WriterRunContext) {
  log.info("writer/agent-cover", "Cover agent created");

  return new ToolLoopAgent({
    model: opencodeGo("deepseek-v4-flash"),
    instructions: COVER_SYSTEM_PROMPT,
    tools: {
      patchCoverParagraphs: makePatchCoverParagraphsTool(ctx),
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
