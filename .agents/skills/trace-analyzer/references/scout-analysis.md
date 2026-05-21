# Scout-specific analysis reference

Use this file when `meta.kind == "scout"`.

## Key modules and events

| Module | Events | Meaning |
|--------|--------|---------|
| `scout/orchestrator` | `profile loaded`, `agent invoke begin/end` | Run lifecycle |
| `scout/tool` | `openSearch begin/end` | Search query execution |
| `scout/tool` | `listVisibleJobs begin/end` | Job extraction from page |
| `scout/tool` | `listVisibleJobs: extracted from snapshot text` | Individual job found |
| `scout/tool` | `listVisibleJobs filtering results` | Deduplication + DB filter stats |
| `scout/tool` | `fetchJobDetail begin/end` | Detail page scraping |
| `scout/tool` | `fetchJobDetail llm call` | LLM parsing of raw description |
| `scout/tool` | `saveJob begin/end` | Job saved to DB |
| `agent-browser/exec` | `exec begin/end` | Browser commands (open, wait, click, snapshot, scroll, get) |
| `agent-browser/exec` | `dismiss-attempt`, `dismiss-hit`, `dismiss-miss` | Overlay handling (cookie wall, login wall) |
| `fs` | `dump written` | Artifact written |
| `db` | `jobs insertJob` | Job inserted into DB |

## Job extraction flow (check in order)

1. **Search** — `openSearch end` → check `url` and `duration`
2. **Extraction** — `listVisibleJobs filtering results` →
   - `total_extracted`: raw jobs found
   - `after_title_dedup`: after removing duplicates
   - `new_after_db_filter`: jobs not already in DB
3. **Evaluation** — `fetchJobDetail end` → check `candidateCount`, `details`, `duration`
4. **Saving** — `saveJob end` → check `score`, `jobId`, `reason`

## Common patterns

### Low or zero new jobs
- `new_after_db_filter == 0` → all jobs already in DB (not a bug, just no new results)
- `total_extracted == 0` → extraction failed, check `dismiss-miss` or page load errors

### Dismiss overlay issues
- `dismiss-miss` means a cookie/login wall was not closed properly
- Correlates with slow `wait --load networkidle` (>20s)
- Missed overlays often cause zero extraction or wrong page state
- Check the snapshot artifact (`*_dismiss_miss.json`) for the actual page state

### Slow browser waits
- `wait --load networkidle` taking >20s usually means LinkedIn throttling or anti-automation
- Pattern: repeated ~25s waits across multiple `fetchJobDetail` calls

### Max candidates reached
- `scout/runtime` → `max-candidates reached` with `count` and `max`
- Agent stopped evaluating after hitting the limit

### LLM call metrics
- `fetchJobDetail llm call` → `model`, `duration`
- Slow LLM calls (>10s) may indicate model congestion

## jq snippets

```bash
RUN_ID="<runId>"
TL="log/${RUN_ID}/timeline.jsonl"

# Job extraction stats
jq 'select(.event == "listVisibleJobs filtering results") | .payload' "$TL"

# Saved jobs
jq 'select(.event == "saveJob end") | .payload' "$TL"

# Dismiss results
jq 'select(.event | startswith("dismiss-")) | {ts, event}' "$TL"

# Slow browser waits
jq 'select(.module == "agent-browser/exec" and .event == "exec end" and .payload.duration > 10000) | {ts, duration_ms: .payload.duration, cmd: .payload.args[2]}' "$TL"

# Tool durations
jq 'select(.event | endswith(" end") and .payload.duration) | {event, ts, duration_ms: .payload.duration}' "$TL"

# LLM calls
jq 'select(.event == "fetchJobDetail llm call") | {ts, model: .payload.model, duration_ms: .payload.duration}' "$TL"
```
