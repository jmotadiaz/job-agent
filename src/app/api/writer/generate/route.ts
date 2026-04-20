import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import fs from "node:fs";
import { PROFILE_PATH } from "@/lib/profile/load";
import { runWriter } from "@/lib/agents/writer/orchestrator";
import { log } from "@/lib/utils/log";

const BodySchema = z
  .object({
    jobId: z.string().min(1),
    parentGenerationId: z.string().optional().nullable(),
    feedbackRating: z.number().int().min(1).max(5).optional().nullable(),
    feedbackComment: z.string().optional().nullable(),
  })
  .refine(
    (d) => {
      if (d.parentGenerationId) return d.feedbackRating != null;
      return true;
    },
    {
      message: "feedbackRating is required when parentGenerationId is provided",
      path: ["feedbackRating"],
    },
  )
  .refine(
    (d) => {
      if (!d.parentGenerationId)
        return d.feedbackRating == null && d.feedbackComment == null;
      return true;
    },
    {
      message:
        "feedbackRating and feedbackComment must be null when parentGenerationId is not provided",
      path: ["feedbackRating"],
    },
  );

export async function POST(req: NextRequest) {
  const start = Date.now();
  log.info("api/writer/generate", "begin", { method: "POST" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    log.warn("api/writer/generate", "rejected: invalid json");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    log.warn("api/writer/generate", "rejected: validation", {
      issues: parsed.error.issues,
    });
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  if (!fs.existsSync(PROFILE_PATH)) {
    log.warn("api/writer/generate", "rejected: profile missing");
    return NextResponse.json(
      {
        error: "profile.md not found. Create it from profile.md.example first.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await runWriter(parsed.data);
    const duration = Date.now() - start;
    if (result.kind === "success") {
      log.info("api/writer/generate", "end", {
        kind: "success",
        generationId: result.generationId,
        duration,
      });
    } else {
      log.info("api/writer/generate", "end", {
        kind: "error",
        message: result.message,
        duration,
      });
    }
    return NextResponse.json(result, {
      status: result.kind === "success" ? 200 : 500,
    });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; stack?: string };
    log.error("api/writer/generate", "error", {
      message: e.message,
      stack: e.stack,
    });
    if (e.status === 404) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    const message = e.message ?? String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
