import * as path from "node:path";
import { closeSession } from "@/lib/agent-browser/exec";
import { log } from "@/lib/utils/log";
import { dump } from "@/lib/utils/dump";
import {
  runWithContext,
  makeRunId,
} from "@/lib/runtime/run-context";
import { LOG_DIR } from "@/lib/runtime/paths";
import { extractJobOfferFromUrl } from "@/lib/agents/job-offer/extractor";

const MODULE = "manual/extractor";

export interface ExtractedJob {
  title: string;
  company: string;
  location: string;
  description_md: string;
  raw_text: string;
}

export async function extractJobFromUrl(url: string): Promise<ExtractedJob> {
  const runId = makeRunId();
  const runDir = path.join(LOG_DIR, runId);

  return runWithContext(
    { runId, runDir, kind: "manual", input: { url } },
    async () => {
      const session = `manual-${Date.now()}`;
      log.info(MODULE, "begin", { url, session });

      try {
        const extracted = await extractJobOfferFromUrl(url, session, {
          firstWaitMs: 15_000,
          retryWaitMs: 10_000,
          logModule: MODULE,
        });
        const title = hideNotSpecified(extracted.title);
        const company = hideNotSpecified(extracted.company);
        const location = hideNotSpecified(extracted.location);

        log.info(MODULE, "end", { title, company, location });
        dump("extracted", {
          title,
          company,
          location,
          rawText: extracted.rawText,
        });
        return {
          title,
          company,
          location,
          description_md: extracted.descriptionMd,
          raw_text: extracted.rawText,
        };
      } finally {
        await closeSession(session);
      }
    },
  );
}

function hideNotSpecified(value: string): string {
  return value === "Not specified" ? "" : value;
}
