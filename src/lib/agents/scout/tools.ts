import { makeOpenSearchTool } from "./tools/openSearch";
import { makeListVisibleJobsTool } from "./tools/listVisibleJobs";
import { makeFetchJobDetailTool } from "./tools/fetchJobDetail";
import { makeSaveCurrentJobTool } from "./tools/saveCurrentJob";
import { makeNoMatchTool } from "./tools/noMatch";
import type { ScoutRunContext } from "./types";

export type { ScoutRunContext };

export function makeScoutTools(ctx: ScoutRunContext) {
  return {
    openSearch: makeOpenSearchTool(ctx),
    listVisibleJobs: makeListVisibleJobsTool(ctx),
    fetchJobDetail: makeFetchJobDetailTool(ctx),
    saveCurrentJob: makeSaveCurrentJobTool(ctx),
    noMatch: makeNoMatchTool(ctx),
  };
}
