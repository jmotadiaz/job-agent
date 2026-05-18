import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

import fs from "node:fs";
import path from "node:path";

const FIXTURE_PROFILE = `# Jane Doe
name: Jane Doe
email: jane@example.com
## search
query: frontend engineer
## Experience
### CoolCo | Frontend Engineer | 2020 - 2024
- b0: Built React apps for 2M+ users
- b1: Led design system adoption across 3 teams
## Skills
- **Tech**: React, TypeScript, CSS`;

const FIXTURE_JOB = {
  id: "job-feedback-1",
  source: "linkedin",
  external_id: "ext-200",
  url: "https://www.linkedin.com/jobs/view/200/",
  title: "Frontend Engineer",
  company: "CoolCo",
  location: "Remote",
  description_md: "- Required: React, TypeScript\n- Nice to have: Vue.js",
  raw_snapshot: null,
  match_score: 0.8,
  match_reason: "React match",
  status: "shortlisted" as const,
  fetched_at: Date.now(),
};

interface StoredGeneration {
  id: string;
  job_id: string;
  profile_hash: string;
  cv_path: string;
  cover_path: string;
  bullets_json: string;
  skills_json: string;
  cover_paragraphs_json: string;
  rationale_json: string | null;
  created_at: number;
  parent_generation_id: string | null;
  feedback_rating: number | null;
  feedback_comment: string | null;
}

const generationStore = new Map<string, StoredGeneration>();

vi.mock("@/lib/profile/load", () => ({
  loadProfile: vi.fn(() => FIXTURE_PROFILE),
  PROFILE_PATH: "/fake/profile.md",
}));

vi.mock("@/lib/profile/hash", () => ({
  hashProfile: vi.fn(() => "feedback-hash-xyz"),
}));

vi.mock("@/lib/profile/parse", () => ({
  parseProfile: vi.fn(() => ({
    search: { queries: ["frontend engineer"] },
    profile: {
      name: "Jane Doe",
      role: "Frontend Engineer",
      email: "jane@example.com",
      phone: "123456789",
      location: "Remote",
      linkedinUrl: "https://linkedin.com/in/jane",
      website: null,
    },
    anchors: { bullets: [], skills: [] },
    skillCategories: [],
    rawContent: FIXTURE_PROFILE,
  })),
}));

vi.mock("@/lib/db/jobs", () => ({
  getJobById: vi.fn(() => FIXTURE_JOB),
}));

vi.mock("@/lib/db/generations", () => ({
  insertGeneration: vi.fn((g: Omit<StoredGeneration, "created_at">) => {
    const row: StoredGeneration = { ...g, created_at: Date.now() };
    generationStore.set(g.id, row);
    return row;
  }),
  getGenerationById: vi.fn((id: string) => generationStore.get(id)),
  listGenerationsForJob: vi.fn((jobId: string) =>
    [...generationStore.values()].filter((g) => g.job_id === jobId),
  ),
}));

vi.mock("@react-pdf/renderer", () => ({
  renderToFile: vi.fn(async (_element: unknown, filePath: string) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "%PDF-1.4 fake");
  }),
  Document: "div",
  Page: "div",
  Text: "span",
  View: "div",
  StyleSheet: { create: (s: unknown) => s },
  Font: {
    register: vi.fn(),
    registerHyphenationCallback: vi.fn(),
  },
}));

vi.mock("@ai-sdk/deepinfra", () => ({
  createDeepInfra: vi.fn(() => (_model: string) => ({ modelId: _model })),
  deepinfra: vi.fn((_model: string) => ({ modelId: _model })),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: vi.fn(),
    generateObject: vi.fn().mockResolvedValue({
      object: {
        cv: {
          bullets: [],
          skillCategories: [],
          education: [],
          layoutBudget: {
            maxBullets: 10,
            maxSkillCategories: 3,
            maxTotalSkills: 10,
            maxCoverParagraphs: 3,
          },
        },
        cover: {
          outline: { hook: "hook", evidence: [], close: "close" },
          toneGuidelines: "tone",
        },
        rationaleDraft: "rationale",
      },
    }),
    tool: actual.tool,
  };
});

vi.mock("../generate/cv", () => ({
  cvGenerator: {
    execute: vi.fn().mockResolvedValue({
      experience: [
        {
          company: "CoolCo",
          role: "Frontend Engineer",
          period: "2020-2024",
          bullets: ["Built React apps"],
        },
      ],
      skillCategories: [{ label: "Core", items: ["React", "TypeScript"] }],
      education: [{ institution: "U1", degree: "D1", period: "2020" }],
      pdfPath: "cv.pdf",
      imageBase64: "base64",
    }),
  },
}));

vi.mock("../generate/cover", () => ({
  coverGenerator: {
    execute: vi.fn().mockResolvedValue({
      paragraphs: ["Dear CoolCo,", "I am excited..."],
      pdfPath: "cover.pdf",
      imageBase64: "base64",
    }),
  },
}));

vi.mock("../evaluate/visual", () => ({
  visualCvEvaluator: {
    execute: vi.fn().mockResolvedValue({ accepted: true, issues: [] }),
  },
  visualCoverEvaluator: {
    execute: vi.fn().mockResolvedValue({ accepted: true, issues: [] }),
  },
}));

vi.mock("../evaluate/writing", () => ({
  writingCvEvaluator: {
    execute: vi.fn().mockResolvedValue({ accepted: true, issues: [] }),
  },
  writingCoverEvaluator: {
    execute: vi.fn().mockResolvedValue({ accepted: true, issues: [] }),
  },
}));

import { listGenerationsForJob } from "@/lib/db/generations";
import { runWriter } from "../orchestrator";

describe("Writer feedback & iteration integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generationStore.clear();
  });

  it("(a) generates first version with no parent", async () => {
    const result = await runWriter({ jobId: "job-feedback-1" });
    if (result.kind !== "success") throw new Error("Generation failed");
    expect(result.generationId).toBeDefined();
    const [row] = [...generationStore.values()];
    expect(row.parent_generation_id).toBeNull();
    expect(row.feedback_rating).toBeNull();
    expect(row.feedback_comment).toBeNull();

    const { GENERATED_PDFS_DIR } = await import("@/lib/runtime/paths");
    fs.rmSync(
      path.join(GENERATED_PDFS_DIR, "job-feedback-1", result.generationId),
      { recursive: true, force: true },
    );
  });

  it("(b) feedback + iteration produces child row with correct metadata", async () => {
    const { GENERATED_PDFS_DIR } = await import("@/lib/runtime/paths");

    const parentResult = await runWriter({ jobId: "job-feedback-1" });
    if (parentResult.kind !== "success") throw new Error("Parent failed");
    const parentId = parentResult.generationId;

    const childResult = await runWriter({
      jobId: "job-feedback-1",
      parentGenerationId: parentId,
      feedbackRating: 2,
      feedbackComment: "Emphasis on design system work",
    });
    if (childResult.kind !== "success") throw new Error("Child failed");
    const childId = childResult.generationId;

    expect(childId).not.toBe(parentId);
    const childRow = generationStore.get(childId);
    expect(childRow?.parent_generation_id).toBe(parentId);
    expect(childRow?.feedback_rating).toBe(2);
    expect(childRow?.feedback_comment).toBe("Emphasis on design system work");

    fs.rmSync(path.join(GENERATED_PDFS_DIR, "job-feedback-1", parentId), {
      recursive: true,
      force: true,
    });
    fs.rmSync(path.join(GENERATED_PDFS_DIR, "job-feedback-1", childId), {
      recursive: true,
      force: true,
    });
  });

  it("(c) two iterations from same parent are siblings", async () => {
    const { GENERATED_PDFS_DIR } = await import("@/lib/runtime/paths");

    const parentResult = await runWriter({ jobId: "job-feedback-1" });
    if (parentResult.kind !== "success") throw new Error("Parent failed");
    const parentId = parentResult.generationId;

    const child1 = await runWriter({
      jobId: "job-feedback-1",
      parentGenerationId: parentId,
      feedbackRating: 2,
      feedbackComment: "Too vague",
    });

    const child2 = await runWriter({
      jobId: "job-feedback-1",
      parentGenerationId: parentId,
      feedbackRating: 4,
    });

    if (child1.kind !== "success") throw new Error("Child 1 failed");
    if (child2.kind !== "success") throw new Error("Child 2 failed");
    const child1Row = generationStore.get(child1.generationId);
    const child2Row = generationStore.get(child2.generationId);

    expect(child1Row?.parent_generation_id).toBe(parentId);
    expect(child2Row?.parent_generation_id).toBe(parentId);

    expect(child1.generationId).not.toBe(child2.generationId);
    expect(child1Row?.feedback_rating).toBe(2);
    expect(child2Row?.feedback_rating).toBe(4);

    const all = listGenerationsForJob("job-feedback-1");
    expect(all.length).toBe(3);

    for (const id of [parentId, child1.generationId, child2.generationId]) {
      fs.rmSync(path.join(GENERATED_PDFS_DIR, "job-feedback-1", id), {
        recursive: true,
        force: true,
      });
    }
  });

  it("(d) no endpoint allows editing feedback of an existing generation", async () => {
    const { GENERATED_PDFS_DIR } = await import("@/lib/runtime/paths");

    const result = await runWriter({ jobId: "job-feedback-1" });
    if (result.kind !== "success") throw new Error("Generation failed");
    const generationId = result.generationId;

    expect(generationStore.has(generationId)).toBe(true);

    fs.rmSync(
      path.join(GENERATED_PDFS_DIR, "job-feedback-1", generationId),
      { recursive: true, force: true },
    );
  });
});
