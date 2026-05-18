import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

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
    anchors: { bullets: [], skills: [] },
    skillCategories: [],
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

interface StoredGeneration {
  id: string;
  job_id: string;
  created_at: number;
}

vi.mock('@/lib/db/generations', () => ({
  insertGeneration: vi.fn((g: StoredGeneration) => ({ ...g, created_at: Date.now() })),
  getGenerationById: vi.fn(),
  getLatestGenerationByJobId: vi.fn(() => null),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: vi.fn(),
    generateObject: vi.fn().mockResolvedValue({
      object: {
        cv: {
          bullets: [],
          skillCategories: [],
          education: [],
          layoutBudget: { maxBullets: 10, maxSkillCategories: 3, maxTotalSkills: 10, maxCoverParagraphs: 3 }
        },
        cover: {
          outline: { hook: 'hook', evidence: [], close: 'close' },
          toneGuidelines: 'tone'
        },
        rationaleDraft: 'rationale'
      }
    }),
    tool: actual.tool,
  };
});

vi.mock('../generate/cv', () => ({
  cvGenerator: {
    execute: vi.fn().mockResolvedValue({
      experience: [],
      skillCategories: [],
      education: [],
      pdfPath: 'cv.pdf',
      imageBase64: 'base64'
    })
  }
}));

vi.mock('../generate/cover', () => ({
  coverGenerator: {
    execute: vi.fn().mockResolvedValue({
      paragraphs: [],
      pdfPath: 'cover.pdf',
      imageBase64: 'base64'
    })
  }
}));

vi.mock('../evaluate/visual', () => ({
  visualCvEvaluator: { execute: vi.fn().mockResolvedValue({ accepted: true, issues: [] }) },
  visualCoverEvaluator: { execute: vi.fn().mockResolvedValue({ accepted: true, issues: [] }) },
}));

vi.mock('../evaluate/writing', () => ({
  writingCvEvaluator: { execute: vi.fn().mockResolvedValue({ accepted: true, issues: [] }) },
  writingCoverEvaluator: { execute: vi.fn().mockResolvedValue({ accepted: true, issues: [] }) },
}));

vi.mock('@react-pdf/renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@react-pdf/renderer')>();
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

import { insertGeneration } from '@/lib/db/generations';
import { runWriter } from '../orchestrator';
import { cvGenerator } from '../generate/cv';

describe('Writer integration (Orchestrator Test)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates files when distributed workflow succeeds', async () => {
    const result = await runWriter({ jobId: 'job1' });

    expect(result.kind).toBe('success');
    expect(insertGeneration).toHaveBeenCalled();
  });

  it('handles generator errors gracefully', async () => {
    vi.mocked(cvGenerator.execute).mockRejectedValue(new Error('Agent Failed'));

    const result = await runWriter({ jobId: 'job1' });

    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toContain('Agent Failed');
    }
  });
});
