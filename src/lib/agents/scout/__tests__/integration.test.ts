import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──────────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────────

vi.mock('@/lib/profile/load', () => ({
  loadProfile: vi.fn(() => `# Profile\n\n- b0: Skill 1`),
  PROFILE_PATH: '/fake/profile.md',
}));

vi.mock('@/lib/profile/parse', () => ({
  parseProfile: vi.fn(() => ({
    search: { query: 'software engineer', location: 'Madrid', remote: true },
    rawContent: '# Profile',
    bulletCatalog: [{ bulletId: 'b0', text: 'Skill 1' }],
  })),
}));

vi.mock('@/lib/profile/hash', () => ({
  hashProfile: vi.fn(() => 'abc123'),
}));

vi.mock('@/lib/db/jobs', () => ({
  getSeenExternalIds: vi.fn(() => new Set()),
  insertJob: vi.fn((job: any) => ({ ...job, fetched_at: Date.now() })),
  getJobById: vi.fn(),
}));

vi.mock('@/lib/agent-browser/exec', () => ({
  closeBrowser: vi.fn(),
  resetBrowserState: vi.fn(),
}));

// MOCK THE AGENT FACTORY DIRECTLY
// This is the most reliable way to test orchestrator logic in complex agent loops
vi.mock('../agent', () => ({
  createScoutAgent: vi.fn(() => ({
    agent: {
      generate: vi.fn(),
    },
    ctx: {
      saveMatchCalled: false,
      noMatchCalled: false,
      candidateCount: 0,
    },
  })),
  SCOUT_MAX_CANDIDATES: 5,
}));

// ──────────────────────────────────────────────────────────────
// Import after mocks
// ──────────────────────────────────────────────────────────────

import { createScoutAgent } from '../agent';
import { insertJob } from '@/lib/db/jobs';
import { runScout } from '../orchestrator';

describe('Scout integration (Orchestrator Test)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('kind: match — orchestrator succeeds when agent sets saveMatchCalled', async () => {
    vi.mocked(createScoutAgent).mockReturnValue({
      agent: { generate: vi.fn().mockResolvedValue({}) } as any,
      ctx: {
        saveMatchCalled: true,
        noMatchCalled: false,
        candidateCount: 1,
        lastSummary: { external_id: '123', url: '...', title: 'Dev', company: 'Tech', location: 'Remote', summary_md: '...' },
        matchResult: { score: 0.9, reason: 'Good' },
      } as any,
    });

    const result = await runScout();
    expect(result.kind).toBe('match');
    expect(insertJob).toHaveBeenCalled();
  });

  it('kind: no_match — orchestrator succeeds when agent sets noMatchCalled', async () => {
    vi.mocked(createScoutAgent).mockReturnValue({
      agent: { generate: vi.fn().mockResolvedValue({}) } as any,
      ctx: {
        saveMatchCalled: false,
        noMatchCalled: true,
        candidateCount: 3,
      } as any,
    });

    const result = await runScout();
    expect(result.kind).toBe('no_match');
  });
});
