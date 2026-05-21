---
name: trace-analyzer
description: Analyze execution traces from Job Scout agent runs stored in log/<runId>/. Activated when the user provides a run ID and asks about debugging, auditing, or reviewing a specific agent session (scout or writer). Supports analyzing browser automation, LLM steps, errors, performance bottlenecks, and artifacts.
---

# Trace Analyzer

Analyze a run by its ID. All data lives under `log/<runId>/`.

## Input

The user provides a `runId` like `2026-05-20T16-00-00-021Z_3lB5gTTl`.

## Run layout

```
log/<runId>/
  meta.json          # kind, duration, outcome, result
  timeline.jsonl     # system events (level, module, event, payload)
  agent-trace.jsonl  # LLM steps (step, messages, toolCalls, toolResults, usage)
  artifacts/         # output files from the run
```

## Schema reference

**meta.json**
```json
{ "runId": "...", "kind": "scout" | "writer", "startedAt": "...", "finishedAt": "...", "duration_ms": 462372, "outcome": "matches" | "no-matches" | "error" | ..., "result": {...}, "input": {...} }
```

**timeline.jsonl** (line-delimited JSON)
```json
{ "ts": "ISO-8601", "level": "info" | "warn" | "error", "module": "scout/orchestrator" | "scout/tool" | "agent-browser/exec" | "fs" | "db" | ..., "event": "...", "payload": {...} }
```

**agent-trace.jsonl** (line-delimited JSON)
```json
{ "ts": "ISO-8601", "step": 0, "messages": "...", "toolCalls": [{"name":"...","args":{}}], "toolResults": [{"name":"...","output":{}}], "finishReason": "tool-calls" | "stop" | "error", "usage": {"inputTokens":0,"outputTokens":0,"totalTokens":0,"cachedInputTokens":0} }
```

## Steps

1. **Load meta.json** — confirm the run exists; extract `kind`, `duration_ms`, `outcome`, `result`.
2. **Count timeline events** — `wc -l log/<runId>/timeline.jsonl`; count levels and modules with `jq`.
3. **Count agent steps** — `wc -l log/<runId>/agent-trace.jsonl`; extract `finishReason` and `toolCalls` with `jq`.
4. **Extract warnings/errors** — `jq 'select(.level=="warn" or .level=="error")'`.
5. **Find slow operations** — `jq 'select(.event=="exec end" and .payload.duration > 10000)'` for browser waits; `jq 'select(.event | endswith(" end") and .payload.duration)'` for tool durations.
6. **Check token usage** — sum `usage.totalTokens` and `usage.cachedInputTokens` from `agent-trace.jsonl`.
7. **Scan artifacts** — `ls -la log/<runId>/artifacts/`.
8. **Tailor the rest to what the user asked.** Do not generate a full structured report unless the user explicitly asks for one. Answer the specific question with the specific data.

## Kind-specific analysis

After step 1, read the appropriate reference file based on `meta.kind`:

- If `kind == "scout"` → load `references/scout-analysis.md`
- If `kind == "writer"` → load `references/writer-analysis.md`

These files contain the module/event vocabulary, common patterns, and metrics relevant to that agent kind.

## Full report template

Only if the user asks for a "complete report", "structured analysis", or similar → load `references/report-template.md` and follow that output format.

## Script helper

For quick automated extraction:

```bash
python3 .agents/skills/trace-analyzer/analyze-trace.py <runId>        # markdown summary
python3 .agents/skills/trace-analyzer/analyze-trace.py <runId> --output json
python3 .agents/skills/trace-analyzer/analyze-trace.py <runId> --output text
```

## Constraints

- Read-only operations only. Never modify log files.
- Mask sensitive data (API keys, profile content, cookies) when quoting.
- Reference specific timestamps and step numbers when making claims.
