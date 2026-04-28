import { makeComposeCVTool } from "./tools/composeCV";
import { makeComposeCoverLetterTool } from "./tools/composeCoverLetter";
import { makeFinalizeGenerationTool } from "./tools/finalizeGeneration";
import type { WriterRunContext } from "./types";

export type { WriterRunContext };

export function makeWriterTools(ctx: WriterRunContext) {
  return {
    composeCV: makeComposeCVTool(ctx),
    composeCoverLetter: makeComposeCoverLetterTool(ctx),
    finalizeGeneration: makeFinalizeGenerationTool(ctx),
  };
}
