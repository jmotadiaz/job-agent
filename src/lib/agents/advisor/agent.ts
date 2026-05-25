import { streamText } from "ai";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { ADVISOR_SYSTEM_PROMPT } from "./prompt";

const MODEL_NAME = "deepseek-ai/DeepSeek-V4-Flash";

export interface AdvisorInput {
  jobDescription: string;
  profileContent: string;
  messages: { role: "user" | "assistant"; content: string }[];
  onFinish?: (event: { text: string }) => void;
}

export function runAdvisorChat(input: AdvisorInput) {
  const deepinfra = createDeepInfra({ apiKey: process.env.DEEPINFRA_API_KEY! });

  const systemPrompt = `${ADVISOR_SYSTEM_PROMPT}

## User profile

${input.profileContent}

## Job offer

${input.jobDescription}`;

  return streamText({
    model: deepinfra(MODEL_NAME),
    system: systemPrompt,
    messages: input.messages,
    onFinish: input.onFinish,
  });
}
