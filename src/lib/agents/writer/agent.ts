import { ToolLoopAgent, isLoopFinished } from 'ai';
import { createDeepInfra } from '@ai-sdk/deepinfra';
import { makeWriterTools, type WriterRunContext } from './tools';

const BASE_INSTRUCTIONS = `You are a specialized agent that adapts CVs and cover letters for specific job offers.

## HARD constraints (non-negotiable)
- ALL output (bullet texts and cover letter paragraphs) MUST be written in English, regardless of the language used in the user's profile.
- Do NOT invent technologies, job titles, companies, durations, or achievements absent from the user's profile.
- Do NOT alter the template structure (sections, layout).
- You may only select bulletIds from the catalog provided in the prompt.
- The wording of each bullet CAN be adapted (tone, verbs, keywords, emphasis) as long as the factual information remains traceable to the profile.

## Expected flow
1. Call \`selectBullets\` with the ordered selection of bullets adapted to the position.
2. Call \`composeCoverLetter\` with the letter paragraphs (2-6 paragraphs).
3. Call \`finalizeGeneration\` to close the loop.

Always produce all three steps before finishing.`;

const ITERATION_INSTRUCTIONS = `
## Iteration mode
You receive the previous generation (selected bullets and previous cover letter body) and user feedback.
Your goal is to produce an IMPROVED version that addresses the feedback.
You can and should rewrite bullet wording if the feedback justifies it.
The hard constraints from the profile (no inventing facts) remain absolute.
Remember: all output must be in English.`;

export function createWriterAgent(
  ctx: WriterRunContext,
  isIteration: boolean,
) {
  const deepinfra = createDeepInfra({ apiKey: process.env.DEEPINFRA_API_KEY! });
  const instructions = isIteration
    ? BASE_INSTRUCTIONS + ITERATION_INSTRUCTIONS
    : BASE_INSTRUCTIONS;

  return new ToolLoopAgent({
    model: deepinfra('moonshotai/Kimi-K2.5'),
    instructions,
    tools: makeWriterTools(ctx),
    stopWhen: (state) => {
      if (ctx.finalized) return true;
      return isLoopFinished()(state);
    },
  });
}
