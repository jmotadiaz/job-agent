import { tool } from "ai";
import { z } from "zod";
import {
  openUrl,
  waitLoad,
  snapshot,
  runAgentBrowser,
} from "@/lib/agent-browser/exec";
import { log } from "@/lib/utils/log";
import { dump } from "@/lib/utils/dump";
import type { ScoutRunContext } from "../types";
import type { SearchConfig } from "@/lib/profile/parse";

interface SnapshotData {
  snapshot?: string;
  refs?: Record<string, { role: string; name?: string; url?: string }>;
}

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
          log.info(MODULE, "openSearch checking for login wall overlay...");
          const snap = await snapshot({ interactive: true });
          const snapData = snap.data as SnapshotData | undefined;
          const snapText = snapData?.snapshot || "";
          const snapRefs = snapData?.refs || {};

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

          await runAgentBrowser(["wait", "2000"]);
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
