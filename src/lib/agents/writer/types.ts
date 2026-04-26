export interface Rationale {
  priorityRequirements: string[];
  bulletsRationale: string;
  skillsRationale: string;
  coverLetterRationale: string;
}

export interface WriterRunContext {
  bullets: Array<{ bulletId: string; renderedText: string }> | null;
  skillItems: string[] | null;
  coverParagraphs: string[] | null;
  rationale: Rationale | null;
  finalized: boolean;
  availableBulletIds: Set<string>;
  availableSkills: string[];
}
