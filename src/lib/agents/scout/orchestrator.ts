import { nanoid } from "nanoid";
import * as path from "node:path";
import * as fs from "node:fs";
import { loadProfile } from "@/lib/profile/load";
import { parseProfile } from "@/lib/profile/parse";
import { hashProfile } from "@/lib/profile/hash";
import { insertJob } from "@/lib/db/jobs";
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
import type { JobDetails, ScoutResult } from "./types";

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

function detailsToMd(d: JobDetails): string {
  return [
    `- **Role:** ${d.role}`,
    `- **Company:** ${d.company}`,
    `- **Location:** ${d.location}`,
    `- **Remote:** ${d.remote}`,
    `- **Contract:** ${d.contract}`,
    `- **Experience required:** ${d.experience_required}`,
    `- **Role type:** ${d.role_type}`,
    `- **Primary tech (required):** ${d.primary_tech.join(", ") || "Not specified"}`,
    `- **Secondary tech (nice-to-have):** ${d.secondary_tech.join(", ") || "Not specified"}`,
    `- **Key responsibilities:** ${d.key_responsibilities.join("; ") || "Not specified"}`,
    `- **Salary:** ${d.salary}`,
    `- **Hard blockers:** ${d.hard_blockers}`,
  ].join("\n");
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
      const kind = ctx.saveMatchCalled ? "match" : "no_match";
      log.info(MODULE, "agent result", {
        kind,
        duration,
        candidateCount: ctx.candidateCount,
      });

      // Translate agent outcome to ScoutResult
      if (ctx.saveMatchCalled && ctx.lastSummary && ctx.matchResult) {
        const summary = ctx.lastSummary;
        const job = insertJob({
          id: nanoid(),
          source: "linkedin",
          external_id: summary.external_id,
          url: summary.url,
          title: summary.title,
          company: summary.company,
          location: summary.location,
          description_md: detailsToMd(summary.details),
          raw_snapshot: ctx.lastRawText ?? null,
          match_score: ctx.matchResult.score,
          match_reason: ctx.matchResult.reason,
          status: "shortlisted",
        });
        log.info(MODULE, "persist", {
          jobId: job.id,
          external_id: job.external_id,
          title: job.title,
        });
        setRunOutcome("match", { jobId: job.id });
        return {
          kind: "match",
          job: {
            id: job.id,
            external_id: job.external_id,
            url: job.url,
            title: job.title,
            company: job.company,
            location: job.location,
            description_md: job.description_md,
            match_score: job.match_score,
            match_reason: job.match_reason,
            status: "shortlisted",
            fetched_at: job.fetched_at,
          },
        };
      }

      const reason = ctx.noMatchCalled
        ? "El agente no encontró ninguna oferta que encaje con el perfil"
        : ctx.candidateCount >= SCOUT_MAX_CANDIDATES
          ? `Se revisaron ${SCOUT_MAX_CANDIDATES} candidatos sin encontrar match`
          : "El agente terminó sin resultado";

      log.info(MODULE, "persist", { kind: "no_match", reason });
      setRunOutcome("no_match", { reason });
      return { kind: "no_match", reason };
    },
  );
}
