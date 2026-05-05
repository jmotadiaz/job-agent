import { NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { LOG_DIR } from "@/lib/runtime/paths";

function parseJsonl(filePath: string): unknown[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf8").trim();
  if (!content) return [];
  return content.split("\n").map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function getArtifacts(runDir: string): Array<{ name: string; size: number }> {
  const artifactsDir = path.join(runDir, "artifacts");
  if (!fs.existsSync(artifactsDir)) return [];

  const entries = fs.readdirSync(artifactsDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => {
      const stat = fs.statSync(path.join(artifactsDir, e.name));
      return { name: e.name, size: stat.size };
    });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const runDir = path.join(LOG_DIR, runId);

  if (!fs.existsSync(runDir)) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  try {
    const metaPath = path.join(runDir, "meta.json");
    const timelinePath = path.join(runDir, "timeline.jsonl");
    const tracePath = path.join(runDir, "agent-trace.jsonl");
    const reviewPath = path.join(runDir, "review.md");

    const meta = fs.existsSync(metaPath)
      ? JSON.parse(fs.readFileSync(metaPath, "utf8"))
      : null;
    const timeline = parseJsonl(timelinePath);
    const agentTrace = parseJsonl(tracePath);
    const artifacts = getArtifacts(runDir);
    const review = fs.existsSync(reviewPath)
      ? fs.readFileSync(reviewPath, "utf8")
      : null;

    return NextResponse.json(
      { meta, timeline, agentTrace, artifacts, review },
      { status: 200 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const runDir = path.join(LOG_DIR, runId);

  if (!fs.existsSync(runDir)) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  try {
    fs.rmSync(runDir, { recursive: true, force: true });
    return NextResponse.json({ deleted: runId }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
