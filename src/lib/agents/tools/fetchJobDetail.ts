import { tool } from "ai";
import { z } from "zod";
import {
  JobOfferExtractionError,
  extractJobOfferFromUrl,
} from "@/lib/agents/job-offer/extractor";
import { closeSession } from "@/lib/agent-browser/exec";
import { log } from "@/lib/utils/log";
import { dump } from "@/lib/utils/dump";
import type { JobSummary, ScoutRunContext } from "../scout/types";

const MODULE = "scout/tool";

export function makeFetchJobDetailTool(ctx: ScoutRunContext) {
  return tool({
    description:
      "Navigate to the offer's detail page, extract the full description, and return a structured summary with fields: role, company, location, remote, contract, experience_required, role_type, primary_tech, secondary_tech, key_responsibilities, salary, hard_blockers.",
    inputSchema: z.object({
      url: z.string().url(),
    }),
    execute: async ({ url }) => {
      ctx.candidateCount += 1;
      const t0 = Date.now();

      const external_id = url.match(/\/jobs\/view\/(\d+)/)?.[1] ?? url;
      const session = ctx.browserSession ?? `job-${external_id}`;

      log.info(MODULE, "fetchJobDetail begin", {
        url,
        session,
        candidateCount: ctx.candidateCount,
      });

      try {
        const extracted = await extractJobOfferFromUrl(url, session, {
          logModule: MODULE,
        });

        const summary: JobSummary = {
          external_id,
          url,
          title: extracted.title,
          company: extracted.company,
          location: extracted.location,
          details: extracted.details,
          raw_len: extracted.rawLen,
        };
        ctx.reviewedJobs.set(external_id, summary);
        ctx.rawTextByExternalId.set(external_id, extracted.rawText);

        log.info(MODULE, "fetchJobDetail end", {
          external_id,
          raw_len: extracted.rawLen,
          details: summary.details,
          duration: Date.now() - t0,
        });
        dump("fetchJobDetail", { rawText: extracted.rawText });
        return summary;
      } catch (err: unknown) {
        if (err instanceof JobOfferExtractionError) {
          log.warn(MODULE, "fetchJobDetail: extraction failed", {
            url,
            raw_len: err.pageText?.descriptionText.length,
            title: err.pageText?.title,
            company: err.pageText?.company,
            location: err.pageText?.location,
            message: err.message,
          });
          return {
            error: err.message,
            url,
          };
        }

        const msg = err instanceof Error ? err.message : String(err);
        log.error(MODULE, "fetchJobDetail error", {
          url,
          message: msg,
          stack: err instanceof Error ? err.stack : undefined,
        });
        throw err;
      } finally {
        // Only close ephemeral sessions; the shared session is cleaned up by the orchestrator
        if (!ctx.browserSession) {
          await closeSession(session);
        }
      }
    },
  });
}
