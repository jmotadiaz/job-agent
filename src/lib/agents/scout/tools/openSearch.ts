import { tool } from "ai";
import { z } from "zod";
import {
  openUrl,
  waitLoad,
  dismissBlockingOverlays,
} from "@/lib/agent-browser/exec";
import { log } from "@/lib/utils/log";
import type { ScoutRunContext } from "../types";
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
  const loc = search.locations[0];
  if (loc) {
    params.set("location", loc);
    const geoId = GEO_IDS[loc.toLowerCase().trim()];
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

const MODULE = "scout/tool";

export function makeOpenSearchTool(ctx: ScoutRunContext) {
  return tool({
    description:
      "Navigate to LinkedIn's public job search page with the given query and wait for it to load.",
    inputSchema: z.object({
      query: z.string().describe("Job search terms"),
    }),
    execute: async ({ query }) => {
      const url = buildLinkedInUrl(query, ctx.search);
      const t0 = Date.now();
      log.info(MODULE, "openSearch begin", { query, url });
      try {
        await openUrl(url);
        await waitLoad();

        try {
          await dismissBlockingOverlays();
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          log.warn(MODULE, "openSearch dismiss overlay failed", { message: m });
        }

        log.info(MODULE, "openSearch end", { url, duration: Date.now() - t0 });
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
  });
}
