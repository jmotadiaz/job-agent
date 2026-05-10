import * as path from "node:path";
import * as fs from "node:fs";
import { loadProfile } from "@/lib/profile/load";
import { parseProfile } from "@/lib/profile/parse";
import { hashProfile } from "@/lib/profile/hash";
import {
  closeBrowser,
  closeSession,
  resetBrowserState,
} from "@/lib/agent-browser/exec";
import { appendAgentStep } from "@/lib/runtime/agent-trace";
import {
  runWithContext,
  makeRunId,
  setRunOutcome,
} from "@/lib/runtime/run-context";
import { LOG_DIR, BLOCKED_COMPANIES_PATH } from "@/lib/runtime/paths";
import { createScoutAgent, SCOUT_MAX_CANDIDATES } from "./agent";
import { log } from "@/lib/utils/log";
import type { ScoutResult } from "./types";

const MODULE = "scout/orchestrator";

let lastUsedPairIndex = -1;

function pickNextPair(queries: string[], locations: string[]): { query: string; location: string | undefined } {
  const locCount = Math.max(locations.length, 1);
  const total = queries.length * locCount;
  lastUsedPairIndex = (lastUsedPairIndex + 1) % total;
  const query = queries[Math.floor(lastUsedPairIndex / locCount)];
  const location = locations.length > 0 ? locations[lastUsedPairIndex % locations.length] : undefined;
  return { query, location };
}

function loadBlockedCompanies(): string | null {
  if (!fs.existsSync(BLOCKED_COMPANIES_PATH)) return null;
  try {
    const content = fs.readFileSync(BLOCKED_COMPANIES_PATH, "utf8").trim();
    // Strip header lines, keep only entries starting with "- "
    const entries = content
      .split("\n")
      .filter((line) => line.startsWith("- "))
      .join("\n");
    return entries || null;
  } catch {
    return null;
  }
}

export async function runScout(): Promise<ScoutResult> {
  const runId = makeRunId();
  const runDir = path.join(LOG_DIR, runId);

  return runWithContext(
    { runId, runDir, kind: "scout", input: {} },
    async () => {
      const profileContent = loadProfile();
      const profileHash = hashProfile(profileContent);
      log.info(MODULE, "profile loaded", {
        hash: profileHash,
        length: profileContent.length,
      });

      const { search, rawContent } = parseProfile(profileContent);
      const { query, location } = pickNextPair(search.queries, search.locations);

      const searchForRun = { ...search, locations: location ? [location] : [] };
      const { agent, ctx } = createScoutAgent(searchForRun);
      resetBrowserState();

      const locationLabel = location ? ` in ${location}` : "";
      const blockedCompanies = loadBlockedCompanies();
      const blocklistSection = blockedCompanies
        ? `\n\n## Blocked companies\nDo NOT fetch or evaluate offers from these companies:\n${blockedCompanies}`
        : "";
      const prompt = `Search for job offers using the query: "${query}"${locationLabel}. User profile:\n\n${rawContent}${blocklistSection}`;

      log.info(MODULE, "agent invoke begin", { query });
      const startMs = Date.now();

      try {
        await agent.generate({
          prompt,
          onStepFinish: (step) => {
            appendAgentStep(step.stepNumber, {
              text: step.text,
              toolCalls: step.toolCalls?.map((tc) => ({
                toolName: tc.toolName,
                input: tc.input,
              })),
              toolResults: step.toolResults?.map((tr) => ({
                toolName: tr.toolName,
                output: tr.output,
              })),
              finishReason: step.finishReason,
              usage: step.usage,
            });
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        log.error(MODULE, "agent error", { message: msg, stack });
        setRunOutcome("error", { stage: "agent_loop", message: msg });
        return { kind: "error", stage: "agent_loop", message: msg };
      } finally {
        if (ctx.browserSession) {
          await closeSession(ctx.browserSession).catch(() => {
            /* ignore if already closed */
          });
        }
        await closeBrowser();
      }

      const duration = Date.now() - startMs;
      const matchCount = ctx.matches.length;
      log.info(MODULE, "agent result", {
        kind: matchCount > 0 ? "matches" : "no_match",
        duration,
        candidateCount: ctx.candidateCount,
        matchCount,
      });

      if (matchCount > 0) {
        setRunOutcome("matches", {
          jobIds: ctx.matches.map((m) => m.id),
          count: matchCount,
        });
        return { kind: "matches", jobs: ctx.matches };
      }

      const reason = ctx.noMatchCalled
        ? "El agente no encontró ninguna oferta que encaje con el perfil"
        : ctx.candidateCount >= SCOUT_MAX_CANDIDATES
          ? `Se revisaron ${SCOUT_MAX_CANDIDATES} candidatos sin encontrar match`
          : "El agente terminó sin resultado";

      log.info(MODULE, "no match", { reason });
      setRunOutcome("no_match", { reason });
      return { kind: "no_match", reason };
    },
  );
}
