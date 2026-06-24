import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export const opencodeGo = createOpenAICompatible({
  name: 'opencode-zen-go',
  apiKey: process.env.OPENCODE_GO_API_KEY,
  baseURL: 'https://opencode.ai/zen/go/v1',
  includeUsage: true,
});

export function createOpenAIGo(config?: { apiKey?: string }) {
  return createOpenAICompatible({
    name: 'opencode-zen-go',
    apiKey: config?.apiKey ?? process.env.OPENCODE_GO_API_KEY,
    baseURL: 'https://opencode.ai/zen/go/v1',
    includeUsage: true,
  });
}
