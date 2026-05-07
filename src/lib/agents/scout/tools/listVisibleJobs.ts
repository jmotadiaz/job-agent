import { tool } from "ai";
import { z } from "zod";
import { snapshot } from "@/lib/agent-browser/exec";
import { getSeenExternalIds } from "@/lib/db/jobs";
import { log } from "@/lib/utils/log";
import { dump } from "@/lib/utils/dump";
import type { ScoutRunContext } from "../types";
import type { JobCard } from "../types";

const MODULE = "scout/tool";

// Extracts the numeric job ID from a LinkedIn jobs/view URL (slug or direct form).
function extractJobId(url: string): string | undefined {
  return (
    url.match(/\/jobs\/view\/[^?]*-(\d{7,})(?:[/?]|$)/)?.[1] ??
    url.match(/\/jobs\/view\/(\d{7,})(?:[/?]|$)/)?.[1]
  );
}

// Derives a best-effort company name from a LinkedIn job URL slug.
// Slug format: {title-words}-at-{company-words}-{jobId}
// Returns "" when the pattern isn't found.
function companyFromSlug(slug: string): string {
  const withoutId = slug.replace(/-\d{7,}[/?]?.*$/, "");
  const atIdx = withoutId.lastIndexOf("-at-");
  if (atIdx === -1) return "";
  return withoutId
    .slice(atIdx + 4)
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function makeListVisibleJobsTool(ctx: ScoutRunContext) {
  return tool({
    description:
      "Return the offers visible on the results page, excluding those already seen. Each entry has external_id, url, title, company, location, snippet.",
    inputSchema: z.object({}),
    execute: async () => {
      const t0 = Date.now();
      log.info(MODULE, "listVisibleJobs begin");
      try {
        const snap = await snapshot(
          { interactive: true, urls: true },
          ctx.browserSession ?? undefined,
        );
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

        const seenIds = new Set<string>();

        // PRIMARY: parse markdown-formatted snapshotText for job links.
        // LinkedIn public pages embed job URLs in the snapshot text but not in
        // structured refs, so this is the main extraction path.
        // Matches lines like:
        //   - link "Senior Frontend Developer" [ref=e38, url=https://es.linkedin.com/jobs/view/senior-...-4407187997?...]
        const SNAPSHOT_LINK =
          /- link "([^"]+)" \[ref=\w+, url=(https?:\/\/[^\s]*?linkedin\.com\/jobs\/view\/[^\]?]+?)(?:\?[^\]]*)?]/g;

        for (const m of snapshotText.matchAll(SNAPSHOT_LINK)) {
          const [, title, url] = m;
          const external_id = extractJobId(url);
          if (!external_id || seenIds.has(external_id)) continue;
          seenIds.add(external_id);

          const slug = url.split("/jobs/view/")[1] ?? "";
          cards.push({
            external_id,
            url: `https://www.linkedin.com/jobs/view/${external_id}/`,
            title,
            company: companyFromSlug(slug),
            location: "",
            snippet: "",
          });
          log.info(MODULE, "listVisibleJobs: extracted from snapshot text", {
            external_id,
            title,
            company: companyFromSlug(slug),
          });
        }

        // SECONDARY: structured refs (edge cases where LinkedIn does include job URLs)
        for (const [ref, info] of Object.entries(refs)) {
          if (!info.url?.includes("/jobs/view/")) continue;
          const external_id = extractJobId(info.url);
          if (!external_id || seenIds.has(external_id)) continue;
          seenIds.add(external_id);
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
          });
        }

        // FALLBACK: bare-ID scan for any remaining IDs not caught above
        let m: RegExpExecArray | null;
        const bareIdPattern = /\/jobs\/view\/[^?\s"']*-(\d{7,})(?:[/?\s"']|$)/g;
        while ((m = bareIdPattern.exec(snapshotText)) !== null) {
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
            log.info(MODULE, "listVisibleJobs: extracted from bare-id fallback", {
              external_id,
            });
          }
        }

        // Deduplicate: same job sometimes appears under multiple IDs (title+company key)
        const seenTitleCompany = new Set<string>();
        const dedupedCards = cards.filter((c) => {
          if (!c.title) return true;
          const key = `${c.title}|${c.company}`;
          if (seenTitleCompany.has(key)) return false;
          seenTitleCompany.add(key);
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
