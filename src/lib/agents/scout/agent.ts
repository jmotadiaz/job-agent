import { ToolLoopAgent, isLoopFinished } from "ai";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { makeScoutTools, type ScoutRunContext } from "./tools";
import { log } from "@/lib/utils/log";
import type { SearchConfig } from "@/lib/profile/parse";
import { INSTRUCTIONS, SCOUT_MAX_CANDIDATES, SCOUT_MAX_MATCHES } from "./prompt";

export function createScoutAgent(search: SearchConfig, activeQuery: string, activeLocation: string | null) {
  const deepinfra = createDeepInfra({ apiKey: process.env.DEEPINFRA_API_KEY! });

  const ctx: ScoutRunContext = {
    search,
    candidateCount: 0,
    noMatchCalled: false,
    matches: [],
    reviewedJobs: new Map(),
    rawTextByExternalId: new Map(),
    activeQuery,
    activeLocation,
    browserSession: null,
  };

  const tools = makeScoutTools(ctx);

  const agent = new ToolLoopAgent({
    model: deepinfra("deepseek-ai/DeepSeek-V4-Flash"),
    instructions: INSTRUCTIONS,
    tools,
    stopWhen: (state) => {
      if (ctx.matches.length >= SCOUT_MAX_MATCHES) {
        log.info("scout/runtime", "max-matches reached", {
          matches: ctx.matches.length,
          max: SCOUT_MAX_MATCHES,
        });
        return true;
      }
      if (ctx.candidateCount >= SCOUT_MAX_CANDIDATES) {
        log.warn("scout/runtime", "max-candidates reached", {
          count: ctx.candidateCount,
          max: SCOUT_MAX_CANDIDATES,
        });
        return true;
      }
      if (ctx.noMatchCalled) return true;
      return isLoopFinished()(state);
    },
  });

  return { agent, ctx };
}
