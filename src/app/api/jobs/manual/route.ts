import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { insertJob } from "@/lib/db/jobs";
import { extractJobFromUrl } from "@/lib/agents/manual/extractor";
import { log } from "@/lib/utils/log";

const BodySchema = z.object({
  url: z.string().url(),
});

export async function POST(req: NextRequest) {
  const start = Date.now();
  log.info("api/jobs/manual", "begin");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { url } = parsed.data;

  let extracted;
  try {
    extracted = await extractJobFromUrl(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("api/jobs/manual", "extraction failed", { url, message: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const job = insertJob({
    id: nanoid(),
    source: "manual",
    external_id: url,
    url,
    title: extracted.title,
    company: extracted.company,
    location: extracted.location,
    description_md: extracted.description_md,
    raw_snapshot: extracted.raw_text,
    match_score: 1.0,
    match_reason: "Manually added by user",
    status: "shortlisted",
  });

  log.info("api/jobs/manual", "end", {
    id: job.id,
    title: job.title,
    duration: Date.now() - start,
  });

  return NextResponse.json({ job });
}
