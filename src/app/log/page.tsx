"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Trash2, RefreshCw, FileText, Clock, AlertCircle } from "lucide-react";

interface RunSummary {
  runId: string;
  kind: string;
  startedAt: string;
  finishedAt?: string;
  outcome?: string;
  hasReview: boolean;
}

export default function LogIndexPage() {
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
    fetchRuns();
  }, [fetchRuns]);

  const handleClearAll = async () => {
    if (!confirm("Delete all logs? This cannot be undone.")) return;
    try {
      const res = await fetch("/api/log", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to clear logs");
      await fetchRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const outcomeBadge = (outcome?: string) => {
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
  };

  const kindBadge = (kind: string) => {
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
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-6">
      <div className="max-w-5xl mx-auto">
        {/* Sticky header */}
        <div className="sticky top-0 z-50 -mx-6 px-6 py-4 mb-6 backdrop-blur-[12px] bg-[rgba(10,10,11,0.8)] border-b border-[var(--border)]">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">
                Run Logs
              </h1>
              <p className="text-sm text-[var(--text-muted)] mt-1">
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
                onClick={handleClearAll}
                disabled={runs.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-[var(--red-bg)] text-[var(--red)] border border-[rgba(252,165,165,0.2)] rounded-lg hover:bg-[rgba(252,165,165,0.2)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
              >
                <Trash2 size={14} />
                Clear all
              </button>
            </div>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {runs.map((run) => (
                    <tr
                      key={run.runId}
                      className="hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/log/${run.runId}`}
                          className="text-sm font-mono text-[var(--blue)] hover:underline"
                        >
                          {run.runId}
                        </Link>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
