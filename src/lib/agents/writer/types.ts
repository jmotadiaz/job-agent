export interface Rationale {
  priorityRequirements: string[];
  text: string;
}

export interface ExperienceEntry {
  company: string;
  role: string;
  period: string;
  bullets: string[];
}

export interface EducationEntry {
  institution: string;
  degree: string;
  period: string;
}

export interface SkillCategoryEntry {
  label: string;
  items: string[];
}

export interface WriterRunContext {
  experience: ExperienceEntry[] | null;
  skillCategories: SkillCategoryEntry[] | null;
  education: EducationEntry[] | null;
  coverParagraphs: string[] | null;
  rationale: Rationale | null;
  finalized: boolean;
}
