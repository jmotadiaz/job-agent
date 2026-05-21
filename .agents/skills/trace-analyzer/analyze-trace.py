#!/usr/bin/env python3
"""
Trace Analyzer for Job Scout runs.
Usage: python analyze-trace.py <runId> [--output json|markdown|text]

Example: python analyze-trace.py 2026-05-20T16-00-00-021Z_3lB5gTTl
"""

import json
import sys
import os
import argparse
from pathlib import Path
from datetime import datetime
from collections import Counter, defaultdict


def load_jsonl(path: Path) -> list:
    """Load a JSONL file, skipping malformed lines."""
    records = []
    with open(path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as e:
                print(f"Warning: malformed JSON on line {i} of {path}: {e}", file=sys.stderr)
    return records


def format_duration(ms: int) -> str:
    """Format milliseconds to human-readable duration."""
    if ms < 1000:
        return f"{ms}ms"
    seconds = ms // 1000
    minutes = seconds // 60
    hours = minutes // 60
    if hours > 0:
        return f"{hours}h {minutes % 60}m {seconds % 60}s"
    if minutes > 0:
        return f"{minutes}m {seconds % 60}s"
    return f"{seconds}s"


def analyze_meta(meta: dict) -> dict:
    """Extract key info from meta.json."""
    return {
        "run_id": meta.get("runId", "unknown"),
        "kind": meta.get("kind", "unknown"),
        "started_at": meta.get("startedAt", "unknown"),
        "finished_at": meta.get("finishedAt", "unknown"),
        "duration_ms": meta.get("duration_ms", 0),
        "duration_human": format_duration(meta.get("duration_ms", 0)),
        "outcome": meta.get("outcome", "unknown"),
        "result": meta.get("result", {}),
        "input": meta.get("input", {}),
    }


def analyze_timeline(timeline: list) -> dict:
    """Analyze timeline.jsonl events."""
    if not timeline:
        return {"total": 0, "levels": {}, "modules": {}, "events": {}, "warnings": [], "errors": [], "durations": []}

    levels = Counter()
    modules = Counter()
    events = Counter()
    warnings = []
    errors = []
    tool_durations = []
    exec_durations = []
    llm_calls = []
    dismiss_events = []
    save_jobs = []
    list_jobs = []

    for record in timeline:
        level = record.get("level", "unknown")
        module = record.get("module", "unknown")
        event = record.get("event", "unknown")
        payload = record.get("payload", {})
        ts = record.get("ts", "")

        levels[level] += 1
        modules[module] += 1
        events[f"{module} → {event}"] += 1

        if level == "warn":
            warnings.append({"ts": ts, "module": module, "event": event, "payload": payload})
        if level == "error":
            errors.append({"ts": ts, "module": module, "event": event, "payload": payload})

        # Tool durations from end events
        if event.endswith(" end") and "duration" in payload:
            tool_durations.append({
                "event": event,
                "duration_ms": payload["duration"],
                "ts": ts,
                "payload": payload,
            })

        # Browser exec durations
        if module == "agent-browser/exec" and event == "exec end" and "duration" in payload:
            exec_durations.append({
                "ts": ts,
                "duration_ms": payload["duration"],
                "args": payload.get("args", []),
            })

        # LLM call durations
        if event == "fetchJobDetail llm call":
            llm_calls.append({
                "ts": ts,
                "model": payload.get("model", "unknown"),
                "duration_ms": payload.get("duration", 0),
            })

        # Dismiss events
        if event.startswith("dismiss-"):
            dismiss_events.append({"ts": ts, "event": event, "payload": payload})

        # Save jobs
        if event == "saveJob end":
            save_jobs.append(payload)

        # List jobs stats
        if event == "listVisibleJobs end":
            list_jobs.append(payload)
        if event == "listVisibleJobs filtering results":
            list_jobs.append(payload)

    return {
        "total": len(timeline),
        "levels": dict(levels),
        "modules": dict(modules),
        "events": dict(events),
        "warnings": warnings,
        "errors": errors,
        "tool_durations": sorted(tool_durations, key=lambda x: x["duration_ms"], reverse=True)[:10],
        "exec_durations": sorted(exec_durations, key=lambda x: x["duration_ms"], reverse=True)[:10],
        "llm_calls": llm_calls,
        "dismiss_events": dismiss_events,
        "save_jobs": save_jobs,
        "list_jobs": list_jobs,
    }


def analyze_agent_trace(agent_trace: list) -> dict:
    """Analyze agent-trace.jsonl steps."""
    if not agent_trace:
        return {"total_steps": 0, "finish_reasons": {}, "tool_calls": {}, "token_usage": {}, "steps": []}

    finish_reasons = Counter()
    tool_calls = Counter()
    total_input = 0
    total_output = 0
    total_tokens = 0
    total_cached = 0
    token_by_tool = defaultdict(int)

    steps_summary = []

    for record in agent_trace:
        step = record.get("step", 0)
        finish_reason = record.get("finishReason", "unknown")
        finish_reasons[finish_reason] += 1

        usage = record.get("usage", {})
        input_tokens = usage.get("inputTokens", 0)
        output_tokens = usage.get("outputTokens", 0)
        cached = usage.get("cachedInputTokens", 0)
        total = usage.get("totalTokens", 0)

        total_input += input_tokens
        total_output += output_tokens
        total_tokens += total
        total_cached += cached

        calls = record.get("toolCalls", [])
        primary_tool = calls[0]["name"] if calls else "none"
        tool_calls[primary_tool] += 1

        for call in calls:
            token_by_tool[call["name"]] += total

        steps_summary.append({
            "step": step,
            "ts": record.get("ts", ""),
            "primary_tool": primary_tool,
            "finish_reason": finish_reason,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": total,
            "cached": cached,
            "num_tool_calls": len(calls),
        })

    return {
        "total_steps": len(agent_trace),
        "finish_reasons": dict(finish_reasons),
        "tool_calls": dict(tool_calls),
        "token_usage": {
            "total_input": total_input,
            "total_output": total_output,
            "total_tokens": total_tokens,
            "total_cached": total_cached,
            "avg_per_step": round(total_tokens / len(agent_trace), 0) if agent_trace else 0,
        },
        "token_by_tool": dict(token_by_tool),
        "steps": steps_summary,
    }


def analyze_artifacts(artifacts_dir: Path) -> dict:
    """Analyze artifacts directory."""
    if not artifacts_dir.exists():
        return {"total": 0, "types": {}, "largest": [], "files": []}

    files = []
    types = Counter()
    for f in sorted(artifacts_dir.iterdir()):
        if f.is_file():
            size = f.stat().st_size
            # Extract type from filename (e.g., 01_dismiss_miss.json -> dismiss_miss)
            name = f.name
            if "_" in name:
                type_name = name.split("_", 1)[1].rsplit(".", 1)[0]
            else:
                type_name = name.rsplit(".", 1)[0]
            types[type_name] += 1
            files.append({"name": name, "type": type_name, "size": size})

    largest = sorted(files, key=lambda x: x["size"], reverse=True)[:5]

    return {
        "total": len(files),
        "types": dict(types),
        "largest": largest,
        "files": files,
    }


def generate_markdown_report(meta_info: dict, timeline_info: dict, trace_info: dict, artifacts_info: dict) -> str:
    """Generate a markdown analysis report."""
    lines = []
    lines.append(f"# Trace Analysis Report — {meta_info['run_id']}")
    lines.append("")

    # Summary
    lines.append("## Run Summary")
    lines.append(f"- **Kind**: {meta_info['kind']}")
    lines.append(f"- **Duration**: {meta_info['duration_human']} ({meta_info['duration_ms']:,} ms)")
    lines.append(f"- **Outcome**: {meta_info['outcome']}")
    if meta_info['result']:
        lines.append(f"- **Result**: {json.dumps(meta_info['result'], indent=2)}")
    lines.append(f"- **Timeline events**: {timeline_info['total']}")
    lines.append(f"- **Agent steps**: {trace_info['total_steps']}")
    lines.append(f"- **Artifacts**: {artifacts_info['total']}")
    lines.append("")

    # Performance
    lines.append("## Performance Metrics")
    if trace_info['token_usage']:
        tu = trace_info['token_usage']
        lines.append(f"| Metric | Value |")
        lines.append(f"|--------|-------|")
        lines.append(f"| Total tokens | {tu['total_tokens']:,} |")
        lines.append(f"| Input tokens | {tu['total_input']:,} |")
        lines.append(f"| Output tokens | {tu['total_output']:,} |")
        lines.append(f"| Cache hits | {tu['total_cached']:,} |")
        lines.append(f"| Avg tokens/step | {tu['avg_per_step']:,} |")
    lines.append("")

    if timeline_info['exec_durations']:
        longest = timeline_info['exec_durations'][0]
        lines.append(f"| Longest browser wait | {format_duration(longest['duration_ms'])} |")
    if timeline_info['tool_durations']:
        longest = timeline_info['tool_durations'][0]
        lines.append(f"| Longest tool | {longest['event']} ({format_duration(longest['duration_ms'])}) |")
    if timeline_info['llm_calls']:
        total_llm = len(timeline_info['llm_calls'])
        avg_llm = sum(c['duration_ms'] for c in timeline_info['llm_calls']) // total_llm if total_llm else 0
        lines.append(f"| LLM calls | {total_llm} (avg {format_duration(avg_llm)}) |")
    lines.append("")

    # Event summary
    lines.append("## Event Summary")
    lines.append("| Module | Events |")
    lines.append("|--------|--------|")
    for module, count in sorted(timeline_info['modules'].items(), key=lambda x: x[1], reverse=True):
        lines.append(f"| {module} | {count} |")
    lines.append("")

    # Warnings and errors
    if timeline_info['warnings'] or timeline_info['errors']:
        lines.append("## Warnings & Errors")
        if timeline_info['errors']:
            lines.append(f"### Errors ({len(timeline_info['errors'])})")
            for e in timeline_info['errors'][:10]:
                lines.append(f"- `{e['ts']}` **{e['module']}** → `{e['event']}`")
        if timeline_info['warnings']:
            lines.append(f"### Warnings ({len(timeline_info['warnings'])})")
            for w in timeline_info['warnings'][:10]:
                lines.append(f"- `{w['ts']}` **{w['module']}** → `{w['event']}`")
                if w['payload']:
                    payload_str = json.dumps(w['payload'])[:200]
                    lines.append(f"  - Payload: `{payload_str}`")
        lines.append("")

    # Tool call breakdown
    if trace_info['tool_calls']:
        lines.append("## Tool Call Breakdown")
        lines.append("| Tool | Calls | Tokens |")
        lines.append("|------|-------|--------|")
        for tool, calls in sorted(trace_info['tool_calls'].items(), key=lambda x: x[1], reverse=True):
            tokens = trace_info['token_by_tool'].get(tool, 0)
            lines.append(f"| {tool} | {calls} | {tokens:,} |")
        lines.append("")

    # Scout-specific
    if meta_info['kind'] == 'scout':
        lines.append("## Scout Findings")

        if timeline_info['list_jobs']:
            for lj in timeline_info['list_jobs']:
                if 'total_extracted' in lj:
                    lines.append(f"- Jobs extracted: {lj.get('total_extracted', '?')} → after dedup: {lj.get('after_title_dedup', '?')} → after DB filter: {lj.get('new_after_db_filter', '?')}")
                elif 'total_visible' in lj:
                    lines.append(f"- listVisibleJobs: {lj.get('total_visible', '?')} visible, {lj.get('new_count', '?')} new, duration: {format_duration(lj.get('duration', 0))}")

        if timeline_info['save_jobs']:
            lines.append(f"- Jobs saved: {len(timeline_info['save_jobs'])}")
            for sj in timeline_info['save_jobs']:
                lines.append(f"  - `{sj.get('external_id', '?')}` score={sj.get('score', '?')} id={sj.get('jobId', '?')}")

        if timeline_info['dismiss_events']:
            attempts = sum(1 for d in timeline_info['dismiss_events'] if d['event'] == 'dismiss-attempt')
            hits = sum(1 for d in timeline_info['dismiss_events'] if d['event'] == 'dismiss-hit')
            misses = sum(1 for d in timeline_info['dismiss_events'] if d['event'] == 'dismiss-miss')
            lines.append(f"- Overlay dismiss: {attempts} attempts, {hits} hits, {misses} misses ({round(misses/max(attempts,1)*100, 1)}% miss rate)")
        lines.append("")

    # Slow operations
    if timeline_info['exec_durations']:
        lines.append("## Slow Browser Operations")
        lines.append("| Operation | Duration | Timestamp |")
        lines.append("|-----------|----------|-----------|")
        for op in timeline_info['exec_durations'][:5]:
            args = ' '.join(op['args'][:3]) if op['args'] else 'unknown'
            lines.append(f"| {args} | {format_duration(op['duration_ms'])} | {op['ts']} |")
        lines.append("")

    # Artifacts
    if artifacts_info['total'] > 0:
        lines.append("## Artifacts")
        lines.append(f"Total: {artifacts_info['total']} files")
        lines.append("| Type | Count |")
        lines.append("|------|-------|")
        for t, c in sorted(artifacts_info['types'].items(), key=lambda x: x[1], reverse=True):
            lines.append(f"| {t} | {c} |")
        lines.append("")

    # Steps summary
    if trace_info['steps']:
        lines.append("## Agent Steps Summary")
        lines.append("| Step | Tool | Finish | Tokens | Cached |")
        lines.append("|------|------|--------|--------|--------|")
        for step in trace_info['steps'][:20]:
            lines.append(f"| {step['step']} | {step['primary_tool']} | {step['finish_reason']} | {step['total_tokens']:,} | {step['cached']:,} |")
        if len(trace_info['steps']) > 20:
            lines.append(f"| ... | ({len(trace_info['steps']) - 20} more steps) | | | |")
        lines.append("")

    return "\n".join(lines)


def generate_json_report(meta_info: dict, timeline_info: dict, trace_info: dict, artifacts_info: dict) -> str:
    """Generate a JSON analysis report."""
    report = {
        "meta": meta_info,
        "timeline_summary": {
            "total_events": timeline_info["total"],
            "levels": timeline_info["levels"],
            "modules": timeline_info["modules"],
            "warnings_count": len(timeline_info["warnings"]),
            "errors_count": len(timeline_info["errors"]),
            "top_warnings": timeline_info["warnings"][:5],
            "top_errors": timeline_info["errors"][:5],
            "slow_execs": timeline_info["exec_durations"][:5],
            "slow_tools": timeline_info["tool_durations"][:5],
            "llm_calls": timeline_info["llm_calls"],
            "dismiss_events": timeline_info["dismiss_events"],
            "save_jobs": timeline_info["save_jobs"],
            "list_jobs": timeline_info["list_jobs"],
        },
        "agent_trace_summary": {
            "total_steps": trace_info["total_steps"],
            "finish_reasons": trace_info["finish_reasons"],
            "tool_calls": trace_info["tool_calls"],
            "token_usage": trace_info["token_usage"],
            "token_by_tool": trace_info["token_by_tool"],
        },
        "artifacts_summary": artifacts_info,
    }
    return json.dumps(report, indent=2, default=str)


def main():
    parser = argparse.ArgumentParser(description="Analyze Job Scout execution traces")
    parser.add_argument("run_id", help="Run ID to analyze (e.g., 2026-05-20T16-00-00-021Z_3lB5gTTl)")
    parser.add_argument("--output", choices=["json", "markdown", "text"], default="markdown",
                        help="Output format (default: markdown)")
    parser.add_argument("--log-dir", default="log", help="Base log directory (default: log)")
    args = parser.parse_args()

    log_base = Path(args.log_dir)
    run_dir = log_base / args.run_id

    if not run_dir.exists():
        print(f"Error: Run directory not found: {run_dir}", file=sys.stderr)
        print(f"Available runs:", file=sys.stderr)
        if log_base.exists():
            for d in sorted(log_base.iterdir()):
                if d.is_dir() and not d.name.startswith("."):
                    print(f"  - {d.name}", file=sys.stderr)
        sys.exit(1)

    # Load files
    meta_path = run_dir / "meta.json"
    timeline_path = run_dir / "timeline.jsonl"
    trace_path = run_dir / "agent-trace.jsonl"
    artifacts_dir = run_dir / "artifacts"

    if not meta_path.exists():
        print(f"Error: meta.json not found in {run_dir}", file=sys.stderr)
        sys.exit(1)

    meta = json.loads(meta_path.read_text())
    timeline = load_jsonl(timeline_path) if timeline_path.exists() else []
    agent_trace = load_jsonl(trace_path) if trace_path.exists() else []

    # Analyze
    meta_info = analyze_meta(meta)
    timeline_info = analyze_timeline(timeline)
    trace_info = analyze_agent_trace(agent_trace)
    artifacts_info = analyze_artifacts(artifacts_dir)

    # Output
    if args.output == "json":
        print(generate_json_report(meta_info, timeline_info, trace_info, artifacts_info))
    elif args.output == "markdown":
        print(generate_markdown_report(meta_info, timeline_info, trace_info, artifacts_info))
    else:
        # Text format
        print(f"Run: {meta_info['run_id']}")
        print(f"Kind: {meta_info['kind']}")
        print(f"Duration: {meta_info['duration_human']}")
        print(f"Outcome: {meta_info['outcome']}")
        print(f"Events: {timeline_info['total']}, Steps: {trace_info['total_steps']}, Artifacts: {artifacts_info['total']}")
        print(f"Tokens: {trace_info['token_usage'].get('total_tokens', 0):,}")
        if timeline_info['warnings']:
            print(f"Warnings: {len(timeline_info['warnings'])}")
        if timeline_info['errors']:
            print(f"Errors: {len(timeline_info['errors'])}")


if __name__ == "__main__":
    main()
