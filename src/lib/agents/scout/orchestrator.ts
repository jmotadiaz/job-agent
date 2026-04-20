import { nanoid } from "nanoid";
import { loadProfile } from "@/lib/profile/load";
import { parseProfile } from "@/lib/profile/parse";
import { hashProfile } from "@/lib/profile/hash";
import { insertJob } from "@/lib/db/jobs";
import { closeBrowser, resetBrowserState } from "@/lib/agent-browser/exec";
import { createScoutAgent, SCOUT_MAX_CANDIDATES } from "./agent";
import { log } from "@/lib/utils/log";
import type { ScoutResult } from "./types";

const MODULE = "scout/orchestrator";

export async function runScout(): Promise<ScoutResult> {
  const profileContent = loadProfile();
  const profileHash = hashProfile(profileContent);
  log.info(MODULE, "profile loaded", {
    hash: profileHash,
    length: profileContent.length,
  });

  const { search, rawContent } = parseProfile(profileContent);
  const query = search.query;

  const { agent, ctx } = createScoutAgent(search);
  resetBrowserState();

  const prompt = `Busca ofertas de empleo usando la query: "${query}". Perfil del usuario:\n\n${rawContent}`;

  log.info(MODULE, "agent invoke begin", { query });
  const startMs = Date.now();

  try {
    await agent.generate({ prompt });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    log.error(MODULE, "agent error", { message: msg, stack });
    return { kind: "error", stage: "agent_loop", message: msg };
  } finally {
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
      description_md: summary.summary_md,
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
  return { kind: "no_match", reason };
}
