# Full report template

Use this only when the user explicitly asks for a "complete report", "structured analysis", or similar.

## Report structure

```markdown
# Trace Analysis — {runId}

## Summary
- Kind: scout | writer
- Duration: X min Y s
- Outcome: {outcome}
- Result: {brief}
- Timeline events: {N}
- Agent steps: {M}
- Artifacts: {K}

## Performance
| Metric | Value |
|--------|-------|
| Total tokens | N |
| Cache hits | N |
| Avg tokens/step | N |
| Longest browser wait | N ms |
| Longest tool | name (N ms) |
| LLM calls | N |

## Events by module
| Module | Count |
|--------|-------|
| ... | ... |

## Warnings & errors
List with timestamps and payloads.

## Tool calls
| Tool | Calls | Tokens |
|------|-------|--------|
| ... | ... | ... |

## Kind-specific findings
Load `references/scout-analysis.md` or `references/writer-analysis.md` and include relevant findings here.

## Recommended actions
1. ...
```

Do not generate this full report unless the user asks for it. Answer specific questions with specific data.
