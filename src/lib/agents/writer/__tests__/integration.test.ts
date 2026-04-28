import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──────────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────────

vi.mock('@/lib/profile/load', () => ({
  loadProfile: vi.fn(() => `# Profile`),
}));

vi.mock('@/lib/profile/parse', () => ({
  parseProfile: vi.fn(() => ({
    search: { queries: ['software engineer'] },
    profile: {
      name: 'Test Name',
      role: 'Test Role',
      email: 'test@example.com',
      phone: '123456789',
      location: 'Test Location',
      linkedinUrl: 'https://linkedin.com/in/test'
    },
    rawContent: '# Profile',
  })),
}));

vi.mock('@/lib/profile/hash', () => ({
  hashProfile: vi.fn(() => 'abc123'),
}));

vi.mock('@/lib/db/jobs', () => ({
  getJobById: vi.fn(() => ({
    id: 'job1',
    title: 'Engineer',
    company: 'TechCorp',
    description_md: 'Job requirements...',
  })),
}));

vi.mock('@/lib/db/generations', () => ({
  insertGeneration: vi.fn((g: any) => ({ ...g, id: 'gen1', created_at: Date.now() })),
  getGenerationById: vi.fn(),
  getLatestGenerationByJobId: vi.fn(() => null),
}));

vi.mock('@react-pdf/renderer', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    renderToFile: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('node:fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    statSync: vi.fn().mockReturnValue({ size: 1234 }),
    writeFileSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
  },
  mkdirSync: vi.fn(),
  statSync: vi.fn().mockReturnValue({ size: 1234 }),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
}));

// Mock the agent factory
vi.mock('../agent', () => ({
  createWriterAgent: vi.fn(),
}));

// ──────────────────────────────────────────────────────────────
// Import after mocks
// ──────────────────────────────────────────────────────────────

import { createWriterAgent } from '../agent';
import { insertGeneration } from '@/lib/db/generations';
import { runWriter } from '../orchestrator';

describe('Writer integration (Orchestrator Test)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates files when agent finalizes', async () => {
    vi.mocked(createWriterAgent).mockImplementation((ctx: any) => {
      ctx.experience = [{ company: 'C1', role: 'R1', period: 'P1', bullets: ['B1'] }];
      ctx.skills = ['React', 'TypeScript'];
      ctx.education = [{ institution: 'U1', degree: 'D1', period: '2020' }];
      ctx.coverParagraphs = ['P1', 'P2'];
      ctx.rationale = { priorityRequirements: ['R1'], text: 'Rationale text' };
      ctx.finalized = true;
      return {
        generate: vi.fn().mockResolvedValue({}),
      } as any;
    });

    const result = await runWriter({ jobId: 'job1' });

    expect(result.kind).toBe('success');
    expect(insertGeneration).toHaveBeenCalled();
  });

  it('handles agent errors gracefully', async () => {
    vi.mocked(createWriterAgent).mockReturnValue({
      generate: vi.fn().mockRejectedValue(new Error('Agent Failed')),
    } as any);

    const result = await runWriter({ jobId: 'job1' });

    expect(result.kind).toBe('error');
    expect((result as any).message).toContain('Agent Failed');
  });
});
