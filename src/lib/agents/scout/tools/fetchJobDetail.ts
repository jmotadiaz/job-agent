import { tool } from "ai";
import { z } from "zod";
import { deepinfra } from "@ai-sdk/deepinfra";
import { generateObject } from "ai";
import {
  openUrl,
  waitLoad,
  snapshot,
  getText,
  runAgentBrowser,
  closeSession,
} from "@/lib/agent-browser/exec";
import { log } from "@/lib/utils/log";
import { dump } from "@/lib/utils/dump";
import { fillPrompt } from "@/lib/utils/prompt";
import { JobDetailsSchema } from "../types";
import type { JobSummary, ScoutRunContext } from "../types";

interface SnapshotData {
  snapshot?: string;
  refs?: Record<string, { role: string; name?: string; url?: string }>;
}

const SYSTEM_PROMPT = `You are a job description parser. Extract structured data from job postings and return it as a JSON object.

Field definitions:
- role: the exact job title as written in the posting
- company: the hiring company name
- location: city and/or country; include whether it is remote, hybrid or onsite if stated
- remote: one of "yes", "no", or "hybrid"
- contract: one of "full-time", "part-time", "contract", or "freelance"
- experience_required: minimum years of experience required, e.g. "3 years" or "Not specified"
- role_type: one of "frontend", "backend", "fullstack", or "other"
- primary_tech: list of languages, frameworks and tools that are explicitly required
- secondary_tech: list of technologies listed as optional, nice-to-have or a bonus
- key_responsibilities: 2 to 3 short phrases describing the main duties
- salary: salary range or compensation package if mentioned, otherwise "Not specified"
- hard_blockers: list of location restrictions, mandatory spoken languages, or niche tech with no stated alternative

Rules:
- Be literal — extract only what is written, never infer or invent.
- Use "Not specified" for missing string fields.
- Use empty arrays for missing list fields (including hard_blockers).`;

const USER_PROMPT = `Extract the structured fields from the following job description:

{{jobDescription}}`;

const MODULE = "scout/tool";

export function makeFetchJobDetailTool(ctx: ScoutRunContext) {
  return tool({
    description:
      "Navigate to the offer's detail page, extract the description, and return a markdown summary of 6-10 bullets.",
    inputSchema: z.object({
      url: z.string().url(),
    }),
    execute: async ({ url }) => {
      ctx.candidateCount += 1;
      const t0 = Date.now();

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

        try {
          const snap = await snapshot({ interactive: true }, session);
          const snapData = snap.data as SnapshotData | undefined;
          const snapText = snapData?.snapshot ?? "";

          const dismissPatterns = [
            /- button "Dismiss" \[ref=([^\]]+)\]/,
            /- button "Cerrar" \[ref=([^\]]+)\]/,
            /- button "Close" \[ref=([^\]]+)\]/,
          ];
          for (const pattern of dismissPatterns) {
            const m = snapText.match(pattern);
            if (m) {
              log.info(MODULE, "fetchJobDetail: dismissing login wall", {
                ref: m[1],
              });
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
              log.info(MODULE, "fetchJobDetail: accepting cookie banner", {
                ref: m[1],
              });
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

        const rawText =
          (await getText(".description__text", session)) ||
          (await getText('[class*="description"]', session)) ||
          (await getText("main", session));

        // if (/show more"?\s*$/i.test(rawText.trimEnd())) {
        //   try {
        //     for (const label of ["Show more", "Ver más"]) {
        //       try {
        //         await runAgentBrowser(
        //           ["find", "text", label, "click"],
        //           session,
        //         );
        //         log.info(MODULE, "fetchJobDetail: clicked Show more", {
        //           label,
        //         });
        //         await runAgentBrowser(["wait", "1000"], session);
        //         rawText =
        //           (await getText(".description__text", session)) ||
        //           (await getText('[class*="description"]', session)) ||
        //           (await getText("main", session));
        //         break;
        //       } catch {
        //         // label not found, try next
        //       }
        //     }
        //   } catch (e) {
        //     log.warn(MODULE, "fetchJobDetail: show more click failed", {
        //       message: e instanceof Error ? e.message : String(e),
        //     });
        //   }
        // }

        const raw_len = rawText.length;

        if (raw_len < 50) {
          log.warn(MODULE, "fetchJobDetail: description too short", {
            url,
            raw_len,
          });
          return { error: "Job description not found or too short", url };
        }

        const llmModel = "google/gemma-4-31B-it";
        const llmT0 = Date.now();

        const { object: extracted } = await generateObject({
          model: deepinfra(llmModel),
          schema: JobDetailsSchema,
          system: SYSTEM_PROMPT,
          prompt: fillPrompt(USER_PROMPT, {
            jobDescription: rawText.slice(0, 8000),
          }),
        });
        log.info(MODULE, "fetchJobDetail llm call", {
          model: llmModel,
          duration: Date.now() - llmT0,
        });

        const summary: JobSummary = {
          external_id,
          url,
          title: extracted.role,
          company: extracted.company,
          location: extracted.location,
          details: extracted,
          raw_len,
        };
        ctx.lastSummary = summary;
        ctx.lastRawText = rawText;

        log.info(MODULE, "fetchJobDetail end", {
          external_id,
          raw_len,
          details: summary.details,
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
  });
}
