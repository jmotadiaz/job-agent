import { makeOpenSearchTool } from "./tools/openSearch";
import { makeListVisibleJobsTool } from "./tools/listVisibleJobs";
import { makeFetchJobDetailTool } from "./tools/fetchJobDetail";
import { makeSaveJobTool } from "./tools/saveJob";
import { makeNoMatchTool } from "./tools/noMatch";
import { makeBlockCompanyTool } from "./tools/blockCompany";
import type { ScoutRunContext } from "./types";

export type { ScoutRunContext };

export function makeScoutTools(ctx: ScoutRunContext) {
  return {
    openSearch: makeOpenSearchTool(ctx),
    listVisibleJobs: makeListVisibleJobsTool(ctx),
    fetchJobDetail: makeFetchJobDetailTool(ctx),
    saveJob: makeSaveJobTool(ctx),
    noMatch: makeNoMatchTool(ctx),
    blockCompany: makeBlockCompanyTool(ctx),
  };
}
