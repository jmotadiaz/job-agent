import { tool } from "ai";
import { z } from "zod";
import { snapshot } from "@/lib/agent-browser/exec";
import { getSeenExternalIds } from "@/lib/db/jobs";
import { log } from "@/lib/utils/log";
import { dump } from "@/lib/utils/dump";
import type { ScoutRunContext } from "../types";
import type { JobCard } from "../types";

const MODULE = "scout/tool";

export function makeListVisibleJobsTool(_ctx: ScoutRunContext) {
  return tool({
    description:
      "Return the offers visible on the results page, excluding those already seen. Each entry has external_id, url, title, company, location, snippet.",
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

        const cards: JobCard[] = [];
        const refs = data?.refs ?? {};
        const snapshotText = data?.snapshot ?? "";

        dump("listVisibleJobs", { snapshotText, refs });

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

        const seenIds = new Set<string>();

        // https://{country}.linkedin.com/jobs/view/{slug}-{JOB_ID}?position=N&...
        const JOB_ID_FROM_URL = /\/jobs\/view\/[^?]*-(\d{7,})(?:[/?]|$)/;
        const JOB_ID_DIRECT = /\/jobs\/view\/(\d{7,})(?:[/?]|$)/;

        const allUrlsInText =
          snapshotText.match(/https?:\/\/[^\s"'\]]+/g) || [];

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

          const cleanUrl = info.url.split("?")[0];
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
            log.info(MODULE, "listVisibleJobs: extracted from text fallback", {
              external_id,
            });
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
  });
}
