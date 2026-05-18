import { node } from "@/lib/agents/workflows/node";
import { log } from "@/lib/utils/log";
import { planNode, type PlanInput } from "./plan/agent";
import type { CvGeneratorInput } from "./generate/cv";
import type { CoverGeneratorInput } from "./generate/cover";
import type {
  ExperienceEntry,
  SkillCategoryEntry,
  EducationEntry,
} from "./types";

const MODULE = "writer/decomposer";

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

export const decomposerNode = node(
  async (planIn: PlanInput): Promise<{
    cv: CvGeneratorInput;
    cover: CoverGeneratorInput;
  }> => {
    const plan = await planNode.execute(planIn);

    const parentExperience = parseJsonOrNull<ExperienceEntry[]>(
      planIn.parentGeneration?.bulletsJson,
    );
    const parentSkillCategories = parseJsonOrNull<SkillCategoryEntry[]>(
      planIn.parentGeneration?.skillsJson ?? null,
    );
    const parentCoverParagraphs = parseJsonOrNull<string[]>(
      planIn.parentGeneration?.coverParagraphsJson,
    );

    const parentCv =
      parentExperience && parentSkillCategories
        ? {
            experience: parentExperience,
            skillCategories: parentSkillCategories,
            education: plan.cv.education as EducationEntry[],
          }
        : null;

    const userFeedbackComment = planIn.parentGeneration?.feedbackComment ?? null;

    return {
      cv: {
        plan: plan.cv,
        priorityRequirements: plan.priorityRequirements,
        jobDescription: planIn.jobDescription,
        company: planIn.company,
        title: planIn.title,
        profileContent: planIn.profileContent,
        profile: planIn.profile,
        outDir: planIn.outDir,
        rationaleDraft: plan.rationaleDraft,
        parentCv,
        userFeedbackComment,
      },
      cover: {
        plan: plan.cover,
        jobDescription: planIn.jobDescription,
        company: planIn.company,
        title: planIn.title,
        profileContent: planIn.profileContent,
        profile: planIn.profile,
        job: { company: planIn.company, title: planIn.title },
        outDir: planIn.outDir,
        rationaleDraft: plan.rationaleDraft,
        parentCoverParagraphs,
        userFeedbackComment,
      },
    };
  },
);
