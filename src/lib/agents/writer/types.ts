// Plan types — produced by the Plan Node (decomposer)

export interface BulletPlan {
  originalText: string;
  company: string;
  role: string;
  period: string;
  priorityRequirementIndex: number; // which [1]-[5] requirement this bullet covers
  rewrittenText?: string; // optional: Plan may suggest rewrite
}

export interface SkillCategoryPlan {
  label: string;
  items: string[];
}

export interface CoverOutline {
  hook: string; // one-sentence hook idea
  evidence: string[]; // one per evidence paragraph
  close: string; // one-sentence close idea
  toneNote?: string;
}

export interface LayoutBudget {
  maxBullets: number;
  maxSkillCategories: number;
  maxTotalSkills: number;
  maxCoverParagraphs: number;
}

export interface CvPlan {
  bullets: BulletPlan[];
  skillCategories: SkillCategoryPlan[];
  education: Array<{
    institution: string;
    degree: string;
    period: string;
  }>;
  layoutBudget: LayoutBudget;
}

export interface CoverPlan {
  outline: CoverOutline;
  toneGuidelines: string;
}

export interface Plan {
  priorityRequirements: string[]; // 3-5 priorities distilled from the offer; bullets reference by 1-based index
  cv: CvPlan;
  cover: CoverPlan;
  rationaleDraft: string; // initial trade-offs from the Plan Node
}

// Solution types — produced by generators

export interface ExperienceEntry {
  company: string;
  role: string;
  period: string;
  bullets: string[];
}

export interface SkillCategoryEntry {
  label: string;
  items: string[];
}

export interface EducationEntry {
  institution: string;
  degree: string;
  period: string;
}

export interface CvSolution {
  experience: ExperienceEntry[];
  skillCategories: SkillCategoryEntry[];
  education: EducationEntry[];
  pdfPath: string;
  imageBase64: string;
  pageCount: number;
}

export interface CoverSolution {
  paragraphs: string[];
  pdfPath: string;
  imageBase64: string;
  pageCount: number;
}

// Evaluator feedback types

export interface VisualFeedback {
  accepted: boolean;
  issues: string[];
}

export interface WritingFeedback {
  accepted: boolean;
  issues: string[];
}

export interface CompositeFeedback {
  visual?: VisualFeedback;
  writing?: WritingFeedback;
}

export type CompositeVerdict =
  | { accepted: true }
  | { accepted: false; feedback: CompositeFeedback };

// Final output

export interface WriterResult {
  cv: CvSolution;
  cover: CoverSolution;
  rationale: string;
  autoReviewPassed: boolean;
  cvIterations: number;
  coverIterations: number;
}

// Legacy types — used by the original agent tools

export interface Rationale {
  priorityRequirements: string[];
  text: string;
}

export interface WriterRunContext {
  experience: ExperienceEntry[] | null;
  skillCategories: SkillCategoryEntry[] | null;
  education: EducationEntry[] | null;
  coverParagraphs: string[] | null;
  rationale: Rationale | null;
  finalized: boolean;
}
