import * as fs from "node:fs";
import * as path from "node:path";

interface RunMeta {
  runId: string;
  kind: string;
  startedAt: string;
  finishedAt?: string;
  duration_ms?: number;
  outcome?: string;
  input?: Record<string, unknown>;
  result?: unknown;
}

interface TimelineEntry {
  ts: string;
  level: string;
  module: string;
  event: string;
  payload?: unknown;
}

interface AgentStep {
  ts: string;
  step: number;
  messages: string;
  toolCalls: Array<{ name: string; args: unknown }>;
  toolResults: Array<{ name: string; output: unknown }>;
  finishReason: string;
  usage?: unknown;
}

interface ArtifactInfo {
  name: string;
  size: number;
}

export function buildRunBundle(runDir: string): string {
  const sections: string[] = [];

  // Meta
  const metaPath = path.join(runDir, "meta.json");
  if (fs.existsSync(metaPath)) {
    const meta: RunMeta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    sections.push(`## Meta
- **Run ID:** ${meta.runId}
- **Kind:** ${meta.kind}
- **Started:** ${meta.startedAt}
- **Finished:** ${meta.finishedAt ?? "N/A"}
- **Duration:** ${meta.duration_ms ?? "N/A"}ms
- **Outcome:** ${meta.outcome ?? "N/A"}
- **Input:** ${JSON.stringify(meta.input ?? {}, null, 2)}
- **Result:** ${JSON.stringify(meta.result ?? null, null, 2)}`);
  }

  // Timeline
  const timelinePath = path.join(runDir, "timeline.jsonl");
  if (fs.existsSync(timelinePath)) {
    const content = fs.readFileSync(timelinePath, "utf8").trim();
    if (content) {
      const entries: TimelineEntry[] = content
        .split("\n")
        .map((line) => {
          try { return JSON.parse(line); } catch { return null; }
        })
        .filter(Boolean);

      const rows = entries
        .map(
          (e) =>
            `| ${e.ts} | ${e.level} | ${e.module} | ${e.event} | ${e.payload ? JSON.stringify(e.payload).slice(0, 100) : ""} |`,
        )
        .join("\n");

      sections.push(`## Timeline

| Timestamp | Level | Module | Event | Payload |
|-----------|-------|--------|-------|---------|
${rows}`);
    }
  }

  // Agent trace
  const tracePath = path.join(runDir, "agent-trace.jsonl");
  if (fs.existsSync(tracePath)) {
    const content = fs.readFileSync(tracePath, "utf8").trim();
    if (content) {
      const steps: AgentStep[] = content
        .split("\n")
        .map((line) => {
          try { return JSON.parse(line); } catch { return null; }
        })
        .filter(Boolean);

      const stepBlocks = steps
        .map((s) => {
          const toolCalls = s.toolCalls.length > 0
            ? s.toolCalls.map((tc) => `  - **${tc.name}:** ${JSON.stringify(tc.args).slice(0, 200)}`).join("\n")
            : "  (none)";

          const toolResults = s.toolResults.length > 0
            ? s.toolResults.map((tr) => `  - **${tr.name}:** ${JSON.stringify(tr.output).slice(0, 200)}`).join("\n")
            : "  (none)";

          return `### Step ${s.step} (${s.finishReason})
- **Messages:** ${s.messages.slice(0, 300) || "(empty)"}
- **Tool Calls:**
${toolCalls}
- **Tool Results:**
${toolResults}`;
        })
        .join("\n\n");

      sections.push(`## Agent Trace

${stepBlocks}`);
    }
  }

  // Artifacts
  const artifactsDir = path.join(runDir, "artifacts");
  if (fs.existsSync(artifactsDir)) {
    const entries = fs.readdirSync(artifactsDir, { withFileTypes: true });
    const artifacts: ArtifactInfo[] = entries
      .filter((e) => e.isFile())
      .map((e) => {
        const stat = fs.statSync(path.join(artifactsDir, e.name));
        return { name: e.name, size: stat.size };
      });

    if (artifacts.length > 0) {
      const rows = artifacts
        .map((a) => `| ${a.name} | ${a.size} bytes |`)
        .join("\n");

      sections.push(`## Artifacts (resumen)

| Name | Size |
|------|------|
${rows}`);
    }
  }

  return sections.join("\n\n");
}
