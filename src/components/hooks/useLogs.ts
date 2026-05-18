import { useState, useEffect, useCallback } from "react";
import { useQueryState } from "nuqs";

export interface RunSummary {
  runId: string;
  kind: string;
  startedAt: string;
  finishedAt?: string;
  outcome?: string;
  hasReview: boolean;
}

export interface RunDetail {
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

export interface ArtifactContent {
  name: string;
  data: unknown;
  loading: boolean;
  error: string | null;
}

export function useLogIndex() {
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

  const handleClearAll = async () => {
    if (!confirm("Delete all logs? This cannot be undone.")) return false;
    try {
      const res = await fetch("/api/log", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to clear logs");
      await fetchRuns();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      return false;
    }
  };

  return { runs, loading, error, fetchRuns, handleClearAll };
}

export function useLogDetail(runId: string, onDeleted?: () => void) {
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
      onDeleted?.();
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

  return {
    detail,
    loading,
    error,
    levelFilter,
    setLevelFilter,
    moduleFilter,
    setModuleFilter,
    expandedSteps,
    expandedTimeline,
    expandedArtifacts,
    artifactContents,
    reviewing,
    reviewCopied,
    uniqueModules,
    filteredTimeline,
    fetchDetail,
    handleDelete,
    handleReview,
    handleCopyReview,
    toggleStep,
    toggleTimeline,
    toggleArtifact,
  };
}

export function useLogPanel() {
  const [selectedRunId, setSelectedRunId] = useQueryState("logId");

  const handleBack = useCallback(() => {
    setSelectedRunId(null);
  }, [setSelectedRunId]);

  const handleDeleted = useCallback(() => {
    setSelectedRunId(null);
  }, [setSelectedRunId]);

  return {
    selectedRunId,
    setSelectedRunId,
    handleBack,
    handleDeleted,
  };
}
