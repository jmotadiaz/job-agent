import { node } from "@/lib/agents/workflows/node";
import { log } from "@/lib/utils/log";
import { revisionPlannerNode } from "./revision-planner/agent";
import type { PlanInput } from "./plan/agent";
import type { CvGeneratorInput } from "./generate/cv";
import type { CoverGeneratorInput } from "./generate/cover";
import type { ExperienceEntry, SkillCategoryEntry, EducationEntry } from "./types";

const MODULE = "writer/revision-decomposer";

function parseJsonOrNull<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    log.warn(MODULE, "failed to parse parent generation field", {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function parseRationale(
  rationaleJson: string | null | undefined,
): { priorityRequirements: string[]; text: string } | null {
  if (!rationaleJson) return null;
  try {
    const parsed = JSON.parse(rationaleJson);
    return {
      priorityRequirements: Array.isArray(parsed.priorityRequirements)
        ? parsed.priorityRequirements
        : [],
      text: typeof parsed.text === "string" ? parsed.text : "",
    };
  } catch {
    return null;
  }
}

export const revisionDecomposerNode = node(
  async (planIn: PlanInput): Promise<Partial<{
    cv: CvGeneratorInput;
    cover: CoverGeneratorInput;
  }>> => {
    const parent = planIn.parentGeneration;
    if (!parent) {
      throw new Error("revisionDecomposerNode requires parentGeneration");
    }

    const parentExperience = parseJsonOrNull<ExperienceEntry[]>(
      parent.bulletsJson,
    );
    const parentSkillCategories = parseJsonOrNull<SkillCategoryEntry[]>(
      parent.skillsJson ?? null,
    );
    const parentEducation = parseJsonOrNull<EducationEntry[]>(
      parent.educationJson ?? null,
    );
    const parentCoverParagraphs = parseJsonOrNull<string[]>(
      parent.coverParagraphsJson,
    );
    const parentRationale = parseRationale(parent.rationaleJson);

    const priorityRequirements = parentRationale?.priorityRequirements ?? [];
    const rationaleDraft = parentRationale?.text ?? "";

    const decision = await revisionPlannerNode.execute({
      feedbackComment: planIn.feedbackComment,
      feedbackRating: planIn.feedbackRating,
      parentCv:
        parentExperience && parentSkillCategories
          ? { experience: parentExperience, skillCategories: parentSkillCategories }
          : null,
      parentCoverParagraphs,
    });

    log.info(MODULE, "revision decision", {
      editCv: decision.editCv,
      editCover: decision.editCover,
      rationale: decision.rationale,
    });

    const tasks: Partial<{ cv: CvGeneratorInput; cover: CoverGeneratorInput }> = {};

    if (decision.editCv) {
      const parentCv =
        parentExperience && parentSkillCategories
          ? {
              experience: parentExperience,
              skillCategories: parentSkillCategories,
              education: parentEducation ?? [],
            }
          : null;

      tasks.cv = {
        jobDescription: planIn.jobDescription,
        company: planIn.company,
        title: planIn.title,
        profileContent: planIn.profileContent,
        profile: planIn.profile,
        outDir: planIn.outDir,
        priorityRequirements,
        rationaleDraft,
        parentCv,
        userFeedbackComment: planIn.feedbackComment ?? null,
      };
    }

    if (decision.editCover) {
      tasks.cover = {
        jobDescription: planIn.jobDescription,
        company: planIn.company,
        title: planIn.title,
        profileContent: planIn.profileContent,
        profile: planIn.profile,
        job: { company: planIn.company, title: planIn.title },
        outDir: planIn.outDir,
        rationaleDraft,
        parentCoverParagraphs,
        userFeedbackComment: planIn.feedbackComment ?? null,
      };
    }

    return tasks;
  },
);
