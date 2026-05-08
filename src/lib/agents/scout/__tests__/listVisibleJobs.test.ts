import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/utils/dump', () => ({
  dump: vi.fn(() => ''),
}));

// Mock db before importing tools
vi.mock('@/lib/db/jobs', () => ({
  getSeenExternalIds: vi.fn(),
}));

vi.mock('@/lib/agent-browser/exec', () => ({
  openUrl: vi.fn(),
  waitLoad: vi.fn(),
  scrollDown: vi.fn(),
  waitMs: vi.fn(),
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
    search: { queries: ['software engineer'], locations: ['Madrid'], remote: true },
    lastSummary: null,
    lastRawText: null,
    candidateCount: 0,
    noMatchCalled: false,
    saveMatchCalled: false,
    matchResult: null,
    reviewedJobs: new Map(),
    browserSession: null,
  };
}

describe('listVisibleJobs filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters out already-seen external_ids', async () => {
    const mockSnapshotData = {
      snapshot: `
        - link "Software Engineer" [ref=e38, url=https://www.linkedin.com/jobs/view/software-engineer-11111111/]
        - link "Backend Developer" [ref=e39, url=https://www.linkedin.com/jobs/view/backend-developer-22222222/]
        - link "Frontend Developer" [ref=e40, url=https://www.linkedin.com/jobs/view/frontend-developer-33333333/]
      `,
      refs: {},
    };
    vi.mocked(snapshot).mockResolvedValue({ success: true, data: mockSnapshotData });
    vi.mocked(getSeenExternalIds).mockReturnValue(new Set(['11111111', '22222222']));

    const ctx = makeCtx();
    const tools = makeScoutTools(ctx);
    const result = await tools.listVisibleJobs.execute?.({} as never, {} as never);

    expect((result as { jobs: unknown[]; new_count: number }).new_count).toBe(1);
    expect((result as { jobs: Array<{ external_id: string }> }).jobs[0].external_id).toBe('33333333');
  });

  it('returns empty list when all jobs already seen', async () => {
    vi.mocked(snapshot).mockResolvedValue({
      success: true,
      data: {
        snapshot: '- link "DevOps Engineer" [ref=e41, url=https://www.linkedin.com/jobs/view/devops-engineer-99999999/]',
        refs: {},
      },
    });
    vi.mocked(getSeenExternalIds).mockReturnValue(new Set(['99999999']));

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
          - link "Staff Engineer" [ref=e42, url=https://www.linkedin.com/jobs/view/staff-engineer-10000111/]
          - link "Principal Developer" [ref=e43, url=https://www.linkedin.com/jobs/view/principal-developer-10000222/]
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
