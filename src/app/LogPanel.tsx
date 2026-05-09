"use client";

import { useState, useEffect, useCallback } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import {
  ArrowLeft,
  Trash2,
  RefreshCw,
  FileText,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Download,
  FileJson,
  Copy,
  Check,
  ArrowRight,
} from "lucide-react";
import { JsonBlock } from "./log/[runId]/JsonBlock";

interface RunSummary {
  runId: string;
  kind: string;
  startedAt: string;
  finishedAt?: string;
  outcome?: string;
  hasReview: boolean;
}

interface RunDetail {
  meta: {
    runId: string;
    kind: string;
    startedAt: string;
    finishedAt?: string;
    duration_ms?: number;
    outcome?: string;
    input?: Record<string, unknown>;
    result?: unknown;
  } | null;
  timeline: Array<{
    ts: string;
    level: string;
    module: string;
    event: string;
    payload?: unknown;
  }>;
  agentTrace: Array<{
    ts: string;
    step: number;
    messages: string;
    toolCalls: Array<{ name: string; args: unknown }>;
    toolResults: Array<{ name: string; output: unknown }>;
    finishReason: string;
    usage?: unknown;
  }>;
  artifacts: Array<{ name: string; size: number }>;
  review: string | null;
}

interface ArtifactContent {
  name: string;
  data: unknown;
  loading: boolean;
  error: string | null;
}

function outcomeBadge(outcome?: string) {
  if (!outcome) return null;
  const cls =
    outcome === "match" || outcome === "ok"
      ? "bg-[var(--green-bg)] text-[var(--green)] border border-[rgba(134,239,172,0.2)]"
      : outcome === "error"
        ? "bg-[var(--red-bg)] text-[var(--red)] border border-[rgba(252,165,165,0.2)]"
        : "bg-[var(--amber-bg)] text-[var(--amber)] border border-[rgba(253,224,71,0.2)]";
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {outcome}
    </span>
  );
}

function kindBadge(kind: string) {
  const cls =
    kind === "scout"
      ? "bg-[var(--blue-bg)] text-[var(--blue)] border border-[rgba(147,197,253,0.2)]"
      : kind === "writer"
        ? "bg-[rgba(216,180,254,0.05)] text-[#d8b4fe] border border-[rgba(216,180,254,0.2)]"
        : "bg-[rgba(251,146,60,0.05)] text-[#fb923c] border border-[rgba(251,146,60,0.2)]";
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {kind}
    </span>
  );
}

function LogIndex({
  onSelectRun,
  onClearAll,
}: {
  onSelectRun: (runId: string) => void;
  onClearAll: () => void;
}) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/log");
      if (!res.ok) throw new Error("Failed to fetch logs");
      const data = await res.json();
      setRuns(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/log")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch logs");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setRuns(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <div>
          <p className="text-sm text-[var(--text-muted)]">
            {runs.length} run{runs.length !== 1 ? "s" : ""} recorded
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchRuns}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors min-h-[44px]"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            onClick={onClearAll}
            disabled={runs.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-[var(--red-bg)] text-[var(--red)] border border-[rgba(252,165,165,0.2)] rounded-lg hover:bg-[rgba(252,165,165,0.2)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
          >
            <Trash2 size={14} />
            Clear all
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-[var(--red-bg)] border border-[rgba(252,165,165,0.2)] rounded-lg flex items-center gap-2 text-[var(--red)] text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          Loading...
        </div>
      ) : runs.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          No runs recorded yet. Run a scout or writer to see logs here.
        </div>
      ) : (
        <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-[var(--bg-raised)] border-b border-[var(--border)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase min-w-[180px]">
                    Run ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase min-w-[80px]">
                    Kind
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase min-w-[160px]">
                    Started
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase min-w-[100px]">
                    Outcome
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase min-w-[80px]">
                    Review
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase w-10">
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {runs.map((run) => (
                  <tr
                    key={run.runId}
                    className="hover:bg-[var(--bg-hover)] transition-colors group"
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onSelectRun(run.runId)}
                        className="text-sm font-mono text-[var(--blue)] hover:underline cursor-pointer bg-transparent border-none p-0 m-0"
                      >
                        {run.runId}
                      </button>
                    </td>
                    <td className="px-4 py-3">{kindBadge(run.kind)}</td>
                    <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                      {run.startedAt
                        ? new Date(run.startedAt).toLocaleString()
                        : "N/A"}
                    </td>
                    <td className="px-4 py-3">
                      {outcomeBadge(run.outcome)}
                    </td>
                    <td className="px-4 py-3">
                      {run.hasReview ? (
                        <span className="text-[var(--green)] text-sm flex items-center gap-1">
                          <FileText size={14} />
                          Yes
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)] text-sm">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onSelectRun(run.runId)}
                        className="p-1.5 rounded-lg bg-[var(--bg-raised)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all opacity-0 group-hover:opacity-100"
                        title="View details"
                      >
                        <ArrowRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function LogDetail({
  runId,
  onBack,
  onDeleted,
}: {
  runId: string;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [expandedTimeline, setExpandedTimeline] = useState<Set<number>>(new Set());
  const [expandedArtifacts, setExpandedArtifacts] = useState<Set<string>>(new Set());
  const [artifactContents, setArtifactContents] = useState<Map<string, ArtifactContent>>(new Map());
  const [reviewing, setReviewing] = useState(false);
  const [reviewCopied, setReviewCopied] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/log/${runId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("Run not found");
          return;
        }
        throw new Error("Failed to fetch run detail");
      }
      const data = await res.json();
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleDelete = async () => {
    if (!confirm("Delete this log? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/log/${runId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete log");
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleReview = async () => {
    setReviewing(true);
    try {
      const res = await fetch(`/api/log/${runId}/review`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to generate review");
      await fetchDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setReviewing(false);
    }
  };

  const handleCopyReview = async () => {
    if (!detail?.review) return;
    try {
      await navigator.clipboard.writeText(detail.review);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = detail.review;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setReviewCopied(true);
    setTimeout(() => setReviewCopied(false), 2000);
  };

  const toggleStep = (step: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });
  };

  const toggleTimeline = (index: number) => {
    setExpandedTimeline((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleArtifact = async (name: string) => {
    setExpandedArtifacts((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
        return next;
      }
      next.add(name);
      return next;
    });

    if (!artifactContents.has(name)) {
      setArtifactContents((prev) => {
        const next = new Map(prev);
        next.set(name, { name, data: null, loading: true, error: null });
        return next;
      });
      try {
        const res = await fetch(`/api/log/${runId}/artifacts/${encodeURIComponent(name)}`);
        if (!res.ok) throw new Error("Failed to load artifact");
        const data = await res.json();
        setArtifactContents((prev) => {
          const next = new Map(prev);
          next.set(name, { name, data, loading: false, error: null });
          return next;
        });
      } catch (err) {
        setArtifactContents((prev) => {
          const next = new Map(prev);
          next.set(name, { name, data: null, loading: false, error: err instanceof Error ? err.message : "Unknown error" });
          return next;
        });
      }
    }
  };

  const uniqueModules = detail
    ? [...new Set(detail.timeline.map((e) => e.module))].sort()
    : [];

  const filteredTimeline = detail
    ? detail.timeline.filter((e) => {
        if (levelFilter !== "all" && e.level !== levelFilter) return false;
        if (moduleFilter !== "all" && e.module !== moduleFilter) return false;
        return true;
      })
    : [];

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="text-center py-12 text-[var(--text-muted)]">
          Loading...
        </div>
      </div>
    );
  }

  if (error === "Run not found") {
    return (
      <div className="animate-fade-in">
        <div className="text-center py-12">
          <p className="text-[var(--text-muted)] mb-4">Run not found</p>
          <button onClick={onBack} className="text-[var(--blue)] hover:underline">
            Back to logs
          </button>
        </div>
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-[var(--text-secondary)]"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)] font-mono">
              {runId}
            </h2>
            {detail.meta && (
              <p className="text-sm text-[var(--text-muted)]">
                {detail.meta.kind} · {new Date(detail.meta.startedAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {!detail.review && (
            <button
              onClick={handleReview}
              disabled={reviewing}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-[rgba(216,180,254,0.05)] text-[#d8b4fe] border border-[rgba(216,180,254,0.2)] rounded-lg hover:bg-[rgba(216,180,254,0.1)] disabled:opacity-50 transition-colors min-h-[44px]"
            >
              <Sparkles size={14} />
              {reviewing ? "Reviewing..." : "Request review"}
            </button>
          )}
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-[var(--red-bg)] text-[var(--red)] border border-[rgba(252,165,165,0.2)] rounded-lg hover:bg-[rgba(252,165,165,0.2)] transition-colors min-h-[44px]"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-[var(--red-bg)] border border-[rgba(252,165,165,0.2)] rounded-lg text-[var(--red)] text-sm">
          {error}
        </div>
      )}

      {detail.meta && (
        <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] p-4 mb-6">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">
            Run Info
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-[var(--text-muted)] block text-xs uppercase tracking-wider">
                Kind
              </span>
              <p className="font-medium text-[var(--text-primary)]">
                {detail.meta.kind}
              </p>
            </div>
            <div>
              <span className="text-[var(--text-muted)] block text-xs uppercase tracking-wider">
                Outcome
              </span>
              <p className="font-medium text-[var(--text-primary)]">
                {detail.meta.outcome ?? "N/A"}
              </p>
            </div>
            <div>
              <span className="text-[var(--text-muted)] block text-xs uppercase tracking-wider">
                Duration
              </span>
              <p className="font-medium text-[var(--text-primary)]">
                {detail.meta.duration_ms
                  ? `${(detail.meta.duration_ms / 1000).toFixed(1)}s`
                  : "N/A"}
              </p>
            </div>
            <div>
              <span className="text-[var(--text-muted)] block text-xs uppercase tracking-wider">
                Started
              </span>
              <p className="font-medium text-[var(--text-primary)]">
                {new Date(detail.meta.startedAt).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {detail.review && (
        <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[var(--text-secondary)] flex items-center gap-2">
              <Sparkles size={16} className="text-[#d8b4fe]" />
              Review
            </h3>
            <button
              onClick={handleCopyReview}
              className="p-1.5 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              title="Copy review"
            >
              {reviewCopied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <div className="prose prose-sm max-w-none text-[var(--text-secondary)]">
            <Streamdown mode="static">{detail.review}</Streamdown>
          </div>
          <button
            onClick={handleReview}
            disabled={reviewing}
            className="mt-4 text-sm text-[#d8b4fe] hover:underline disabled:opacity-50"
          >
            {reviewing ? "Re-reviewing..." : "Re-review"}
          </button>
        </div>
      )}

      <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] mb-6">
        <div className="p-4 border-b border-[var(--border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
            Timeline ({filteredTimeline.length} events)
          </h3>
          <div className="flex gap-2 flex-wrap w-full sm:w-auto">
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="text-xs border border-[var(--border)] rounded px-2 py-1.5 bg-[var(--bg-primary)] text-[var(--text-primary)] min-h-[44px] min-w-[100px]"
            >
              <option value="all">All levels</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="text-xs border border-[var(--border)] rounded px-2 py-1.5 bg-[var(--bg-primary)] text-[var(--text-primary)] min-h-[44px] min-w-[100px]"
            >
              <option value="all">All modules</option>
              {uniqueModules.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[600px]">
              <thead className="bg-[var(--bg-raised)] sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-[var(--text-muted)] min-w-[80px]">
                    Time
                  </th>
                  <th className="px-3 py-2 text-left text-[var(--text-muted)] min-w-[50px]">
                    Level
                  </th>
                  <th className="px-3 py-2 text-left text-[var(--text-muted)] min-w-[120px]">
                    Module
                  </th>
                  <th className="px-3 py-2 text-left text-[var(--text-muted)] min-w-[120px]">
                    Event
                  </th>
                  <th className="px-3 py-2 text-left text-[var(--text-muted)] min-w-[200px]">
                    Payload
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredTimeline.map((e, i) => (
                  <tr
                    key={i}
                    className="hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <td className="px-3 py-1.5 font-mono text-[var(--text-muted)] whitespace-nowrap">
                      {new Date(e.ts).toLocaleTimeString()}
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={
                          e.level === "error"
                            ? "text-[var(--red)] font-medium"
                            : e.level === "warn"
                              ? "text-[var(--amber)]"
                              : "text-[var(--text-secondary)]"
                        }
                      >
                        {e.level}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-[var(--text-secondary)] whitespace-nowrap">
                      {e.module}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--text-primary)] whitespace-nowrap">
                      {e.event}
                    </td>
                    <td className="px-3 py-1.5">
                      {e.payload !== undefined ? (
                        <button
                          onClick={() => toggleTimeline(i)}
                          className="text-left w-full text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                        >
                          <div className="flex items-center gap-1">
                            {expandedTimeline.has(i) ? (
                              <ChevronDown size={12} />
                            ) : (
                              <ChevronRight size={12} />
                            )}
                            <span className="truncate max-w-[200px] inline-block">
                              {JSON.stringify(e.payload).slice(0, 100)}
                            </span>
                          </div>
                          {expandedTimeline.has(i) && (
                            <div className="mt-2">
                              <JsonBlock value={e.payload} />
                            </div>
                          )}
                        </button>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] mb-6">
        <div className="p-4 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
            Agent Trace ({detail.agentTrace.length} steps)
          </h3>
        </div>
        <div className="divide-y divide-[var(--border)] max-h-64 overflow-y-auto">
          {detail.agentTrace.map((step) => (
            <div key={step.step}>
              <button
                onClick={() => toggleStep(step.step)}
                className="w-full px-4 py-3 flex items-center gap-2 hover:bg-[var(--bg-hover)] text-left transition-colors"
              >
                {expandedSteps.has(step.step) ? (
                  <ChevronDown size={14} className="text-[var(--text-muted)]" />
                ) : (
                  <ChevronRight size={14} className="text-[var(--text-muted)]" />
                )}
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  Step {step.step}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  ({step.finishReason})
                </span>
                {step.toolCalls.length > 0 && (
                  <span className="text-xs bg-[var(--blue-bg)] text-[var(--blue)] px-1.5 py-0.5 rounded">
                    {step.toolCalls.length} tool call
                    {step.toolCalls.length !== 1 ? "s" : ""}
                  </span>
                )}
              </button>
              {expandedSteps.has(step.step) && (
                <div className="px-4 pb-3 text-xs overflow-x-auto space-y-3">
                  {step.messages && (
                    <div>
                      <span className="font-medium text-[var(--text-secondary)] block mb-1">
                        Messages:
                      </span>
                      <p className="text-[var(--text-muted)] whitespace-pre-wrap break-words min-w-0">
                        {step.messages}
                      </p>
                    </div>
                  )}
                  {step.toolCalls.length > 0 && (
                    <div>
                      <span className="font-medium text-[var(--text-secondary)] block mb-1">
                        Tool Calls:
                      </span>
                      <div className="space-y-2">
                        {step.toolCalls.map((tc, i) => (
                          <div key={i}>
                            <span className="font-mono text-[var(--blue)] text-xs">
                              {tc.name}
                            </span>
                            <JsonBlock value={tc.args} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {step.toolResults.length > 0 && (
                    <div>
                      <span className="font-medium text-[var(--text-secondary)] block mb-1">
                        Tool Results:
                      </span>
                      <div className="space-y-2">
                        {step.toolResults.map((tr, i) => (
                          <div key={i}>
                            <span className="font-mono text-[var(--blue)] text-xs">
                              {tr.name}
                            </span>
                            <JsonBlock value={tr.output} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {step.usage != null && (
                    <div>
                      <span className="font-medium text-[var(--text-secondary)] block mb-1">
                        Usage:
                      </span>
                      <JsonBlock value={step.usage} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {detail.artifacts.length > 0 && (
        <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border)]">
          <div className="p-4 border-b border-[var(--border)]">
            <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
              Artifacts ({detail.artifacts.length})
            </h3>
          </div>
          <div className="divide-y divide-[var(--border)] max-h-64 overflow-y-auto">
            {detail.artifacts.map((a) => {
              const isExpanded = expandedArtifacts.has(a.name);
              const content = artifactContents.get(a.name);
              return (
                <div key={a.name}>
                  <button
                    onClick={() => toggleArtifact(a.name)}
                    className="w-full px-4 py-2 flex items-center justify-between hover:bg-[var(--bg-hover)] text-left transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown size={14} className="text-[var(--text-muted)]" />
                      ) : (
                        <ChevronRight size={14} className="text-[var(--text-muted)]" />
                      )}
                      <FileJson size={14} className="text-[var(--blue)]" />
                      <span className="text-sm font-mono text-[var(--text-primary)]">
                        {a.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[var(--text-muted)]">
                        {(a.size / 1024).toFixed(1)} KB
                      </span>
                      <a
                        href={`/api/log/${runId}/artifacts/${encodeURIComponent(a.name)}`}
                        download={a.name}
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 hover:bg-[var(--bg-raised)] rounded transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        title="Download"
                      >
                        <Download size={14} />
                      </a>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-3">
                      {content?.loading && (
                        <p className="text-xs text-[var(--text-muted)]">Loading...</p>
                      )}
                      {content?.error && (
                        <p className="text-xs text-[var(--red)]">{content.error}</p>
                      )}
                      {content?.data !== null && content?.data !== undefined && (
                        <JsonBlock value={content.data} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function LogPanel() {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const handleClearAll = async () => {
    if (!confirm("Delete all logs? This cannot be undone.")) return;
    try {
      const res = await fetch("/api/log", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to clear logs");
    } catch {
      // Error handling is done in the LogIndex component
    }
  };

  const handleBack = () => {
    setSelectedRunId(null);
  };

  const handleDeleted = () => {
    setSelectedRunId(null);
  };

  return (
    <div>
      {selectedRunId ? (
        <LogDetail
          runId={selectedRunId}
          onBack={handleBack}
          onDeleted={handleDeleted}
        />
      ) : (
        <LogIndex
          onSelectRun={setSelectedRunId}
          onClearAll={handleClearAll}
        />
      )}
    </div>
  );
}
