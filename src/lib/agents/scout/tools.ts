import { tool } from 'ai';
import { z } from 'zod';
import { createDeepInfra } from '@ai-sdk/deepinfra';
import { generateText } from 'ai';
import { openUrl, waitLoad, snapshot, getText, runAgentBrowser } from '@/lib/agent-browser/exec';
import { getSeenExternalIds } from '@/lib/db/jobs';
import { log } from '@/lib/log';
import type { JobCard, JobSummary } from './types';
import type { SearchConfig } from '@/lib/profile/parse';
import * as fs from 'fs';
import * as path from 'path';

const SNAPSHOT_DUMP_DIR = path.join(process.cwd(), 'scout-snapshots');

function dumpSnapshot(label: string, content: unknown): void {
  try {
    fs.mkdirSync(SNAPSHOT_DUMP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = path.join(SNAPSHOT_DUMP_DIR, `${ts}_${label}.json`);
    fs.writeFileSync(filename, JSON.stringify(content, null, 2), 'utf8');
    log.info(MODULE, `snapshot dumped to disk`, { file: filename });
  } catch (e) {
    log.warn(MODULE, 'dumpSnapshot failed', { message: String(e) });
  }
}

const LINKEDIN_SEARCH_BASE = 'https://www.linkedin.com/jobs/search/';

function buildLinkedInUrl(query: string, search: SearchConfig): string {
  const params = new URLSearchParams({ keywords: query });
  if (search.location) params.set('location', search.location);
  if (search.remote) params.set('f_WT', '2');
  if (search.experience_level) {
    // LinkedIn f_E codes: 1:Internship, 2:Entry, 3:Associate, 4:Mid-Senior, 5:Director, 6:Executive
    const levelMap: Record<string, string> = { entry: '1,2', mid: '3,4', senior: '4,5' };
    const code = levelMap[search.experience_level];
    if (code) params.set('f_E', code);
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

const MODULE = 'scout/tool';

export function makeScoutTools(ctx: ScoutRunContext) {
  return {
    openSearch: tool({
      description: 'Navega a la página pública de búsqueda de empleo de LinkedIn con la query dada y espera a que cargue.',
      inputSchema: z.object({
        query: z.string().describe('Términos de búsqueda de empleo'),
      }),
      execute: async ({ query }) => {
        const url = buildLinkedInUrl(query, ctx.search);
        const t0 = Date.now();
        log.info(MODULE, 'openSearch begin', { query, url });
        try {
          await openUrl(url);
          await waitLoad();

          // Try to dismiss LinkedIn's login wall if present
          try {
            log.info(MODULE, 'openSearch checking for login wall overlay...');
            const snap = await snapshot({ interactive: true });
            const snapText = (snap.data as any)?.snapshot || '';
            const snapRefs = (snap.data as any)?.refs || {};

            // Dump full snapshot to disk so we can inspect LinkedIn's structure
            dumpSnapshot('openSearch', { url, snapText, refs: snapRefs });
            log.info(MODULE, 'openSearch snapshot preview', {
              length: snapText.length,
              first_800: snapText.slice(0, 800),
              all_button_lines: snapText.split('\n').filter((l: string) => l.includes('button')),
              all_link_lines: snapText.split('\n').filter((l: string) => l.includes('link') && l.includes('job')).slice(0, 20),
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
                log.info(MODULE, 'openSearch found login wall, clicking Dismiss...', { ref: dismissMatch[1] });
                await runAgentBrowser(['click', `@${dismissMatch[1]}`]);
                await runAgentBrowser(['wait', '1500']);
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
                log.info(MODULE, 'openSearch found cookie banner, clicking Accept...', { ref: acceptMatch[1] });
                await runAgentBrowser(['click', `@${acceptMatch[1]}`]);
                await runAgentBrowser(['wait', '1500']);
                break;
              }
            }

            // Extra wait to ensure search results settle
            await runAgentBrowser(['wait', '2000']);
          } catch (e) {
            const m = e instanceof Error ? e.message : String(e);
            log.warn(MODULE, 'openSearch dismiss overlay failed', { message: m });
          }

          log.info(MODULE, 'openSearch end', { url, duration: Date.now() - t0 });
          return { ok: true, url };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error(MODULE, 'openSearch error', { message: msg, stack: err instanceof Error ? err.stack : undefined });
          throw err;
        }
      },
    }),

    listVisibleJobs: tool({
      description: 'Devuelve las ofertas visibles en la página de resultados, excluyendo las ya vistas. Cada entrada tiene external_id, url, title, company, location, snippet.',
      inputSchema: z.object({}),
      execute: async () => {
        const t0 = Date.now();
        log.info(MODULE, 'listVisibleJobs begin');
        try {
          const snap = await snapshot({ interactive: true, urls: true });
          const data = snap.data as { snapshot?: string; refs?: Record<string, { role: string; name?: string; url?: string }> } | undefined;

          // Extract job cards from the accessibility tree snapshot
          const cards: JobCard[] = [];
          const refs = data?.refs ?? {};
          const snapshotText = data?.snapshot ?? '';

          // Dump FULL snapshot to disk for pattern analysis
          dumpSnapshot('listVisibleJobs', { snapshotText, refs });

          // Log a structured summary of URLs and roles present in refs
          const allRefUrls = Object.entries(refs).map(([ref, info]) => ({ ref, url: info.url, role: info.role, name: info.name }));
          const uniqueUrlPatterns = [...new Set(
            allRefUrls
              .filter(r => r.url)
              .map(r => {
                try { return new URL(r.url!).pathname.split('/').slice(0, 4).join('/'); }
                catch { return r.url!.slice(0, 60); }
              })
          )].slice(0, 30);

          log.info(MODULE, 'listVisibleJobs snapshot summary', {
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
          const allUrlsInText = snapshotText.match(/https?:\/\/[^\s"'\]]+/g) || [];

          // Refs that visibly point to job pages
          const potentialJobRefs = Object.entries(refs).filter(([, r]) =>
            r.url?.includes('/jobs/view/')
          );

          log.info(MODULE, 'listVisibleJobs: analysis', {
            snapshot_length: snapshotText.length,
            total_refs: Object.keys(refs).length,
            total_urls_text: allUrlsInText.length,
            job_view_refs_found: potentialJobRefs.length,
            sample_job_urls: potentialJobRefs.slice(0, 3).map(([, r]) => r.url),
          });

          // PRIMARY: extract from refs (they carry full URLs with job IDs)
          for (const [ref, info] of Object.entries(refs)) {
            if (!info.url || !info.url.includes('/jobs/view/')) continue;

            const slugMatch = info.url.match(JOB_ID_FROM_URL);
            const directMatch = info.url.match(JOB_ID_DIRECT);
            const external_id = (slugMatch ?? directMatch)?.[1];

            if (!external_id || seenIds.has(external_id)) continue;
            seenIds.add(external_id);

            const cleanUrl = info.url.split('?')[0]; // strip tracking params
            cards.push({
              external_id,
              url: `https://www.linkedin.com/jobs/view/${external_id}/`,
              title: info.name || '',
              company: '',
              location: '',
              snippet: '',
            });
            log.info(MODULE, 'listVisibleJobs: extracted from ref', { ref, external_id, title: info.name, cleanUrl });
          }

          // FALLBACK: scan snapshotText for any job IDs we may have missed
          let m: RegExpExecArray | null;
          const fallbackPattern = /\/jobs\/view\/[^?\s"']*-(\d{7,})(?:[/?\s"']|$)/g;
          while ((m = fallbackPattern.exec(snapshotText)) !== null) {
            const external_id = m[1];
            if (!seenIds.has(external_id)) {
              seenIds.add(external_id);
              cards.push({
                external_id,
                url: `https://www.linkedin.com/jobs/view/${external_id}/`,
                title: '',
                company: '',
                location: '',
                snippet: '',
              });
              log.info(MODULE, 'listVisibleJobs: extracted from text fallback', { external_id });
            }
          }

          // Filter already seen
          const dbSeen = getSeenExternalIds('linkedin');
          const newCards = cards.filter(c => !dbSeen.has(c.external_id));

          log.info(MODULE, 'listVisibleJobs filtering results', {
            total_extracted: cards.length,
            ids_extracted: cards.map(c => c.external_id),
            db_seen_count: dbSeen.size,
            new_after_db_filter: newCards.length
          });

          log.info(MODULE, 'listVisibleJobs end', {
            total_visible: cards.length,
            new_count: newCards.length,
            duration: Date.now() - t0,
          });
          return { jobs: newCards, total_visible: cards.length, new_count: newCards.length };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error(MODULE, 'listVisibleJobs error', { message: msg, stack: err instanceof Error ? err.stack : undefined });
          throw err;
        }
      },
    }),

    fetchJobDetail: tool({
      description: 'Navega al detalle de una oferta, extrae la descripción y devuelve un resumen en markdown de 6-10 bullets.',
      inputSchema: z.object({
        url: z.string().url(),
      }),
      execute: async ({ url }) => {
        ctx.candidateCount += 1;
        const t0 = Date.now();
        log.info(MODULE, 'fetchJobDetail begin', { url, candidateCount: ctx.candidateCount });

        try {
          await openUrl(url);
          await waitLoad();

          // Extract job description text
          const rawText = await getText('.description__text') || await getText('[class*="description"]') || await getText('main');
          const raw_len = rawText.length;

          if (raw_len < 50) {
            log.warn(MODULE, 'fetchJobDetail: description too short', { url, raw_len });
            return { error: 'Job description not found or too short', url };
          }

          // Summarise with lightweight model
          const deepinfra = createDeepInfra({ apiKey: process.env.DEEPINFRA_API_KEY! });
          const llmModel = 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo';
          const llmT0 = Date.now();
          const { text: summary_md } = await generateText({
            model: deepinfra(llmModel),
            messages: [
              {
                role: 'user',
                content: `Summarize this job description in 6-10 concise bullet points in markdown (- bullet). Focus on: required skills, responsibilities, experience level, team/company context.\n\nJob description:\n${rawText.slice(0, 8000)}`,
              },
            ],
            maxOutputTokens: 512,
          });
          log.info(MODULE, 'fetchJobDetail llm call', { model: llmModel, duration: Date.now() - llmT0 });

          // Extract metadata from URL
          const external_id = url.match(/\/jobs\/view\/(\d+)/)?.[1] ?? url;

          // Try to get title from snapshot
          let title = '';
          let company = '';
          let location = '';
          try {
            const snap = await snapshot({ interactive: false });
            const snapText = (snap.data as { snapshot?: string })?.snapshot ?? '';
            const titleM = snapText.match(/\[heading level=1\]\s+"([^"]+)"/);
            if (titleM) title = titleM[1];
          } catch {
            // non-critical
          }

          const summary: JobSummary = { external_id, url, title, company, location, summary_md, raw_len };
          ctx.lastSummary = summary;
          ctx.lastRawText = rawText;

          log.info(MODULE, 'fetchJobDetail end', {
            external_id,
            raw_len,
            summary_md,
            duration: Date.now() - t0,
          });
          return summary;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error(MODULE, 'fetchJobDetail error', { url, message: msg, stack: err instanceof Error ? err.stack : undefined });
          throw err;
        }
      },
    }),

    saveCurrentJob: tool({
      description: 'Persiste la última oferta revisada como shortlisted con un score y razón. Solo llamar si la oferta encaja con el perfil.',
      inputSchema: z.object({
        score: z.number().min(0).max(1).describe('Puntuación de relevancia entre 0 y 1'),
        reason: z.string().describe('Razón por la que esta oferta encaja con el perfil'),
      }),
      execute: async ({ score, reason }) => {
        log.info(MODULE, 'saveCurrentJob begin', { score, external_id: ctx.lastSummary?.external_id });
        if (!ctx.lastSummary) {
          log.warn(MODULE, 'saveCurrentJob: no lastSummary available');
          return { error: 'No hay oferta reciente — llama primero a fetchJobDetail' };
        }
        ctx.matchResult = { score, reason };
        ctx.saveMatchCalled = true;
        log.info(MODULE, 'saveCurrentJob end', { external_id: ctx.lastSummary.external_id, score });
        return { ok: true, external_id: ctx.lastSummary.external_id };
      },
    }),

    noMatch: tool({
      description: 'Finaliza la búsqueda sin persistir ninguna oferta. Llamar cuando ningún candidato encaja con el perfil.',
      inputSchema: z.object({
        reason: z.string().describe('Razón por la que ninguna oferta encajó'),
      }),
      execute: async ({ reason }) => {
        log.info(MODULE, 'noMatch begin', { reason });
        ctx.noMatchCalled = true;
        log.info(MODULE, 'noMatch end', { reason });
        return { ok: true, reason };
      },
    }),
  };
}
