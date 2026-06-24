import { generateObject } from "ai";
import {
  dismissBlockingOverlays,
  openUrl,
  waitForSelector,
} from "@/lib/agent-browser/exec";
import {
  extractJobPageText,
  isLikelyJobPosting,
  type ExtractedJobPageText,
} from "@/lib/agent-browser/job-page";
import { opencodeGo } from "@/lib/agents/provider";
import { log } from "@/lib/utils/log";
import { fillPrompt } from "@/lib/utils/prompt";
import {
  JOB_OFFER_EXTRACTOR_SYSTEM_PROMPT,
  JOB_OFFER_EXTRACTOR_USER_PROMPT,
} from "./prompt";
import { JobDetailsSchema, type JobDetails } from "../scout/types";
import { detailsToMd } from "./markdown";

export const JOB_OFFER_PAGE_LOADED_SELECTOR = ".description__text";

const DEFAULT_LOG_MODULE = "job-offer/extractor";
const LLM_MODEL = "deepseek-v4-flash";
const MAX_LLM_TEXT_CHARS = 8_000;
const MIN_DESCRIPTION_CHARS = 50;

export class JobOfferExtractionError extends Error {
  constructor(
    message: string,
    public readonly pageText?: ExtractedJobPageText,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = "JobOfferExtractionError";
  }
}

export interface JobOfferExtractionOptions {
  firstWaitMs?: number;
  retryWaitMs?: number;
  logModule?: string;
}

export interface ExtractedJobOffer {
  details: JobDetails;
  title: string;
  company: string;
  location: string;
  descriptionMd: string;
  rawText: string;
  rawLen: number;
}

export async function extractJobOfferFromUrl(
  url: string,
  session: string,
  options: JobOfferExtractionOptions = {},
): Promise<ExtractedJobOffer> {
  await openUrl(url, session);
  await waitForJobOfferPage(session, options);
  return extractJobOfferFromCurrentPage(session, options);
}

export async function waitForJobOfferPage(
  session: string,
  options: JobOfferExtractionOptions = {},
): Promise<void> {
  try {
    await waitForSelector(
      JOB_OFFER_PAGE_LOADED_SELECTOR,
      session,
      options.firstWaitMs,
    );
  } catch (firstError) {
    await dismissOverlaysBestEffort(session, options.logModule);

    try {
      await waitForSelector(
        JOB_OFFER_PAGE_LOADED_SELECTOR,
        session,
        options.retryWaitMs ?? 10_000,
      );
    } catch (retryError) {
      throw new JobOfferExtractionError(
        "Could not load job description - LinkedIn returned a login/landing page or the page is unsupported",
        undefined,
        retryError instanceof Error ? retryError : firstError,
      );
    }
  }

  await dismissOverlaysBestEffort(session, options.logModule);
}

export async function extractJobOfferFromCurrentPage(
  session: string,
  options: JobOfferExtractionOptions = {},
): Promise<ExtractedJobOffer> {
  const logModule = options.logModule ?? DEFAULT_LOG_MODULE;
  const pageText = await extractJobPageText(session);
  const rawText = pageText.descriptionText;

  if (!isLikelyJobPosting(pageText) || rawText.length < MIN_DESCRIPTION_CHARS) {
    throw new JobOfferExtractionError(
      "Job description not found, too short, or LinkedIn returned a login/landing page",
      pageText,
    );
  }

  log.info(logModule, "jobOffer raw text extracted", {
    length: rawText.length,
    title: pageText.title,
    company: pageText.company,
    location: pageText.location,
  });

  const llmT0 = Date.now();
  const { object: extracted } = await generateObject({
    model: opencodeGo(LLM_MODEL),
    schema: JobDetailsSchema,
    system: JOB_OFFER_EXTRACTOR_SYSTEM_PROMPT,
    prompt: fillPrompt(JOB_OFFER_EXTRACTOR_USER_PROMPT, {
      jobDescription: pageText.llmText.slice(0, MAX_LLM_TEXT_CHARS),
    }),
  });

  log.info(logModule, "jobOffer llm call", {
    model: LLM_MODEL,
    duration: Date.now() - llmT0,
  });

  const details = applyPageHeaderFallbacks(extracted, pageText);
  const descriptionMd = detailsToMd(details);

  if (!descriptionMd) {
    throw new JobOfferExtractionError(
      "Could not generate job summary from extracted page text",
      pageText,
    );
  }

  return {
    details,
    title: details.role,
    company: details.company,
    location: details.location,
    descriptionMd,
    rawText,
    rawLen: rawText.length,
  };
}

function applyPageHeaderFallbacks(
  details: JobDetails,
  pageText: ExtractedJobPageText,
): JobDetails {
  return {
    ...details,
    role: pageText.title || details.role,
    company: pageText.company || details.company,
    location: pageText.location || details.location,
  };
}

async function dismissOverlaysBestEffort(
  session: string,
  logModule = DEFAULT_LOG_MODULE,
): Promise<void> {
  try {
    await dismissBlockingOverlays(session);
  } catch (e) {
    log.warn(logModule, "dismiss overlay failed", {
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
