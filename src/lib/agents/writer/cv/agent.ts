import { ToolLoopAgent, isLoopFinished } from "ai";
import { deepinfra } from "@ai-sdk/deepinfra";
import { log } from "@/lib/utils/log";
import { makePatchExperienceTool } from "../../tools/patchExperience";
import { makePatchSkillCategoriesTool } from "../../tools/patchSkillCategories";
import { makePatchEducationTool } from "../../tools/patchEducation";
import { makeFinalizeGenerationTool } from "../../tools/finalizeGeneration";
import { CV_SYSTEM_PROMPT } from "./prompt";
import type { WriterRunContext } from "../types";

export function createCvAgent(ctx: WriterRunContext) {
  log.info("writer/agent-cv", "CV agent created");

  return new ToolLoopAgent({
    model: deepinfra("deepseek-ai/DeepSeek-V4-Flash"),
    instructions: CV_SYSTEM_PROMPT,
    tools: {
      patchExperience: makePatchExperienceTool(ctx),
      patchSkillCategories: makePatchSkillCategoriesTool(ctx),
      patchEducation: makePatchEducationTool(ctx),
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
