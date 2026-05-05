import "server-only";
import * as fs from "node:fs";
import * as path from "node:path";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { generateText } from "ai";
import { LOG_DIR } from "@/lib/runtime/paths";
import { buildRunBundle } from "./bundle";
import { REVIEWER_SYSTEM_PROMPT } from "./prompt";

const LLM_MODEL = "zai-org/GLM-5.1";

export async function reviewRun(runId: string): Promise<string> {
  const runDir = path.join(LOG_DIR, runId);

  if (!fs.existsSync(runDir)) {
    throw new Error(`Run ${runId} not found`);
  }

  const bundle = buildRunBundle(runDir);

  const deepinfra = createDeepInfra({
    apiKey: process.env.DEEPINFRA_API_KEY!,
  });

  const { text: review } = await generateText({
    model: deepinfra(LLM_MODEL),
    system: REVIEWER_SYSTEM_PROMPT,
    prompt: `Analyze the following run and produce a structured review:\n\n${bundle}`,
    maxOutputTokens: 4096,
  });

  const reviewPath = path.join(runDir, "review.md");
  fs.writeFileSync(reviewPath, review, "utf8");

  return review;
}
