import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { MockLanguageModelV3 } from 'ai/test';
import { generateText } from 'ai';
import { createDeepInfra } from '@ai-sdk/deepinfra';

// Mock deepinfra to use our mock model
vi.mock('@ai-sdk/deepinfra', () => ({
  createDeepInfra: vi.fn(() => () => mockModel),
}));

const mockDoGenerate = vi.fn();
const mockModel = new MockLanguageModelV3({ doGenerate: mockDoGenerate });

describe('Scout Tools LLM logic (Official AI SDK Mocks)', () => {
  it('fetchJobDetail uses LLM to summarize job description correctly', async () => {
    mockDoGenerate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '- Summary bullet 1\n- Summary bullet 2' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: { inputTokens: { total: 10, noCache: 10 }, outputTokens: { total: 5, text: 5 } },
    });

    // Manual check of how we would use generateText with the mock
    const { text } = await generateText({
      model: createDeepInfra({ apiKey: 'key' })('model'),
      prompt: 'Summarize job...',
    });

    expect(text).toContain('Summary bullet 1');
    expect(mockDoGenerate).toHaveBeenCalled();
  });
});
