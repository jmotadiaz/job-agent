"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Search,
  Zap,
  AlertTriangle,
  FileText,
  Mail,
  MessageSquare,
  ChevronRight,
  ExternalLink,
  Sparkles,
  Check,
  X,
  Clock,
  Star,
  WandSparkles,
} from "lucide-react";
import type { Job } from "@/lib/db/jobs";
import type { Generation } from "@/lib/db/generations";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Toast {
  id: number;
  type: "success" | "error" | "info";
  message: string;
}

type TabStatus = "all" | "shortlisted" | "applied" | "discarded";

interface GenerationNode extends Generation {
  children: GenerationNode[];
}

interface DashboardProps {
  initialJobs: Job[];
  currentProfileHash: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildTree(generations: Generation[]): GenerationNode[] {
  const map = new Map<string, GenerationNode>();
  for (const g of generations) {
    map.set(g.id, { ...g, children: [] });
  }
  const roots: GenerationNode[] = [];
  for (const node of map.values()) {
    if (node.parent_generation_id) {
      const parent = map.get(node.parent_generation_id);
      if (parent) parent.children.push(node);
      else roots.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function parseDescriptionField(md: string, field: string): string | null {
  const m = md.match(new RegExp(`\\*\\*${field}\\*\\*:\\s*([^\\n]+)`));
  if (!m) return null;
  const v = m[1].trim();
  return v === "Not specified" || v === "" ? null : v;
}

function jobSubtitle(job: Job): { company: string | null; location: string | null; salary: string | null } {
  const isPrivacyText = /linkedin (respects|protects|protege)/i.test(job.company);
  const company = isPrivacyText
    ? parseDescriptionField(job.description_md, "Company")
    : job.company || null;
  const location = job.location || parseDescriptionField(job.description_md, "Location");
  const salary = parseDescriptionField(job.description_md, "Salary");
  return { company, location, salary };
}

function statusLabel(s: Job["status"]): string {
  return {
    new: "New",
    shortlisted: "Shortlisted",
    applied: "Applied",
    discarded: "Discarded",
  }[s];
}
function statusBadgeClass(s: Job["status"]): string {
  return {
    new: "badge-blue",
    shortlisted: "badge-accent",
    applied: "badge-green",
    discarded: "badge-muted",
  }[s];
}
function scoreBar(score: number) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 75 ? "var(--green)" : pct >= 50 ? "var(--amber)" : "var(--red)";
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8 }}
      title={`Match score: ${pct}%`}
    >
      <div
        style={{
          flex: 1,
          height: 4,
          background: "var(--bg-hover)",
          borderRadius: 2,
          minWidth: 60,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            borderRadius: 2,
            transition: "width 0.3s",
          }}
        />
      </div>
      <span
        style={{ fontSize: 11, color: "var(--text-secondary)", minWidth: 28 }}
      >
        {pct}%
      </span>
    </div>
  );
}

// ─── Toast system ─────────────────────────────────────────────────────────────

function Toaster({
  toasts,
  remove,
}: {
  toasts: Toast[];
  remove: (id: number) => void;
}) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.type}`}
          onClick={() => remove(t.id)}
          role="alert"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ─── StarRating ───────────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="star-rating" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          aria-label={`${i} star${i > 1 ? "s" : ""}`}
          className={`star-btn ${i <= (hover || value) ? "filled" : "empty"}`}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(i)}
        >
          <Star
            size={18}
            fill={i <= (hover || value) ? "currentColor" : "none"}
          />
        </button>
      ))}
    </div>
  );
}

// ─── FeedbackForm ─────────────────────────────────────────────────────────────

function FeedbackForm({
  generationId,
  jobId,
  onNewGeneration,
}: {
  generationId: string;
  jobId: string;
  onNewGeneration: (
    gen: { generationId: string; cvUrl: string; coverUrl: string },
    forJobId: string,
  ) => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!rating) return;
    setLoading(true);
    try {
      const res = await fetch("/api/writer/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          parentGenerationId: generationId,
          feedbackRating: rating,
          feedbackComment: comment || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      onNewGeneration(data, jobId);
      setRating(0);
      setComment("");
      setExpanded(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error generating iteration");
    } finally {
      setLoading(false);
    }
  }, [rating, comment, jobId, generationId, onNewGeneration]);

  if (!expanded) {
    return (
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setExpanded(true)}
        style={{ marginTop: 6 }}
      >
        <MessageSquare size={14} style={{ marginRight: 6 }} />
        Iterate with feedback
      </button>
    );
  }

  return (
    <div className="card-raised fade-in" style={{ padding: 12, marginTop: 8 }}>
      <div
        style={{
          marginBottom: 8,
          fontSize: 12,
          color: "var(--text-secondary)",
          fontWeight: 600,
          letterSpacing: "0.5px",
          textTransform: "uppercase",
        }}
      >
        Feedback
      </div>
      <StarRating value={rating} onChange={setRating} />
      <textarea
        placeholder="Optional comment — what should change?"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        style={{ marginTop: 8 }}
        id={`feedback-comment-${generationId}`}
      />
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <button
          className="btn btn-primary btn-sm"
          disabled={!rating || loading}
          onClick={handleSubmit}
        >
          {loading ? (
            <>
              <span className="spinner" /> Generating…
            </>
          ) : (
            <>
              <Sparkles size={14} style={{ marginRight: 6 }} /> Iterate
            </>
          )}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setExpanded(false)}
          disabled={loading}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── GenerationNode UI ────────────────────────────────────────────────────────

function GenerationNodeView({
  node,
  jobId,
  latestId,
  currentProfileHash,
  onNewGeneration,
  depth,
}: {
  node: GenerationNode;
  jobId: string;
  latestId: string;
  currentProfileHash: string | null;
  onNewGeneration: (
    gen: { generationId: string; cvUrl: string; coverUrl: string },
    forJobId: string,
  ) => void;
  depth: number;
}) {
  const isLatest = node.id === latestId;
  const isStale =
    currentProfileHash && node.profile_hash !== currentProfileHash;

  return (
    <div className={depth > 0 ? "tree-branch" : ""}>
      <div
        className={`card-raised tree-node fade-in`}
        style={{
          padding: "14px 18px",
          marginBottom: 10,
          border: isLatest ? "1px solid var(--border)" : undefined,
          background: isLatest ? "var(--bg-hover)" : "var(--bg-raised)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 6,
          }}
        >
          {isLatest && (
            <span className="badge badge-accent">
              <Zap size={10} style={{ marginRight: 4 }} /> Latest
            </span>
          )}
          {isStale && (
            <span
              className="badge badge-amber"
              title="Generated with an older version of profile.md"
            >
              <AlertTriangle size={10} style={{ marginRight: 4 }} /> Profile
              changed
            </span>
          )}
          {node.feedback_rating != null && (
            <span
              className="badge badge-muted"
              title={node.feedback_comment ?? ""}
            >
              <Star size={10} fill="currentColor" style={{ marginRight: 4 }} />{" "}
              {node.feedback_rating} feedback
            </span>
          )}
          <span
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Clock size={10} /> {new Date(node.created_at).toLocaleString()}
          </span>
        </div>

        {node.feedback_comment && (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              fontStyle: "italic",
              marginTop: 4,
              marginBottom: 12,
              padding: "10px 14px",
              background: "var(--bg-primary)",
              borderRadius: 2,
              borderLeft: "2px solid var(--border)",
            }}
          >
            "{node.feedback_comment}"
          </div>
        )}

        <div
          style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}
        >
          <a
            className="btn btn-ghost btn-sm"
            href={`/api/generations/${node.id}/cv`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FileText size={14} style={{ marginRight: 6 }} /> Download CV
          </a>
          <a
            className="btn btn-ghost btn-sm"
            href={`/api/generations/${node.id}/cover`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Mail size={14} style={{ marginRight: 6 }} /> Download Cover
          </a>
        </div>

        <FeedbackForm
          generationId={node.id}
          jobId={jobId}
          onNewGeneration={onNewGeneration}
        />
      </div>

      {node.children.map((child) => (
        <GenerationNodeView
          key={child.id}
          node={child}
          jobId={jobId}
          latestId={latestId}
          currentProfileHash={currentProfileHash}
          onNewGeneration={onNewGeneration}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

// ─── JobRow ───────────────────────────────────────────────────────────────────

function JobRow({
  job,
  currentProfileHash,
  onStatusChange,
  addToast,
}: {
  job: Job;
  currentProfileHash: string | null;
  onStatusChange: (id: string, newStatus: Job["status"]) => void;
  addToast: (type: Toast["type"], msg: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generations, setGenerations] = useState<Generation[] | null>(null);
  const [loadingGens, setLoadingGens] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Load generations when expanded
  useEffect(() => {
    if (!expanded || generations !== null) return;
    setLoadingGens(true);
    fetch(`/api/jobs/${job.id}`)
      .then((r) => r.json())
      .then((d) => setGenerations(d.generations ?? []))
      .catch(() => setGenerations([]))
      .finally(() => setLoadingGens(false));
  }, [expanded, job.id, generations]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/writer/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setGenerations((prev) => [
        ...(prev ?? []),
        {
          id: data.generationId,
          job_id: job.id,
          profile_hash: currentProfileHash ?? "",
          cv_path: "",
          cover_path: "",
          bullets_json: "[]",
          cover_paragraphs_json: "[]",
          created_at: Date.now(),
          parent_generation_id: null,
          feedback_rating: null,
          feedback_comment: null,
        },
      ]);
      setExpanded(true);
      addToast("success", `CV generated! Open the job row to download.`);
    } catch (err) {
      addToast(
        "error",
        err instanceof Error ? err.message : "Generation failed",
      );
    } finally {
      setGenerating(false);
    }
  }, [job.id, currentProfileHash, addToast]);

  const handleNewGeneration = useCallback(
    (
      _gen: { generationId: string; cvUrl: string; coverUrl: string },
      _jobId: string,
    ) => {
      // Re-fetch generations to get updated tree
      setGenerations(null);
      addToast("success", "New iteration generated!");
    },
    [addToast],
  );

  const handleStatus = useCallback(
    async (newStatus: Job["status"]) => {
      setUpdatingStatus(true);
      try {
        const res = await fetch(`/api/jobs/${job.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) throw new Error("Status update failed");
        onStatusChange(job.id, newStatus);
        addToast("success", `Marked as ${statusLabel(newStatus)}`);
      } catch (err) {
        addToast(
          "error",
          err instanceof Error ? err.message : "Status update failed",
        );
      } finally {
        setUpdatingStatus(false);
      }
    },
    [job.id, onStatusChange, addToast],
  );

  const tree = generations ? buildTree(generations) : [];
  const latestId =
    generations?.reduce(
      (a, b) => (a.created_at > b.created_at ? a : b),
      generations[0],
    )?.id ?? "";

  return (
    <div
      className="card fade-in"
      style={{ marginBottom: 20, overflow: "hidden" }}
    >
      {/* Header row */}
      <div
        style={{
          padding: "20px 24px",
          cursor: "pointer",
          display: "flex",
          gap: 20,
          alignItems: "flex-start",
        }}
        onClick={() => setExpanded((e) => !e)}
        role="button"
        aria-expanded={expanded}
      >
        {/* Expand chevron */}
        <ChevronRight
          size={16}
          style={{
            color: "var(--text-muted)",
            marginTop: 2,
            transition: "transform 0.15s",
            transform: expanded ? "rotate(90deg)" : "none",
            flexShrink: 0,
          }}
        />

        {/* Job info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 4,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 400,
              }}
            >
              {job.title || "Unknown Title"}
            </h2>
            <span
              className={`badge ${statusBadgeClass(job.status)}`}
              style={{ fontSize: 10, padding: "1px 6px", opacity: 0.8 }}
            >
              {statusLabel(job.status)}
            </span>
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              marginBottom: 8,
              display: "flex",
              flexWrap: "wrap",
              gap: "0 6px",
              alignItems: "center",
            }}
          >
            {(() => {
              const { company, location, salary } = jobSubtitle(job);
              return (
                <>
                  {company && <span style={{ fontWeight: 500 }}>{company}</span>}
                  {location && (
                    <span style={{ color: "var(--text-muted)" }}>
                      {company ? "· " : ""}{location}
                    </span>
                  )}
                  {salary && (
                    <span style={{ color: "var(--text-muted)" }}>
                      · {salary}
                    </span>
                  )}
                </>
              );
            })()}
          </div>
          {scoreBar(job.match_score)}
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 12,
              color: "var(--text-secondary)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {job.match_reason}
          </p>
        </div>

        {/* Actions (stop propagation to avoid toggle) */}
        <div
          style={{ display: "flex", gap: 8, flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <a
            className="btn btn-ghost btn-sm"
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open on LinkedIn"
          >
            <ExternalLink size={14} />
          </a>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleGenerate}
            disabled={generating}
            id={`generate-${job.id}`}
            title="Generate CV and cover letter"
          >
            {generating ? (
              <>
                <span className="spinner" /> Generating…
              </>
            ) : (
              <>
                <WandSparkles size={14} style={{ marginRight: 6 }} /> Generate
              </>
            )}
          </button>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
          className="fade-in"
        >
          {/* Description */}
          <details>
            <summary
              style={{
                cursor: "pointer",
                fontSize: 13,
                color: "var(--text-secondary)",
                fontWeight: 500,
                marginBottom: 6,
              }}
            >
              Job summary
            </summary>
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.7,
                color: "var(--text-secondary)",
                whiteSpace: "pre-wrap",
                padding: "8px 0",
              }}
            >
              {job.description_md}
            </div>
          </details>

          {/* Status actions */}
          {job.status !== "applied" && job.status !== "discarded" && (
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <button
                className="btn btn-success btn-sm"
                onClick={() => handleStatus("applied")}
                disabled={updatingStatus}
                id={`apply-${job.id}`}
              >
                <Check size={14} style={{ marginRight: 6 }} /> Mark as Applied
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleStatus("discarded")}
                disabled={updatingStatus}
                id={`discard-${job.id}`}
              >
                <X size={14} style={{ marginRight: 6 }} /> Discard
              </button>
            </div>
          )}

          {/* Generations tree */}
          <div>
            <h3
              style={{
                margin: "0 0 10px",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Generations
            </h3>
            {loadingGens && (
              <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                <span className="spinner" /> Loading…
              </div>
            )}
            {!loadingGens && tree.length === 0 && (
              <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                No generations yet. Click ✨ Generate to create your first CV.
              </div>
            )}
            {tree.map((root) => (
              <GenerationNodeView
                key={root.id}
                node={root}
                jobId={job.id}
                latestId={latestId}
                currentProfileHash={currentProfileHash}
                onNewGeneration={handleNewGeneration}
                depth={0}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Scout Button ─────────────────────────────────────────────────────────────

function ScoutButton({ onNewJob }: { onNewJob: (job: Job) => void }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    kind: string;
    reason?: string;
  } | null>(null);

  const handleClick = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/scout/run", { method: "POST" });
      const data = await res.json();
      setResult(data);
      if (data.kind === "match" && data.job) {
        onNewJob(data.job);
      }
    } catch {
      setResult({ kind: "error", reason: "Network error" });
    } finally {
      setLoading(false);
    }
  }, [onNewJob]);

  return (
    <div>
      <button
        id="scout-button"
        className="btn btn-primary"
        onClick={handleClick}
        disabled={loading}
        style={{ minWidth: 180 }}
      >
        {loading ? (
          <>
            <span className="spinner" /> Scouting…
          </>
        ) : (
          <>
            <Search size={18} style={{ marginRight: 8 }} /> Scout LinkedIn
          </>
        )}
      </button>
      {result && !loading && (
        <div
          className="fade-in"
          style={{
            marginTop: 10,
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 13,
            background:
              result.kind === "match" ? "var(--green-bg)" : "var(--bg-raised)",
            border: `1px solid ${result.kind === "match" ? "rgba(52,211,153,0.2)" : "var(--border)"}`,
            color:
              result.kind === "match"
                ? "var(--green)"
                : "var(--text-secondary)",
          }}
        >
          {result.kind === "match" && "✓ Found a match! See new job below."}
          {result.kind === "no_match" && `↩ No match: ${result.reason}`}
          {result.kind === "error" &&
            `✕ Error: ${(result as { message?: string }).message ?? result.reason}`}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard (main client component) ───────────────────────────────────────

export function Dashboard({ initialJobs, currentProfileHash }: DashboardProps) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [tab, setTab] = useState<TabStatus>("all");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const addToast = useCallback((type: Toast["type"], message: string) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      4000,
    );
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleNewJob = useCallback(
    (job: Job) => {
      setJobs((prev) => [job, ...prev]);
      addToast("success", `New job found: ${job.title} at ${job.company}`);
    },
    [addToast],
  );

  const handleStatusChange = useCallback(
    (id: string, newStatus: Job["status"]) => {
      setJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, status: newStatus } : j)),
      );
    },
    [],
  );

  const tabs: { label: string; value: TabStatus; count: number }[] = [
    { label: "All", value: "all", count: jobs.length },
    {
      label: "Shortlisted",
      value: "shortlisted",
      count: jobs.filter((j) => j.status === "shortlisted").length,
    },
    {
      label: "Applied",
      value: "applied",
      count: jobs.filter((j) => j.status === "applied").length,
    },
    {
      label: "Discarded",
      value: "discarded",
      count: jobs.filter((j) => j.status === "discarded").length,
    },
  ];

  const filtered = tab === "all" ? jobs : jobs.filter((j) => j.status === tab);

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          background: "rgba(13,13,18,0.8)",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto",
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "var(--text-primary)",
                textTransform: "uppercase",
              }}
            >
              Job Scout
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                color: "var(--text-muted)",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              Intelligence in Search
            </p>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <ScoutButton onNewJob={handleNewJob} />
          </div>
        </div>
      </header>

      {/* Main */}
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
        {/* Tabs */}
        <div className="tabs" style={{ marginBottom: 40 }}>
          {tabs.map((t) => (
            <button
              key={t.value}
              id={`tab-${t.value}`}
              className={`tab ${tab === t.value ? "active" : ""}`}
              onClick={() => setTab(t.value)}
            >
              {t.label}{" "}
              <span style={{ opacity: 0.7, fontSize: 11 }}>({t.count})</span>
            </button>
          ))}
        </div>

        {/* Job list */}
        {filtered.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "64px 24px",
              color: "var(--text-muted)",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
            <p style={{ fontSize: 15, margin: 0 }}>
              {tab === "all"
                ? 'No jobs yet. Click "Find new job" to start scouting.'
                : `No ${tab} jobs.`}
            </p>
          </div>
        ) : (
          filtered.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              currentProfileHash={currentProfileHash}
              onStatusChange={handleStatusChange}
              addToast={addToast}
            />
          ))
        )}
      </main>

      <Toaster toasts={toasts} remove={removeToast} />
    </div>
  );
}
