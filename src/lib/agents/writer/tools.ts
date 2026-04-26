import { makeSelectBulletsTool } from "./tools/selectBullets";
import { makeSelectSkillsTool } from "./tools/selectSkills";
import { makeComposeCoverLetterTool } from "./tools/composeCoverLetter";
import { makeComposeRationaleTool } from "./tools/composeRationale";
import { makeFinalizeGenerationTool } from "./tools/finalizeGeneration";
import type { WriterRunContext } from "./types";

export type { WriterRunContext };

export function makeWriterTools(ctx: WriterRunContext) {
  return {
    selectBullets: makeSelectBulletsTool(ctx),
    selectSkills: makeSelectSkillsTool(ctx),
    composeCoverLetter: makeComposeCoverLetterTool(ctx),
    composeRationale: makeComposeRationaleTool(ctx),
    finalizeGeneration: makeFinalizeGenerationTool(ctx),
  };
}
