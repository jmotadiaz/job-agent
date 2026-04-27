import { ToolLoopAgent, isLoopFinished } from "ai";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { makeScoutTools, type ScoutRunContext } from "./tools";
import { log } from "@/lib/utils/log";
import type { SearchConfig } from "@/lib/profile/parse";

export const SCOUT_MAX_CANDIDATES = 10;

const INSTRUCTIONS = `You are a specialized job-search agent. Your goal: find ONE LinkedIn offer that genuinely fits the user's profile.

## Workflow

1. Call \`openSearch\` with **exactly the query string provided** in the user message — do not rephrase it.
2. Call \`listVisibleJobs\`.
   - If \`new_count === 0\`: call \`noMatch\` immediately — no unseen candidates are available.
3. Process each candidate **one at a time** (max ${SCOUT_MAX_CANDIDATES} total):
   a. Call \`fetchJobDetail\` with the job URL. Wait for the structured result before continuing.
   b. Evaluate the returned details against the user's profile using the framework below.
   c. Fit → call \`saveCurrentJob\` and stop. No fit → move to next candidate.
4. All candidates exhausted → call \`noMatch\`.

## Critical rule — one job per turn
Never call \`fetchJobDetail\` more than once in the same turn. Evaluate the result, decide, then proceed.

## Evaluation framework

For each job, reason through these dimensions **in this order** before deciding:

1. **Hard blockers** (\`details.hard_blockers\`): if any entry contradicts the user's profile (wrong country, mandatory language the user doesn't speak, niche required tech the user clearly lacks) → **immediate rejection**. Skip to the next candidate.

2. **Role type** (\`details.role_type\`, \`details.role\`): if the role category is entirely outside the user's target (e.g., user seeks backend but role is designer) → reject.

3. **Tech overlap** (\`details.primary_tech\`): at least ~50 % of required primary tech must appear in the user's skills. If most primary tech is missing → reject. \`secondary_tech\` items are bonus, not a blocker.

4. **Seniority** (\`details.experience_required\`): must be within ±3 years of the user's experience level.

5. **Location / remote** (\`details.remote\`, \`details.location\`): must satisfy the user's location and remote preferences. A mismatch here is a blocker unless the user's profile is explicitly flexible.

## Scoring guide (for \`saveCurrentJob\`)

| Score | Meaning |
|-------|---------|
| 0.9 - 1.0 | Near-perfect: most required tech matches, right seniority, ideal location |
| 0.7 - 0.89 | Good match: minor tech gaps, seniority and location ok |
| 0.5 - 0.69 | Acceptable: notable tech gaps but core skills align, location negotiable |
| < 0.5 | Do not save unless every other candidate failed a hard blocker |

The \`reason\` you pass to \`saveCurrentJob\` must cite specific fields: which tech matched, which was missing, why seniority and location are acceptable.

## Match bar
A solid partial match beats no match. Accept ≥ 0.5 rather than leaving empty-handed when the remaining pool is weak. Do not chase perfection.

## Rules
- Never invent or infer data not present in the offer.
- Always end with \`saveCurrentJob\` or \`noMatch\` — leaving the search unresolved is an error.
- Call \`noMatch\` early only when all remaining candidates clearly fail hard-blocker or role-type checks.`;

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
