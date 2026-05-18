import { z } from "zod";
import { deepinfra } from "@ai-sdk/deepinfra";
import { generateObject } from "ai";
import { node } from "@/lib/agents/workflows/node";
import { log } from "@/lib/utils/log";
import type { EvaluatorInput } from "@/lib/agents/workflows/evaluator-optimizer";
import type { CvSolution, CoverSolution, WritingFeedback, CompositeFeedback } from "../types";
import {
  CV_WRITING_EVALUATOR_PROMPT,
  COVER_WRITING_EVALUATOR_PROMPT,
} from "./prompt-writing";

const MODULE = "writer/evaluate/writing";

const WritingVerdictSchema = z.object({
  accepted: z.boolean(),
  issues: z.array(z.string()),
});

function makeWritingEvaluator<TIn extends { company: string }, TSolution extends CvSolution | CoverSolution>(
  prompt: string,
  artifactName: string,
  extractText: (solution: TSolution) => string,
) {
  return node(async (evalInput: EvaluatorInput<TIn, TSolution, CompositeFeedback>): Promise<WritingFeedback> => {
    const { input, solution } = evalInput;
    const model = "deepseek-ai/DeepSeek-V4-Flash";
    const t0 = Date.now();

    const textBundle = extractText(solution);

    // Resolve placeholders in system prompt
    const systemPrompt = prompt.replaceAll("<target_company>", input.company);

    log.info(MODULE, `${artifactName} writing evaluation begin`, {
      model,
      textLength: textBundle.length,
    });

    const { object } = await generateObject({
      model: deepinfra(model),
      schema: WritingVerdictSchema,
      system: systemPrompt,
      prompt: textBundle,
    });

    log.info(MODULE, `${artifactName} writing evaluation end`, {
      accepted: object.accepted,
      issues: object.issues,
      duration: Date.now() - t0,
    });

    return {
      accepted: object.accepted,
      issues: object.issues,
    };
  });
}

function extractCvText(solution: CvSolution): string {
  const lines: string[] = [];
  for (const exp of solution.experience) {
    lines.push(`## ${exp.role} @ ${exp.company} (${exp.period})`);
    for (const b of exp.bullets) lines.push(`- ${b}`);
  }
  lines.push("");
  lines.push("## Skills");
  for (const cat of solution.skillCategories) {
    lines.push(`${cat.label}: ${cat.items.join(", ")}`);
  }
  lines.push("");
  lines.push("## Education");
  for (const edu of solution.education) {
    lines.push(`${edu.degree} @ ${edu.institution} (${edu.period})`);
  }
  return lines.join("\n");
}

function extractCoverText(solution: CoverSolution): string {
  return solution.paragraphs.join("\n\n");
}

export const writingCvEvaluator = makeWritingEvaluator(
  CV_WRITING_EVALUATOR_PROMPT,
  "cv",
  extractCvText,
);

export const writingCoverEvaluator = makeWritingEvaluator(
  COVER_WRITING_EVALUATOR_PROMPT,
  "cover",
  extractCoverText,
);
