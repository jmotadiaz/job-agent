import { NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { LOG_DIR } from "@/lib/runtime/paths";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const runDir = path.join(LOG_DIR, runId);

  if (!fs.existsSync(runDir)) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  try {
    // Import dynamically to avoid circular deps
    const { reviewRun } = await import("@/lib/agents/reviewer/run");
    const review = await reviewRun(runId);
    return NextResponse.json({ review }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
