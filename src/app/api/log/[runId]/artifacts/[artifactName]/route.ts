import { NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { LOG_DIR } from "@/lib/runtime/paths";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string; artifactName: string }> },
) {
  const { runId, artifactName } = await params;

  // Prevent path traversal
  const safeArtifactName = path.basename(artifactName);
  const filePath = path.join(LOG_DIR, runId, "artifacts", safeArtifactName);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }

  try {
    const content = fs.readFileSync(filePath, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = content;
    }
    return NextResponse.json(parsed, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
