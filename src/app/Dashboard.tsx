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

function jobSubtitle(job: Job): {
  company: string | null;
  location: string | null;
  salary: string | null;
} {
  const isPrivacyText = /linkedin (respects|protects|protege)/i.test(
    job.company,
  );
  const company = isPrivacyText
    ? parseDescriptionField(job.description_md, "Company")
    : job.company || null;
  const location =
    job.location || parseDescriptionField(job.description_md, "Location");
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
    <div className="flex items-center gap-2" title={`Match score: ${pct}%`}>
      <div className="flex-1 h-1 bg-[var(--bg-hover)] rounded-sm min-w-[60px]">
        <div
          className="h-full rounded-sm transition-[width] duration-300"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[11px] text-[var(--text-secondary)] min-w-7">
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
        className="btn btn-ghost btn-sm mt-1.5"
        onClick={() => setExpanded(true)}
      >
        <MessageSquare size={14} className="mr-1.5" />
        Iterate with feedback
      </button>
    );
  }

  return (
    <div className="card-raised fade-in p-3 mt-2">
      <div className="mb-2 text-xs text-[var(--text-secondary)] font-semibold tracking-[0.5px] uppercase">
        Feedback
      </div>
      <StarRating value={rating} onChange={setRating} />
      <textarea
        placeholder="Optional comment — what should change?"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        className="mt-2"
        id={`feedback-comment-${generationId}`}
      />
      <div className="flex gap-3 mt-3">
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
              <Sparkles size={14} className="mr-1.5" /> Iterate
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
        className={`card-raised tree-node fade-in px-[18px] py-[14px] mb-2.5 ${isLatest ? "!bg-[var(--bg-hover)]" : ""}`}
      >
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          {isLatest && (
            <span className="badge badge-accent">
              <Zap size={10} className="mr-1" /> Latest
            </span>
          )}
          {isStale && (
            <span
              className="badge badge-amber"
              title="Generated with an older version of profile.md"
            >
              <AlertTriangle size={10} className="mr-1" /> Profile changed
            </span>
          )}
          {node.feedback_rating != null && (
            <span
              className="badge badge-muted"
              title={node.feedback_comment ?? ""}
            >
              <Star size={10} fill="currentColor" className="mr-1" />{" "}
              {node.feedback_rating} feedback
            </span>
          )}
          <span className="text-[11px] text-[var(--text-muted)] ml-auto flex items-center gap-1">
            <Clock size={10} /> {new Date(node.created_at).toLocaleString()}
          </span>
        </div>

        {node.feedback_comment && (
          <div className="text-xs text-[var(--text-secondary)] italic mt-1 mb-3 px-3.5 py-2.5 bg-[var(--bg-primary)] rounded-sm border-l-2 border-l-[var(--border)]">
            "{node.feedback_comment}"
          </div>
        )}

        <div className="flex gap-3 flex-wrap mt-2">
          <a
            className="btn btn-ghost btn-sm"
            href={`/api/generations/${node.id}/cv`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FileText size={14} className="mr-1.5" /> Download CV
          </a>
          <a
            className="btn btn-ghost btn-sm"
            href={`/api/generations/${node.id}/cover`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Mail size={14} className="mr-1.5" /> Download Cover
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
          skills_json: "[]",
          skills_json: "[]",
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

  const { company, location, salary } = jobSubtitle(job);

  return (
    <div className="card fade-in mb-5 overflow-hidden">
      {/* Header row */}
      <div
        className="px-6 py-5 cursor-pointer flex gap-5 items-start"
        onClick={() => setExpanded((e) => !e)}
        role="button"
        aria-expanded={expanded}
      >
        {/* Expand chevron */}
        <ChevronRight
          size={16}
          className={`text-[var(--text-muted)] mt-0.5 transition-transform duration-150 flex-shrink-0 ${expanded ? "rotate-90" : ""}`}
        />

        {/* Job info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap mb-1">
            <h2 className="m-0 text-sm font-semibold text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis max-w-[400px]">
              {job.title || "Unknown Title"}
            </h2>
            <span
              className={`badge ${statusBadgeClass(job.status)} text-[10px] px-1.5 py-px opacity-80`}
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
                  {company && (
                    <span style={{ fontWeight: 500 }}>{company}</span>
                  )}
                  {location && (
                    <span style={{ color: "var(--text-muted)" }}>
                      {company ? "· " : ""}
                      {location}
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
          <p className="mt-2 mb-0 text-xs text-[var(--text-secondary)] line-clamp-2">
            {job.match_reason}
          </p>
        </div>

        {/* Actions (stop propagation to avoid toggle) */}
        <div
          className="flex gap-2 flex-shrink-0"
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
                <WandSparkles size={14} className="mr-1.5" /> Generate
              </>
            )}
          </button>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-[var(--border)] p-6 flex flex-col gap-6 fade-in">
          {/* Description */}
          <details>
            <summary className="cursor-pointer text-[13px] text-[var(--text-secondary)] font-medium mb-1.5">
              Job summary
            </summary>
            <div className="text-[13px] leading-[1.7] text-[var(--text-secondary)] whitespace-pre-wrap py-2">
              {job.description_md}
            </div>
          </details>

          {/* Status actions */}
          {job.status !== "applied" && job.status !== "discarded" && (
            <div className="flex gap-2 flex-wrap">
              <button
                className="btn btn-success btn-sm"
                onClick={() => handleStatus("applied")}
                disabled={updatingStatus}
                id={`apply-${job.id}`}
              >
                <Check size={14} className="mr-1.5" /> Mark as Applied
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleStatus("discarded")}
                disabled={updatingStatus}
                id={`discard-${job.id}`}
              >
                <X size={14} className="mr-1.5" /> Discard
              </button>
            </div>
          )}

          {/* Generations tree */}
          <div>
            <h3 className="mt-0 mx-0 mb-2.5 text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.5px]">
              Generations
            </h3>
            {loadingGens && (
              <div className="text-[var(--text-muted)] text-[13px]">
                <span className="spinner" /> Loading…
              </div>
            )}
            {!loadingGens && tree.length === 0 && (
              <div className="text-[var(--text-muted)] text-[13px]">
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
        className="btn btn-primary min-w-[180px]"
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? (
          <>
            <span className="spinner" /> Scouting…
          </>
        ) : (
          <>
            <Search size={18} className="mr-2" /> Scout LinkedIn
          </>
        )}
      </button>
      {result && !loading && (
        <div
          className={`fade-in mt-2.5 px-3.5 py-2.5 rounded-lg text-[13px] ${
            result.kind === "match"
              ? "bg-[var(--green-bg)] border border-[rgba(52,211,153,0.2)] text-[var(--green)]"
              : "bg-[var(--bg-raised)] border border-[var(--border)] text-[var(--text-secondary)]"
          }`}
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
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[rgba(13,13,18,0.8)] backdrop-blur-[12px] sticky top-0 z-[100]">
        <div className="max-w-[900px] mx-auto px-6 py-4 flex items-center gap-6 flex-wrap">
          <div>
            <h1 className="m-0 text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)] uppercase">
              Job Scout
            </h1>
            <p className="m-0 text-[11px] text-[var(--text-muted)] tracking-[0.05em] uppercase">
              Intelligence in Search
            </p>
          </div>
          <div className="ml-auto">
            <ScoutButton onNewJob={handleNewJob} />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-[900px] mx-auto px-6 py-10">
        {/* Tabs */}
        <div className="tabs mb-10">
          {tabs.map((t) => (
            <button
              key={t.value}
              id={`tab-${t.value}`}
              className={`tab ${tab === t.value ? "active" : ""}`}
              onClick={() => setTab(t.value)}
            >
              {t.label}{" "}
              <span className="opacity-70 text-[11px]">({t.count})</span>
            </button>
          ))}
        </div>

        {/* Job list */}
        {filtered.length === 0 ? (
          <div className="text-center px-6 py-16 text-[var(--text-muted)]">
            <div className="text-[40px] mb-4">🔍</div>
            <p className="text-[15px] m-0">
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
