import { NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { LOG_DIR } from "@/lib/runtime/paths";

interface RunSummary {
  runId: string;
  kind: string;
  startedAt: string;
  finishedAt?: string;
  outcome?: string;
  hasReview: boolean;
}

export async function GET() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      return NextResponse.json([], { status: 200 });
    }

    const entries = fs.readdirSync(LOG_DIR, { withFileTypes: true });
    const runs: RunSummary[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const runDir = path.join(LOG_DIR, entry.name);
      const metaPath = path.join(runDir, "meta.json");

      if (!fs.existsSync(metaPath)) continue;

      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        const reviewPath = path.join(runDir, "review.md");
        const hasReview = fs.existsSync(reviewPath);

        runs.push({
          runId: meta.runId ?? entry.name,
          kind: meta.kind ?? "unknown",
          startedAt: meta.startedAt ?? "",
          finishedAt: meta.finishedAt,
          outcome: meta.outcome,
          hasReview,
        });
      } catch {
        // Skip directories with invalid meta.json
      }
    }

    // Sort by startedAt descending
    runs.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));

    return NextResponse.json(runs, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      return NextResponse.json({ deleted: 0 }, { status: 200 });
    }

    const entries = fs.readdirSync(LOG_DIR, { withFileTypes: true });
    let deleted = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const runDir = path.join(LOG_DIR, entry.name);
      fs.rmSync(runDir, { recursive: true, force: true });
      deleted++;
    }

    return NextResponse.json({ deleted }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
