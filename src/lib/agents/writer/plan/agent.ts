import { z } from "zod";
import { opencodeGo } from "@/lib/agents/provider";
import { generateObject, NoObjectGeneratedError } from "ai";
import { node } from "@/lib/agents/workflows/node";
import { log } from "@/lib/utils/log";
import { dump } from "@/lib/utils/dump";
import type { Plan } from "../types";
import { PLAN_SYSTEM_PROMPT } from "./prompt";
import type { WriterInput } from "../orchestrator";

const MODULE = "writer/plan";

const PlanSchema = z.object({
  priorityRequirements: z
    .array(z.string())
    .min(3)
    .max(5)
    .describe(
      "3-5 priority requirements distilled from the job offer. Each ≤10 words. These are referenced by index (1-based) from every CV bullet.",
    ),
  cv: z.object({
    bullets: z.array(
      z.object({
        originalText: z.string(),
        company: z.string(),
        role: z.string(),
        period: z.string(),
        priorityRequirementIndex: z.coerce
          .number()
          .int()
          .min(1)
          .max(5)
          .describe(
            "1-based index into the top-level priorityRequirements array. Multiple bullets MAY share the same index. This is NOT a bullet sequence number.",
          ),
        rewrittenText: z
          .string()
          .nullish()
          .transform((v) => v ?? undefined),
      }),
    ),
    skillCategories: z.array(
      z.object({
        label: z.string(),
        items: z.array(z.string()),
      }),
    ),
    education: z.array(
      z.object({
        institution: z.string(),
        degree: z.string(),
        period: z.string(),
      }),
    ),
    layoutBudget: z.object({
      maxBullets: z.coerce.number(),
      maxSkillCategories: z.coerce.number(),
      maxTotalSkills: z.coerce.number(),
      maxCoverParagraphs: z.coerce.number(),
    }),
  }),
  cover: z.object({
    outline: z.object({
      hook: z.string(),
      evidence: z.array(z.string()),
      close: z.string(),
      toneNote: z
        .string()
        .nullish()
        .transform((v) => v ?? undefined),
    }),
    toneGuidelines: z.string(),
  }),
  rationaleDraft: z.string(),
});


export interface PlanInput extends WriterInput {
  jobDescription: string;
  company: string;
  title: string;
  profileContent: string;
  anchors: { bullets: string[]; skills: string[] };
  skillCategories: Array<{ label: string; items: string[] }>;
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
  parentGeneration?: {
    bulletsJson: string;
    skillsJson: string | null;
    coverParagraphsJson: string;
    feedbackRating?: number | null;
    feedbackComment?: string | null;
    cvPath: string;
    coverPath: string;
    rationaleJson: string | null;
    educationJson: string | null;
  } | null;
}

export const planNode = node(async (input: PlanInput): Promise<Plan> => {
  const model = "deepseek-v4-flash";
  const t0 = Date.now();

  let prompt = `Create a detailed execution plan for tailoring a CV and cover letter to the following job offer.

<target_company>${input.company}</target_company>
<target_title>${input.title}</target_title>

<job_offer>
${input.jobDescription}
</job_offer>

<candidate_profile>
${input.profileContent}
</candidate_profile>
`;

  if (input.anchors.bullets.length > 0 || input.anchors.skills.length > 0) {
    prompt += `\n<anchors>\n`;
    if (input.anchors.bullets.length > 0) {
      prompt += `bullets:\n`;
      for (const b of input.anchors.bullets) prompt += `  - ${b}\n`;
    }
    if (input.anchors.skills.length > 0) {
      prompt += `skills:\n`;
      for (const s of input.anchors.skills) prompt += `  - ${s}\n`;
    }
    prompt += `</anchors>\n`;
  }

  if (input.skillCategories.length > 0) {
    prompt += `\n<skill_categories>\n`;
    for (const cat of input.skillCategories) {
      prompt += `${cat.label}: ${cat.items.join(", ")}\n`;
    }
    prompt += `</skill_categories>\n`;
  }

  if (input.parentGeneration) {
    prompt += `\n<previous_generation>\n`;
    prompt += `Selected bullets: ${input.parentGeneration.bulletsJson}\n`;
    prompt += `Selected skills: ${input.parentGeneration.skillsJson ?? "none"}\n`;
    prompt += `Cover letter body: ${input.parentGeneration.coverParagraphsJson}\n`;
    prompt += `</previous_generation>\n`;
    if (input.parentGeneration.feedbackRating) {
      prompt += `\n<user_feedback>\n`;
      prompt += `Rating: ${input.parentGeneration.feedbackRating}/5\n`;
      if (input.parentGeneration.feedbackComment) {
        prompt += `Comment: ${input.parentGeneration.feedbackComment}\n`;
      }
      prompt += `</user_feedback>\n`;
    }
  }

  log.info(MODULE, "plan generation begin", { model, promptLen: prompt.length });

  try {
    const { object } = await generateObject({
      model: opencodeGo(model),
      schema: PlanSchema,
      system: PLAN_SYSTEM_PROMPT,
      prompt,
    });


    log.info(MODULE, "plan generation end", {
      bulletCount: object.cv.bullets.length,
      skillCategoryCount: object.cv.skillCategories.length,
      coverEvidenceCount: object.cover.outline.evidence.length,
      duration: Date.now() - t0,
    });

    return object as Plan;
  } catch (err) {
    const isNoObject = NoObjectGeneratedError.isInstance(err);
    if (isNoObject) {
      dump("plan_no_object", {
        text: err.text,
        finishReason: err.finishReason,
        usage: err.usage,
        response: err.response,
      });
    }
    log.error(MODULE, "plan generation failed", {
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - t0,
      finishReason: isNoObject ? err.finishReason : undefined,
      rawTextLen: isNoObject ? err.text?.length : undefined,
    });
    throw err;
  }
});

