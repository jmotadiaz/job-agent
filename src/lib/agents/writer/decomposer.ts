import { node } from "@/lib/agents/workflows/node";
import { planNode, type PlanInput } from "./plan/agent";
import type { CvGeneratorInput } from "./generate/cv";
import type { CoverGeneratorInput } from "./generate/cover";

export const decomposerNode = node(
  async (planIn: PlanInput): Promise<{
    cv: CvGeneratorInput;
    cover: CoverGeneratorInput;
  }> => {
    const plan = await planNode.execute(planIn);
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
      },
    };
  },
);
