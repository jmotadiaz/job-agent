# Writer-specific analysis reference

Use this file when `meta.kind == "writer"`.

## Key modules and events

| Module | Events | Meaning |
|--------|--------|---------|
| `writer/orchestrator` | `writer invoke begin/end` | Run lifecycle |
| `writer/tool` | `generateCv begin/end` | CV generation |
| `writer/tool` | `generateCover begin/end` | Cover letter generation |
| `writer/tool` | `generateCv llm call`, `generateCover llm call` | LLM call for document generation |
| `fs` | `dump written` | Artifact or PDF written |
| `db` | `generations upsert` | Generation record saved |

## Writer flow

1. **Input** — `meta.input` contains `jobId` being processed
2. **CV generation** — `generateCv` tool call in agent trace
3. **Cover generation** — `generateCover` tool call in agent trace
4. **Output** — artifacts in `artifacts/` (`.pdf`, `.md`)

## Metrics to check

- Token usage per document (CV vs cover)
- LLM call duration per generation step
- Whether both documents were produced or one failed
- Artifact files present and sizes

## jq snippets

```bash
RUN_ID="<runId>"
TL="log/${RUN_ID}/timeline.jsonl"
AT="log/${RUN_ID}/agent-trace.jsonl"

# Generation events
jq 'select(.event | startswith("generate")) | {ts, event, duration_ms: .payload.duration}' "$TL"

# LLM calls during writing
jq 'select(.event | endswith("llm call")) | {ts, event, model: .payload.model, duration_ms: .payload.duration}' "$TL"

# Artifacts
ls -la "log/${RUN_ID}/artifacts/"

# Agent steps for writer
jq '{step, toolCalls: [.toolCalls[].name], totalTokens: .usage.totalTokens}' "$AT"
```
