import { node } from "@/lib/agents/workflows/node";
import type { OptimizerInput } from "@/lib/agents/workflows/evaluator-optimizer";
import { log } from "@/lib/utils/log";
import { appendAgentStep } from "@/lib/runtime/agent-trace";
import { createCoverAgent } from "../cover/agent";
import { coverRender } from "../render/cover";
import type { CoverPlan, CoverSolution, CompositeFeedback, WriterRunContext } from "../types";

const MODULE = "writer/generate/cover";

export interface CoverGeneratorInput {
  plan: CoverPlan;
  jobDescription: string;
  company: string;
  title: string;
  profileContent: string;
  profile: {
    name: string;
    role: string;
    email: string;
    phone: string;
    linkedinUrl: string;
  };
  job: {
    company: string;
    title: string;
  };
  outDir: string;
  rationaleDraft: string;
  parentCoverParagraphs?: string[] | null;
  userFeedbackComment?: string | null;
}

export const coverGenerator = node(
  async (
    input: OptimizerInput<CoverGeneratorInput, CoverSolution, CompositeFeedback>,
  ): Promise<CoverSolution> => {
    const { plan, jobDescription, company, title, profileContent } = input.input;

    let prompt = `Generate the cover letter for the following job offer. Follow the Plan below precisely.

<target_company>${company}</target_company>
<target_title>${title}</target_title>

<job_offer>
${jobDescription}
</job_offer>

<candidate_profile>
${profileContent}
</candidate_profile>

<plan>
Hook: ${plan.outline.hook}

Evidence paragraphs (${plan.outline.evidence.length} total):
`;
    for (let i = 0; i < plan.outline.evidence.length; i++) {
      prompt += `${i + 1}. ${plan.outline.evidence[i]}\n`;
    }

    prompt += `\nClose: ${plan.outline.close}\n`;
    if (plan.outline.toneNote) {
      prompt += `Tone note: ${plan.outline.toneNote}\n`;
    }
    prompt += `Tone guidelines: ${plan.toneGuidelines}\n`;
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

    const seedParagraphs = input.previousSolution
      ? {
          paragraphs: input.previousSolution.paragraphs,
          source: "previousSolution" as const,
        }
      : input.input.parentCoverParagraphs
        ? {
            paragraphs: input.input.parentCoverParagraphs,
            source: "parentGeneration" as const,
          }
        : null;

    if (seedParagraphs) {
      ctx.coverParagraphs = seedParagraphs.paragraphs;
      prompt += `\n<current_cover_state>\n`;
      prompt += `paragraphs: ${JSON.stringify(seedParagraphs.paragraphs)}\n`;
      prompt += `</current_cover_state>\n`;
      prompt += `\nThe cover letter state above is the authoritative starting point. Preserve paragraphs that the feedback does not target.\n`;

      if (
        seedParagraphs.source === "parentGeneration" &&
        input.input.userFeedbackComment
      ) {
        prompt += `\n<user_feedback>\n${input.input.userFeedbackComment}\n</user_feedback>\n`;
      }
    }

    log.info(MODULE, "cover generation begin", {
      iteration: input.iteration,
      evidenceCount: plan.outline.evidence.length,
      hasFeedback: !!input.feedback,
      feedback: input.feedback,
      seedSource: seedParagraphs?.source ?? null,
    });

    const agent = createCoverAgent(ctx);
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

    if (!ctx.coverParagraphs) {
      throw new Error("Cover letter agent did not produce paragraphs");
    }

    let solution: CoverSolution = {
      paragraphs: ctx.coverParagraphs,
      pdfPath: "",
      imageBase64: "",
      pageCount: 0,
    };

    solution = await coverRender.execute({
      solution,
      profile: input.input.profile,
      job: input.input.job,
      outDir: input.input.outDir,
    });

    log.info(MODULE, "cover generation end", {
      iteration: input.iteration,
      paragraphCount: ctx.coverParagraphs.length,
      duration: Date.now() - t0,
    });

    return solution;
  },
);
