import { tool } from "ai";
import { z } from "zod";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { generateText } from "ai";
import {
  openUrl,
  waitLoad,
  snapshot,
  getText,
  runAgentBrowser,
  closeSession,
} from "@/lib/agent-browser/exec";
import { getSeenExternalIds } from "@/lib/db/jobs";
import { log } from "@/lib/utils/log";
import { dump } from "@/lib/utils/dump";
import type { JobCard, JobSummary } from "./types";
import type { SearchConfig } from "@/lib/profile/parse";

const LINKEDIN_SEARCH_BASE = "https://www.linkedin.com/jobs/search/";

// LinkedIn geoId codes for country-level filtering (text-only location is unreliable)
const GEO_IDS: Record<string, string> = {
  spain: "105646813",
  españa: "105646813",
  es: "105646813",
};

function buildLinkedInUrl(query: string, search: SearchConfig): string {
  const params = new URLSearchParams({ keywords: query });
  if (search.location) {
    params.set("location", search.location);
    const geoId = GEO_IDS[search.location.toLowerCase().trim()];
    if (geoId) params.set("geoId", geoId);
  }
  if (search.remote) params.set("f_WT", "2");
  if (search.experience_level) {
    // LinkedIn f_E codes: 1:Internship, 2:Entry, 3:Associate, 4:Mid-Senior, 5:Director, 6:Executive
    const levelMap: Record<string, string> = {
      entry: "1,2",
      mid: "3,4",
      senior: "4,5",
    };
    const code = levelMap[search.experience_level];
    if (code) params.set("f_E", code);
  }
  return `${LINKEDIN_SEARCH_BASE}?${params.toString()}`;
}

// Shared state per Scout run (injected via closure from agent factory)
export interface ScoutRunContext {
  search: SearchConfig;
  lastSummary: JobSummary | null;
  lastRawText: string | null;
  candidateCount: number;
  noMatchCalled: boolean;
  saveMatchCalled: boolean;
  matchResult: { score: number; reason: string } | null;
}

const MODULE = "scout/tool";

export function makeScoutTools(ctx: ScoutRunContext) {
  return {
    openSearch: tool({
      description:
        "Navega a la página pública de búsqueda de empleo de LinkedIn con la query dada y espera a que cargue.",
      inputSchema: z.object({
        query: z.string().describe("Términos de búsqueda de empleo"),
      }),
      execute: async ({ query }) => {
        const url = buildLinkedInUrl(query, ctx.search);
        const t0 = Date.now();
        log.info(MODULE, "openSearch begin", { query, url });
        try {
          await openUrl(url);
          await waitLoad();

          // Try to dismiss LinkedIn's login wall if present
          try {
            log.info(MODULE, "openSearch checking for login wall overlay...");
            const snap = await snapshot({ interactive: true });
            const snapText = (snap.data as any)?.snapshot || "";
            const snapRefs = (snap.data as any)?.refs || {};

            // Dump full snapshot to disk so we can inspect LinkedIn's structure
            dump("openSearch", { url, snapText, refs: snapRefs });
            log.info(MODULE, "openSearch snapshot preview", {
              length: snapText.length,
              first_800: snapText.slice(0, 800),
              all_button_lines: snapText
                .split("\n")
                .filter((l: string) => l.includes("button")),
              all_link_lines: snapText
                .split("\n")
                .filter((l: string) => l.includes("link") && l.includes("job"))
                .slice(0, 20),
            });

            // LinkedIn login modal: try multiple dismiss patterns
            const dismissPatterns = [
              /- button "Dismiss" \[ref=([^\]]+)\]/,
              /- button "Cerrar" \[ref=([^\]]+)\]/,
              /- button "Close" \[ref=([^\]]+)\]/,
            ];
            for (const pattern of dismissPatterns) {
              const dismissMatch = snapText.match(pattern);
              if (dismissMatch) {
                log.info(
                  MODULE,
                  "openSearch found login wall, clicking Dismiss...",
                  { ref: dismissMatch[1] },
                );
                await runAgentBrowser(["click", `@${dismissMatch[1]}`]);
                await runAgentBrowser(["wait", "1500"]);
                break;
              }
            }

            // Cookie consent banner — try ES and EN
            const cookiePatterns = [
              /- button "Accept" \[ref=([^\]]+)\]/,
              /- button "Aceptar" \[ref=([^\]]+)\]/,
              /- button "Accept all" \[ref=([^\]]+)\]/i,
            ];
            for (const pattern of cookiePatterns) {
              const acceptMatch = snapText.match(pattern);
              if (acceptMatch) {
                log.info(
                  MODULE,
                  "openSearch found cookie banner, clicking Accept...",
                  { ref: acceptMatch[1] },
                );
                await runAgentBrowser(["click", `@${acceptMatch[1]}`]);
                await runAgentBrowser(["wait", "1500"]);
                break;
              }
            }

            // Extra wait to ensure search results settle
            await runAgentBrowser(["wait", "2000"]);
          } catch (e) {
            const m = e instanceof Error ? e.message : String(e);
            log.warn(MODULE, "openSearch dismiss overlay failed", {
              message: m,
            });
          }

          log.info(MODULE, "openSearch end", {
            url,
            duration: Date.now() - t0,
          });
          return { ok: true, url };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error(MODULE, "openSearch error", {
            message: msg,
            stack: err instanceof Error ? err.stack : undefined,
          });
          throw err;
        }
      },
    }),

    listVisibleJobs: tool({
      description:
        "Devuelve las ofertas visibles en la página de resultados, excluyendo las ya vistas. Cada entrada tiene external_id, url, title, company, location, snippet.",
      inputSchema: z.object({}),
      execute: async () => {
        const t0 = Date.now();
        log.info(MODULE, "listVisibleJobs begin");
        try {
          const snap = await snapshot({ interactive: true, urls: true });
          const data = snap.data as
            | {
                snapshot?: string;
                refs?: Record<
                  string,
                  { role: string; name?: string; url?: string }
                >;
              }
            | undefined;

          // Extract job cards from the accessibility tree snapshot
          const cards: JobCard[] = [];
          const refs = data?.refs ?? {};
          const snapshotText = data?.snapshot ?? "";

          // Dump FULL snapshot to disk for pattern analysis
          dump("listVisibleJobs", { snapshotText, refs });

          // Log a structured summary of URLs and roles present in refs
          const allRefUrls = Object.entries(refs).map(([ref, info]) => ({
            ref,
            url: info.url,
            role: info.role,
            name: info.name,
          }));
          const uniqueUrlPatterns = [
            ...new Set(
              allRefUrls
                .filter((r) => r.url)
                .map((r) => {
                  try {
                    return new URL(r.url!).pathname
                      .split("/")
                      .slice(0, 4)
                      .join("/");
                  } catch {
                    return r.url!.slice(0, 60);
                  }
                }),
            ),
          ].slice(0, 30);

          log.info(MODULE, "listVisibleJobs snapshot summary", {
            snapshot_length: snapshotText.length,
            total_refs: allRefUrls.length,
            unique_url_path_patterns: uniqueUrlPatterns,
            snapshot_first_1000: snapshotText.slice(0, 1000),
          });

          // Parse LinkedIn job cards from snapshot text using ref data
          const seenIds = new Set<string>();

          // LinkedIn URL pattern in listVisibleJobs refs:
          // https://{country}.linkedin.com/jobs/view/{slug}-{JOB_ID}?position=N&...
          // The job ID is always a long numeric suffix at the end of the path slug.
          const JOB_ID_FROM_URL = /\/jobs\/view\/[^?]*-(\d{7,})(?:[/?]|$)/;

          // Also match the legacy /jobs/view/{ID}/ format (for direct links)
          const JOB_ID_DIRECT = /\/jobs\/view\/(\d{7,})(?:[/?]|$)/;

          // Collect all URLs found in snapshot text for reference
          const allUrlsInText =
            snapshotText.match(/https?:\/\/[^\s"'\]]+/g) || [];

          // Refs that visibly point to job pages
          const potentialJobRefs = Object.entries(refs).filter(([, r]) =>
            r.url?.includes("/jobs/view/"),
          );

          log.info(MODULE, "listVisibleJobs: analysis", {
            snapshot_length: snapshotText.length,
            total_refs: Object.keys(refs).length,
            total_urls_text: allUrlsInText.length,
            job_view_refs_found: potentialJobRefs.length,
            sample_job_urls: potentialJobRefs.slice(0, 3).map(([, r]) => r.url),
          });

          // PRIMARY: extract from refs (they carry full URLs with job IDs)
          for (const [ref, info] of Object.entries(refs)) {
            if (!info.url || !info.url.includes("/jobs/view/")) continue;

            const slugMatch = info.url.match(JOB_ID_FROM_URL);
            const directMatch = info.url.match(JOB_ID_DIRECT);
            const external_id = (slugMatch ?? directMatch)?.[1];

            if (!external_id || seenIds.has(external_id)) continue;
            seenIds.add(external_id);

            const cleanUrl = info.url.split("?")[0]; // strip tracking params
            cards.push({
              external_id,
              url: `https://www.linkedin.com/jobs/view/${external_id}/`,
              title: info.name || "",
              company: "",
              location: "",
              snippet: "",
            });
            log.info(MODULE, "listVisibleJobs: extracted from ref", {
              ref,
              external_id,
              title: info.name,
              cleanUrl,
            });
          }

          // FALLBACK: scan snapshotText for any job IDs we may have missed
          let m: RegExpExecArray | null;
          const fallbackPattern =
            /\/jobs\/view\/[^?\s"']*-(\d{7,})(?:[/?\s"']|$)/g;
          while ((m = fallbackPattern.exec(snapshotText)) !== null) {
            const external_id = m[1];
            if (!seenIds.has(external_id)) {
              seenIds.add(external_id);
              cards.push({
                external_id,
                url: `https://www.linkedin.com/jobs/view/${external_id}/`,
                title: "",
                company: "",
                location: "",
                snippet: "",
              });
              log.info(
                MODULE,
                "listVisibleJobs: extracted from text fallback",
                { external_id },
              );
            }
          }

          // Deduplicate by title (LinkedIn sometimes lists the same job under multiple IDs)
          const seenTitles = new Set<string>();
          const dedupedCards = cards.filter((c) => {
            if (!c.title) return true;
            if (seenTitles.has(c.title)) return false;
            seenTitles.add(c.title);
            return true;
          });

          // Filter already seen
          const dbSeen = getSeenExternalIds("linkedin");
          const newCards = dedupedCards.filter((c) => !dbSeen.has(c.external_id));

          log.info(MODULE, "listVisibleJobs filtering results", {
            total_extracted: cards.length,
            after_title_dedup: dedupedCards.length,
            ids_extracted: dedupedCards.map((c) => c.external_id),
            db_seen_count: dbSeen.size,
            new_after_db_filter: newCards.length,
          });

          log.info(MODULE, "listVisibleJobs end", {
            total_visible: cards.length,
            new_count: newCards.length,
            duration: Date.now() - t0,
          });
          return {
            jobs: newCards,
            total_visible: cards.length,
            new_count: newCards.length,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error(MODULE, "listVisibleJobs error", {
            message: msg,
            stack: err instanceof Error ? err.stack : undefined,
          });
          throw err;
        }
      },
    }),

    fetchJobDetail: tool({
      description:
        "Navega al detalle de una oferta, extrae la descripción y devuelve un resumen en markdown de 6-10 bullets.",
      inputSchema: z.object({
        url: z.string().url(),
      }),
      execute: async ({ url }) => {
        ctx.candidateCount += 1;
        const t0 = Date.now();

        // Derive session name early so all browser calls are isolated
        const external_id = url.match(/\/jobs\/view\/(\d+)/)?.[1] ?? url;
        const session = `job-${external_id}`;

        log.info(MODULE, "fetchJobDetail begin", {
          url,
          session,
          candidateCount: ctx.candidateCount,
        });

        try {
          await openUrl(url, session);
          await waitLoad(session);

          // Dismiss login wall / cookie banner if present (same as openSearch)
          try {
            const snap = await snapshot({ interactive: true }, session);
            const snapText = (snap.data as any)?.snapshot ?? "";

            const dismissPatterns = [
              /- button "Dismiss" \[ref=([^\]]+)\]/,
              /- button "Cerrar" \[ref=([^\]]+)\]/,
              /- button "Close" \[ref=([^\]]+)\]/,
            ];
            for (const pattern of dismissPatterns) {
              const m = snapText.match(pattern);
              if (m) {
                log.info(MODULE, "fetchJobDetail: dismissing login wall", { ref: m[1] });
                await runAgentBrowser(["click", `@${m[1]}`], session);
                await runAgentBrowser(["wait", "1500"], session);
                break;
              }
            }

            const cookiePatterns = [
              /- button "Accept" \[ref=([^\]]+)\]/,
              /- button "Aceptar" \[ref=([^\]]+)\]/,
              /- button "Accept all" \[ref=([^\]]+)\]/i,
            ];
            for (const pattern of cookiePatterns) {
              const m = snapText.match(pattern);
              if (m) {
                log.info(MODULE, "fetchJobDetail: accepting cookie banner", { ref: m[1] });
                await runAgentBrowser(["click", `@${m[1]}`], session);
                await runAgentBrowser(["wait", "1500"], session);
                break;
              }
            }
          } catch (e) {
            log.warn(MODULE, "fetchJobDetail: dismiss overlay failed", {
              message: e instanceof Error ? e.message : String(e),
            });
          }

          // Extract job description text
          let rawText =
            (await getText(".description__text", session)) ||
            (await getText('[class*="description"]', session)) ||
            (await getText("main", session));

          // If text is truncated by a "Show more" button, click it and re-extract
          if (/show more"?\s*$/i.test(rawText.trimEnd())) {
            try {
              // Use `find text` to click by visible label — more reliable than snapshot ref parsing
              for (const label of ["Show more", "Ver más"]) {
                try {
                  await runAgentBrowser(["find", "text", label, "click"], session);
                  log.info(MODULE, "fetchJobDetail: clicked Show more", { label });
                  await runAgentBrowser(["wait", "1000"], session);
                  rawText =
                    (await getText(".description__text", session)) ||
                    (await getText('[class*="description"]', session)) ||
                    (await getText("main", session));
                  break;
                } catch {
                  // label not found, try next
                }
              }
            } catch (e) {
              log.warn(MODULE, "fetchJobDetail: show more click failed", {
                message: e instanceof Error ? e.message : String(e),
              });
            }
          }

          const raw_len = rawText.length;

          if (raw_len < 50) {
            log.warn(MODULE, "fetchJobDetail: description too short", {
              url,
              raw_len,
            });
            return { error: "Job description not found or too short", url };
          }

          // Summarise with lightweight model
          const deepinfra = createDeepInfra({
            apiKey: process.env.DEEPINFRA_API_KEY!,
          });
          const llmModel = "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo";
          const llmT0 = Date.now();
          const { text: summary_md } = await generateText({
            model: deepinfra(llmModel),
            messages: [
              {
                role: "user",
                content: `Extract the following fields from this job description. Be concise and literal — do not infer or invent. If a field is not mentioned, write "Not specified".

**Role**: [job title]
**Company**: [company name]
**Location**: [city/country and whether remote/hybrid/onsite]
**Remote**: [yes / no / hybrid]
**Contract**: [full-time / part-time / contract / freelance]
**Experience required**: [minimum years]
**Role type**: [frontend / backend / fullstack / other]
**Primary tech** (required): [main languages, frameworks, tools explicitly required]
**Secondary tech** (nice-to-have): [technologies listed as optional or bonus]
**Key responsibilities**: [2-3 short phrases]
**Hard blockers**: [location restrictions, mandatory languages, specific niche tech with no alternative]

Job description:
${rawText.slice(0, 8000)}`,
              },
            ],
            maxOutputTokens: 512,
          });
          log.info(MODULE, "fetchJobDetail llm call", {
            model: llmModel,
            duration: Date.now() - llmT0,
          });

          // Try to get title from snapshot
          let title = "";
          let company = "";
          let location = "";
          try {
            const snap = await snapshot({ interactive: false }, session);
            const snapText =
              (snap.data as { snapshot?: string })?.snapshot ?? "";
            // Format: - heading "Title" [level=1, ref=eX]
            const titleM = snapText.match(/- heading "([^"]+)" \[level=1[^\]]*\]/);
            if (titleM) title = titleM[1];
            const companyM = snapText.match(/- heading "([^"]+)" \[level=2[^\]]*\]/);
            if (companyM) company = companyM[1];
          } catch {
            // non-critical
          }

          const summary: JobSummary = {
            external_id,
            url,
            title,
            company,
            location,
            summary_md,
            raw_len,
          };
          ctx.lastSummary = summary;
          ctx.lastRawText = rawText;

          log.info(MODULE, "fetchJobDetail end", {
            external_id,
            raw_len,
            summary_md,
            duration: Date.now() - t0,
          });
          dump("fetchJobDetail", { rawText });
          return summary;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error(MODULE, "fetchJobDetail error", {
            url,
            message: msg,
            stack: err instanceof Error ? err.stack : undefined,
          });
          throw err;
        } finally {
          await closeSession(session);
        }
      },
    }),

    saveCurrentJob: tool({
      description:
        "Persiste la última oferta revisada como shortlisted con un score y razón. Solo llamar si la oferta encaja con el perfil.",
      inputSchema: z.object({
        score: z
          .number()
          .min(0)
          .max(1)
          .describe("Puntuación de relevancia entre 0 y 1"),
        reason: z
          .string()
          .describe("Razón por la que esta oferta encaja con el perfil"),
      }),
      execute: async ({ score, reason }) => {
        log.info(MODULE, "saveCurrentJob begin", {
          score,
          external_id: ctx.lastSummary?.external_id,
        });
        if (!ctx.lastSummary) {
          log.warn(MODULE, "saveCurrentJob: no lastSummary available");
          return {
            error: "No hay oferta reciente — llama primero a fetchJobDetail",
          };
        }
        ctx.matchResult = { score, reason };
        ctx.saveMatchCalled = true;
        log.info(MODULE, "saveCurrentJob end", {
          external_id: ctx.lastSummary.external_id,
          score,
        });
        return { ok: true, external_id: ctx.lastSummary.external_id };
      },
    }),

    noMatch: tool({
      description:
        "Finaliza la búsqueda sin persistir ninguna oferta. Llamar cuando ningún candidato encaja con el perfil.",
      inputSchema: z.object({
        reason: z.string().describe("Razón por la que ninguna oferta encajó"),
      }),
      execute: async ({ reason }) => {
        log.info(MODULE, "noMatch begin", { reason });
        ctx.noMatchCalled = true;
        log.info(MODULE, "noMatch end", { reason });
        return { ok: true, reason };
      },
    }),
  };
}
