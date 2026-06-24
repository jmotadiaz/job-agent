import { getText } from "@/lib/agent-browser/exec";

export interface ExtractedJobPageText {
  title: string;
  company: string;
  location: string;
  descriptionText: string;
  llmText: string;
}

const TITLE_SELECTORS = [
  ".top-card-layout__title",
  ".jobs-unified-top-card__job-title",
  "[data-test-job-title]",
  "h1",
];

const COMPANY_SELECTORS = [
  ".topcard__org-name-link",
  ".jobs-unified-top-card__company-name",
  "[data-test-job-company-name]",
];

const LOCATION_SELECTORS = [
  ".topcard__flavor--bullet",
  ".jobs-unified-top-card__bullet",
  ".job-search-card__location",
  "[data-test-job-location]",
];

const HEADER_ROW_SELECTORS = [
  ".topcard__flavor-row",
  ".jobs-unified-top-card__primary-description-container",
];

const DESCRIPTION_SELECTORS = [
  ".description__text",
  ".jobs-description__content",
  '[class*="description"]',
  "main",
];

function cleanInline(value: string): string {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => cleanInline(line))
    .filter(Boolean);
}

async function getTextOrEmpty(selector: string, session?: string): Promise<string> {
  return getText(selector, session, { optional: true });
}

async function firstText(selectors: string[], session?: string): Promise<string> {
  for (const selector of selectors) {
    const text = cleanInline(await getTextOrEmpty(selector, session));
    if (text) return text;
  }
  return "";
}

async function firstRawText(selectors: string[], session?: string): Promise<string> {
  for (const selector of selectors) {
    const text = (await getTextOrEmpty(selector, session)).trim();
    if (text) return text;
  }
  return "";
}

async function readHeaderRow(session?: string): Promise<string[]> {
  for (const selector of HEADER_ROW_SELECTORS) {
    const lines = cleanLines(await getTextOrEmpty(selector, session));
    if (lines.length > 0) return lines;
  }
  return [];
}

function buildLlmText(page: Omit<ExtractedJobPageText, "llmText">): string {
  const headerLines = [
    page.title ? `Role: ${page.title}` : "",
    page.company ? `Company: ${page.company}` : "",
    page.location ? `Location: ${page.location}` : "",
  ].filter(Boolean);

  return [...headerLines, "", page.descriptionText].join("\n").trim();
}

export function isLikelyJobPosting(page: ExtractedJobPageText): boolean {
  const text = `${page.title}\n${page.company}\n${page.location}\n${page.descriptionText}`
    .toLowerCase()
    .replace(/\s+/g, " ");

  const linkedInLandingMarkers = [
    "welcome to your professional community",
    "explore top linkedin content",
    "join your colleagues, classmates, and friends on linkedin",
  ];
  if (linkedInLandingMarkers.some((marker) => text.includes(marker))) {
    return false;
  }

  const hasJobHeader = Boolean(page.title && (page.company || page.location));
  const hasJobBodyMarker = [
    "about the role",
    "about you",
    "requirements",
    "responsibilities",
    "qualifications",
    "employment type",
    "seniority level",
    "job function",
  ].some((marker) => text.includes(marker));

  return hasJobHeader || hasJobBodyMarker;
}

export async function extractJobPageText(
  session?: string,
): Promise<ExtractedJobPageText> {
  const title = await firstText(TITLE_SELECTORS, session);
  let company = await firstText(COMPANY_SELECTORS, session);
  let location = await firstText(LOCATION_SELECTORS, session);

  if (!company || !location) {
    const headerLines = await readHeaderRow(session);
    company ||= headerLines[0] ?? "";
    location ||= headerLines[1] ?? "";
  }

  const page = {
    title,
    company,
    location,
    descriptionText: await firstRawText(DESCRIPTION_SELECTORS, session),
  };

  return {
    ...page,
    llmText: buildLlmText(page),
  };
}
