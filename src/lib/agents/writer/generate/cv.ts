import { node } from "@/lib/agents/workflows/node";
import type { OptimizerInput } from "@/lib/agents/workflows/evaluator-optimizer";
import { log } from "@/lib/utils/log";
import { appendAgentStep } from "@/lib/runtime/agent-trace";
import { createCvAgent } from "../cv/agent";
import { cvRender } from "../render/cv";
import type {
  CvPlan,
  CvSolution,
  CompositeFeedback,
  WriterRunContext,
  ExperienceEntry,
  SkillCategoryEntry,
  EducationEntry,
} from "../types";

const MODULE = "writer/generate/cv";

export interface CvGeneratorInput {
  plan: CvPlan;
  priorityRequirements: string[];
  jobDescription: string;
  company: string;
  title: string;
  profileContent: string;
  profile: {
    name: string;
    role: string;
    email: string;
    phone: string;
    location: string;
    linkedinUrl: string;
    website?: string;
  };
  outDir: string;
  rationaleDraft: string;
  parentCv?: {
    experience: ExperienceEntry[];
    skillCategories: SkillCategoryEntry[];
    education: EducationEntry[];
  } | null;
  userFeedbackComment?: string | null;
}

export const cvGenerator = node(
  async (
    input: OptimizerInput<CvGeneratorInput, CvSolution, CompositeFeedback>,
  ): Promise<CvSolution> => {
    const { plan, priorityRequirements, jobDescription, company, title, profileContent } = input.input;

    let prompt = `Generate the CV content for the following job offer. Follow the Plan below precisely.

<target_company>${company}</target_company>
<target_title>${title}</target_title>

<job_offer>
${jobDescription}
</job_offer>

<candidate_profile>
${profileContent}
</candidate_profile>

<plan>
Priority requirements (${priorityRequirements.length}):
`;
    for (let i = 0; i < priorityRequirements.length; i++) {
      prompt += `  [${i + 1}] ${priorityRequirements[i]}\n`;
    }

    prompt += `\nSelected bullets (${plan.bullets.length} total):\n`;
    for (const b of plan.bullets) {
      const pr = priorityRequirements[b.priorityRequirementIndex - 1];
      prompt += `- [${b.company}, ${b.role}, ${b.period}] ${b.originalText}\n`;
      if (b.rewrittenText) {
        prompt += `  Suggested rewrite: ${b.rewrittenText}\n`;
      }
      prompt += `  Covers priority #${b.priorityRequirementIndex}${pr ? ` (${pr})` : ""}\n`;
    }

    prompt += `\nSkill categories (${plan.skillCategories.length} total):\n`;
    for (const cat of plan.skillCategories) {
      prompt += `- ${cat.label}: ${cat.items.join(", ")}\n`;
    }

    prompt += `\nEducation:\n`;
    for (const edu of plan.education) {
      prompt += `- ${edu.degree} @ ${edu.institution} (${edu.period})\n`;
    }

    prompt += `\nLayout budget: max ${plan.layoutBudget.maxBullets} bullets, ${plan.layoutBudget.maxSkillCategories} skill categories, ${plan.layoutBudget.maxTotalSkills} total skills.\n`;
    prompt += `</plan>\n`;

    if (input.feedback) {
      prompt += `\n<previous_attempt_feedback>\n`;
      if (input.feedback.visual && !input.feedback.visual.accepted) {
        prompt += `Visual/layout issues:\n`;
        for (const issue of input.feedback.visual.issues) {
          prompt += `- ${issue}\n`;
        }
      }
      if (input.feedback.writing && !input.feedback.writing.accepted) {
        prompt += `Writing/content issues:\n`;
        for (const issue of input.feedback.writing.issues) {
          prompt += `- ${issue}\n`;
        }
      }
      prompt += `</previous_attempt_feedback>\n`;
    }

    const ctx: WriterRunContext = {
      experience: null,
      skillCategories: null,
      education: null,
      coverParagraphs: null,
      rationale: null,
      finalized: false,
    };

    const seedFromPrevious = input.previousSolution
      ? {
          experience: input.previousSolution.experience,
          skillCategories: input.previousSolution.skillCategories,
          education: input.previousSolution.education,
          source: "previousSolution" as const,
        }
      : input.input.parentCv
        ? { ...input.input.parentCv, source: "parentGeneration" as const }
        : null;

    log.info(MODULE, "cv generation begin", {
      iteration: input.iteration,
      bulletCount: plan.bullets.length,
      hasFeedback: !!input.feedback,
      feedback: input.feedback,
      seedSource: seedFromPrevious?.source ?? null,
    });

    if (seedFromPrevious) {
      ctx.experience = seedFromPrevious.experience;
      ctx.skillCategories = seedFromPrevious.skillCategories;
      ctx.education = seedFromPrevious.education;

      prompt += `\n<current_cv_state>\n`;
      prompt += `experience: ${JSON.stringify(seedFromPrevious.experience)}\n`;
      prompt += `skillCategories: ${JSON.stringify(seedFromPrevious.skillCategories)}\n`;
      prompt += `education: ${JSON.stringify(seedFromPrevious.education)}\n`;
      prompt += `</current_cv_state>\n`;
      prompt += `\nThe CV state above is the authoritative starting point. Only patch items that need to change.\n`;

      if (
        seedFromPrevious.source === "parentGeneration" &&
        input.input.userFeedbackComment
      ) {
        prompt += `\n<user_feedback>\n${input.input.userFeedbackComment}\n</user_feedback>\n`;
      }
    }

    const agent = createCvAgent(ctx);
    const t0 = Date.now();

    await agent.generate({
      prompt,
      onStepFinish: (step) => {
        log.info(MODULE, `agent step ${step.stepNumber} finish`, {
          finishReason: step.finishReason,
          usage: step.usage,
          text: step.text?.slice(0, 100) + (step.text?.length > 100 ? "..." : ""),
          toolCalls: step.toolCalls?.map((tc) => ({
            tool: tc.toolName,
            args: tc.input,
          })),
        });

        appendAgentStep(step.stepNumber, {
          text: step.text,
          toolCalls: step.toolCalls?.map((tc) => ({
            toolName: tc.toolName,
            input: tc.input,
          })),
          toolResults: step.toolResults?.map((tr) => ({
            toolName: tr.toolName,
            output: tr.output,
          })),
          finishReason: step.finishReason,
          usage: step.usage,
        });
      },
    });

    if (!ctx.experience || !ctx.skillCategories || !ctx.education) {
      throw new Error("CV agent did not produce experience, skill_categories, and education");
    }

    let solution: CvSolution = {
      experience: ctx.experience,
      skillCategories: ctx.skillCategories,
      education: ctx.education,
      pdfPath: "",
      imageBase64: "",
      pageCount: 0,
    };

    solution = await cvRender.execute({
      solution,
      profile: input.input.profile,
      outDir: input.input.outDir,
    });

    log.info(MODULE, "cv generation end", {
      iteration: input.iteration,
      experienceCount: ctx.experience.length,
      duration: Date.now() - t0,
    });

    return solution;
  },
);
