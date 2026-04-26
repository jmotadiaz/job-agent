import { ToolLoopAgent, isLoopFinished } from "ai";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { makeScoutTools, type ScoutRunContext } from "./tools";
import { log } from "@/lib/utils/log";
import type { SearchConfig } from "@/lib/profile/parse";

export const SCOUT_MAX_CANDIDATES = 10;

const INSTRUCTIONS = `You are a specialized job-search agent. Your task is to find ONE job offer on LinkedIn that fits the user's profile well.

## Expected flow
1. Call \`openSearch\` with the query derived from the profile to open LinkedIn's results page.
2. Call \`listVisibleJobs\` to get the visible offers (already filtered to exclude ones previously seen).
3. For each candidate (maximum ${SCOUT_MAX_CANDIDATES} in total), **one at a time and in order**:
   a. Call \`fetchJobDetail\` with the job URL. Wait for its response before continuing.
   b. Analyze the returned summary against the user's profile.
   c. If it fits well: call \`saveCurrentJob\` with a score (0-1) and reason. The search ends.
   d. If it does not fit: move on to the next candidate.
4. If you reviewed all available candidates without finding a match: call \`noMatch\` explaining why.

## Critical constraint
**Never call \`fetchJobDetail\` more than once per turn.** Process one job, evaluate its summary, and only then move on to the next. Calling several in parallel burns the candidate budget without letting you evaluate the results.

## Match criterion
An offer fits if it broadly satisfies the profile's skills, seniority level, and location/remote preferences. Do not chase perfection — a solid partial match is worth more than no match at all.

## Important
- You may give up with \`noMatch\` at any point if the candidates are clearly unsuitable.
- Always end with \`saveCurrentJob\` or \`noMatch\` — never leave the search unresolved.
- Do not invent data about the offers.`;

export function createScoutAgent(search: SearchConfig) {
  const deepinfra = createDeepInfra({ apiKey: process.env.DEEPINFRA_API_KEY! });

  const ctx: ScoutRunContext = {
    search,
    lastSummary: null,
    lastRawText: null,
    candidateCount: 0,
    noMatchCalled: false,
    saveMatchCalled: false,
    matchResult: null,
  };

  const tools = makeScoutTools(ctx);

  const agent = new ToolLoopAgent({
    model: deepinfra("deepseek-ai/DeepSeek-V4-Flash"),
    instructions: INSTRUCTIONS,
    tools,
    stopWhen: (state) => {
      // Stop when terminal tool was called
      if (ctx.saveMatchCalled || ctx.noMatchCalled) return true;
      // Stop when max candidates reached (force noMatch on next loop)
      if (ctx.candidateCount >= SCOUT_MAX_CANDIDATES) {
        log.warn("scout/runtime", "max-candidates reached", {
          count: ctx.candidateCount,
          max: SCOUT_MAX_CANDIDATES,
        });
        return true;
      }
      // Fall back to isLoopFinished behavior
      return isLoopFinished()(state);
    },
  });

  return { agent, ctx };
}
