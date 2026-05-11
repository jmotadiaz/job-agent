import { tool } from "ai";
import { z } from "zod";
import { deepinfra } from "@ai-sdk/deepinfra";
import { generateObject } from "ai";
import {
  openUrl,
  waitLoad,
  getText,
  closeSession,
  dismissBlockingOverlays,
} from "@/lib/agent-browser/exec";
import { log } from "@/lib/utils/log";
import { dump } from "@/lib/utils/dump";
import { fillPrompt } from "@/lib/utils/prompt";
import { JobDetailsSchema } from "../types";
import type { JobSummary, ScoutRunContext } from "../types";

const SYSTEM_PROMPT = `You are a job description parser. Extract structured data from job postings and return it as a JSON object.

Field definitions:
- role: the exact job title as written in the posting
- company: the hiring company name
- location: city and/or country; include whether it is remote, hybrid or onsite if stated
- remote: one of "yes", "no", or "hybrid"
- contract: one of "full-time", "part-time", "contract", or "freelance"
- experience_required: minimum years or experience level. Extract explicit ranges like "5+ years", "3-5 years", or descriptive phrases like "extensive experience", "senior-level", "10+ years". If no experience is mentioned at all, use "Not specified".
- role_type: one of "frontend", "backend", "fullstack", or "other"
- primary_tech: list of languages, frameworks and tools that are explicitly required or listed as core requirements
- secondary_tech: list of technologies mentioned as "nice-to-have", "bonus", "plus", "familiarity with", "experience with X is a plus", or listed in a separate "preferred qualifications" section. If no such items exist, use an empty array.
- key_responsibilities: 2 to 3 short phrases describing the main duties
- salary: salary range or compensation package if mentioned, otherwise "Not specified"
- hard_blockers: ONLY include concrete disqualifying restrictions: mandatory spoken languages the user may not know, location restrictions (e.g., "must be based in X country"), or highly niche required tech with no alternative. Do NOT include general requirements like "strong communication skills", "team player", "deep expertise", or "extensive knowledge" — those are standard job requirements, not blockers.

Rules:
- Be literal — extract only what is written, never infer or invent.
- Use "Not specified" for missing string fields.
- Use empty arrays for missing list fields (including hard_blockers).
- Distinguish carefully between required skills (primary_tech) and preferred/bonus skills (secondary_tech).`;

const USER_PROMPT = `Extract the structured fields from the following job description:

{{jobDescription}}`;

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
        await openUrl(url, session);
        await waitLoad(session);

        try {
          await dismissBlockingOverlays(session);
        } catch (e) {
          log.warn(MODULE, "fetchJobDetail: dismiss overlay failed", {
            message: e instanceof Error ? e.message : String(e),
          });
        }

        const rawText =
          (await getText(".description__text", session)) ||
          (await getText('[class*="description"]', session)) ||
          (await getText("main", session));

        const raw_len = rawText.length;

        if (raw_len < 50) {
          log.warn(MODULE, "fetchJobDetail: description too short", {
            url,
            raw_len,
          });
          return { error: "Job description not found or too short", url };
        }

        const llmModel = "google/gemma-4-26B-A4B-it";
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
        ctx.reviewedJobs.set(external_id, summary);
        ctx.rawTextByExternalId.set(external_id, rawText);

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
        // Only close ephemeral sessions; the shared session is cleaned up by the orchestrator
        if (!ctx.browserSession) {
          await closeSession(session);
        }
      }
    },
  });
}
