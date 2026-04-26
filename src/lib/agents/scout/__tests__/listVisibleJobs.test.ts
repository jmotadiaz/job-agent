import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db before importing tools
vi.mock('@/lib/db/jobs', () => ({
  getSeenExternalIds: vi.fn(),
}));

vi.mock('@/lib/agent-browser/exec', () => ({
  openUrl: vi.fn(),
  waitLoad: vi.fn(),
  snapshot: vi.fn(),
  getText: vi.fn(),
  closeBrowser: vi.fn(),
  resetBrowserState: vi.fn(),
}));

vi.mock('@ai-sdk/deepinfra', () => ({
  createDeepInfra: vi.fn(() => (model: string) => ({ modelId: model })),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: vi.fn(),
    tool: actual.tool,
  };
});

import { getSeenExternalIds } from '@/lib/db/jobs';
import { snapshot } from '@/lib/agent-browser/exec';
import { makeScoutTools } from '../tools';
import type { ScoutRunContext } from '../tools';

function makeCtx(): ScoutRunContext {
  return {
    search: { queries: ['software engineer'], location: 'Madrid', remote: true },
    lastSummary: null,
    lastRawText: null,
    candidateCount: 0,
    noMatchCalled: false,
    saveMatchCalled: false,
    matchResult: null,
  };
}

describe('listVisibleJobs filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters out already-seen external_ids', async () => {
    const mockSnapshotData = {
      snapshot: `
        https://www.linkedin.com/jobs/view/111111/
        https://www.linkedin.com/jobs/view/222222/
        https://www.linkedin.com/jobs/view/333333/
      `,
      refs: {},
    };
    vi.mocked(snapshot).mockResolvedValue({ success: true, data: mockSnapshotData });
    vi.mocked(getSeenExternalIds).mockReturnValue(new Set(['111111', '222222']));

    const ctx = makeCtx();
    const tools = makeScoutTools(ctx);
    const result = await tools.listVisibleJobs.execute?.({} as never, {} as never);

    expect((result as { jobs: unknown[]; new_count: number }).new_count).toBe(1);
    expect((result as { jobs: Array<{ external_id: string }> }).jobs[0].external_id).toBe('333333');
  });

  it('returns empty list when all jobs already seen', async () => {
    vi.mocked(snapshot).mockResolvedValue({
      success: true,
      data: {
        snapshot: 'https://www.linkedin.com/jobs/view/999999/',
        refs: {},
      },
    });
    vi.mocked(getSeenExternalIds).mockReturnValue(new Set(['999999']));

    const ctx = makeCtx();
    const tools = makeScoutTools(ctx);
    const result = await tools.listVisibleJobs.execute?.({} as never, {} as never);

    expect((result as { jobs: unknown[] }).jobs).toHaveLength(0);
    expect((result as { new_count: number }).new_count).toBe(0);
  });

  it('returns all jobs when none previously seen', async () => {
    vi.mocked(snapshot).mockResolvedValue({
      success: true,
      data: {
        snapshot: `
          https://www.linkedin.com/jobs/view/100001/
          https://www.linkedin.com/jobs/view/100002/
        `,
        refs: {},
      },
    });
    vi.mocked(getSeenExternalIds).mockReturnValue(new Set());

    const ctx = makeCtx();
    const tools = makeScoutTools(ctx);
    const result = await tools.listVisibleJobs.execute?.({} as never, {} as never);

    expect((result as { new_count: number }).new_count).toBe(2);
  });
});
