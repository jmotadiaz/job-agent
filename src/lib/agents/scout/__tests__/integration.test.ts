import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

// ──────────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────────

vi.mock('@/lib/profile/load', () => ({
  loadProfile: vi.fn(() => `# Profile\n\n- b0: Skill 1`),
  PROFILE_PATH: '/fake/profile.md',
}));

vi.mock('@/lib/profile/parse', () => ({
  parseProfile: vi.fn(() => ({
    search: { queries: ['software engineer'], locations: ['Madrid'], remote: true },
    rawContent: '# Profile',
    profile: {
      name: 'Test User',
      role: 'Developer',
      email: 'test@example.com',
      phone: '+123',
      location: 'Madrid',
      linkedinUrl: 'https://linkedin.com/in/test',
    },
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

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'test-nanoid'),
}));

// MOCK THE AGENT FACTORY DIRECTLY
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

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createScoutAgent } from '../agent';
import { runScout } from '../orchestrator';
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-int-test-'));
  // Override the LOG_DIR used by the orchestrator by mocking the module path
  // The orchestrator uses process.cwd() + '/log', so we need to intercept it.
  // We'll use a more direct approach: after the run, look for the run directory
  // under the actual log/ path, but clean it up afterward.
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('Scout integration (Orchestrator Test)', () => {
  it('kind: matches — orchestrator returns saved jobs when agent populated ctx.matches', async () => {
    vi.mocked(createScoutAgent).mockReturnValue({
      agent: { generate: vi.fn().mockResolvedValue({}) } as any,
      ctx: {
        candidateCount: 1,
        noMatchCalled: false,
        matches: [
          {
            id: 'job-1',
            external_id: '123',
            url: 'https://example.com/123',
            title: 'Dev',
            company: 'Tech',
            location: 'Remote',
            description_md: '...',
            match_score: 0.9,
            match_reason: 'Good',
            status: 'shortlisted',
            fetched_at: 1700000000,
          },
        ],
        reviewedJobs: new Map(),
        rawTextByExternalId: new Map(),
      } as any,
    });

    const result = await runScout();
    expect(result.kind).toBe('matches');
    if (result.kind === 'matches') expect(result.jobs).toHaveLength(1);
  });

  it('kind: no_match — orchestrator returns no_match when no jobs saved', async () => {
    vi.mocked(createScoutAgent).mockReturnValue({
      agent: { generate: vi.fn().mockResolvedValue({}) } as any,
      ctx: {
        candidateCount: 3,
        noMatchCalled: true,
        matches: [],
        reviewedJobs: new Map(),
        rawTextByExternalId: new Map(),
      } as any,
    });

    const result = await runScout();
    expect(result.kind).toBe('no_match');
  });
});

describe('Scout run observability', () => {
  let logDir: string;

  beforeEach(async () => {
    const { LOG_DIR } = await import('@/lib/runtime/paths');
    logDir = LOG_DIR;
  });

  afterEach(() => {
    // Clean up any run directories created during tests
    if (fs.existsSync(logDir)) {
      const entries = fs.readdirSync(logDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.includes('test') || entry.name.match(/^\d{4}-\d{2}-\d{2}T/)) {
          try {
            fs.rmSync(path.join(logDir, entry.name), { recursive: true, force: true });
          } catch {
            // ignore cleanup errors
          }
        }
      }
    }
  });

  function createMockAgentWithTrace(toolCalls: boolean = true) {
    return {
      agent: {
        generate: vi.fn().mockImplementation(async (opts: any) => {
          // Simulate agent steps with onStepFinish callback
          if (opts?.onStepFinish) {
            opts.onStepFinish({
              stepNumber: 0,
              text: 'Thinking about search...',
              toolCalls: toolCalls ? [
                { toolName: 'openSearch', input: { query: 'software engineer' } },
              ] : [],
              toolResults: toolCalls ? [
                { toolName: 'openSearch', output: { success: true } },
              ] : [],
              finishReason: toolCalls ? 'tool-calls' : 'stop',
              usage: { promptTokens: 100, completionTokens: 50 },
            });
          }
        }),
      } as any,
      ctx: {
        candidateCount: 1,
        noMatchCalled: false,
        matches: [
          {
            id: 'job-456',
            external_id: '456',
            url: 'https://example.com/job',
            title: 'Senior Dev',
            company: 'TechCorp',
            location: 'Remote',
            description_md: 'A great job',
            match_score: 0.85,
            match_reason: 'Good match',
            status: 'shortlisted',
            fetched_at: 1700000000,
          },
        ],
        reviewedJobs: new Map(),
        rawTextByExternalId: new Map([['456', 'raw description']]),
      } as any,
    };
  }

  function findLatestRunDir(): string | null {
    if (!fs.existsSync(logDir)) return null;
    const dirs = fs.readdirSync(logDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(e.name))
      .map((e) => e.name)
      .sort()
      .reverse();
    return dirs.length > 0 ? path.join(logDir, dirs[0]) : null;
  }

  it('4.6 + 10.4 — produces agent-trace.jsonl with N≥1 lines and non-empty toolCalls', async () => {
    vi.mocked(createScoutAgent).mockReturnValue(createMockAgentWithTrace(true));

    await runScout();

    const runDir = findLatestRunDir();
    expect(runDir).toBeTruthy();

    const tracePath = path.join(runDir!, 'agent-trace.jsonl');
    expect(fs.existsSync(tracePath)).toBe(true);

    const lines = fs.readFileSync(tracePath, 'utf8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(1);

    const record = JSON.parse(lines[0]);
    expect(record).toHaveProperty('ts');
    expect(record).toHaveProperty('step');
    expect(record).toHaveProperty('messages');
    expect(record).toHaveProperty('toolCalls');
    expect(record).toHaveProperty('toolResults');
    expect(record).toHaveProperty('finishReason');
    expect(record.toolCalls.length).toBeGreaterThan(0);
  });

  it('10.1 — produces run directory with the 4 expected files/directories', async () => {
    vi.mocked(createScoutAgent).mockReturnValue(createMockAgentWithTrace(true));

    await runScout();

    const runDir = findLatestRunDir();
    expect(runDir).toBeTruthy();

    expect(fs.existsSync(path.join(runDir!, 'meta.json'))).toBe(true);
    expect(fs.existsSync(path.join(runDir!, 'timeline.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(runDir!, 'agent-trace.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(runDir!, 'artifacts'))).toBe(true);
    expect(fs.statSync(path.join(runDir!, 'artifacts')).isDirectory()).toBe(true);
  });

  it('10.2 — meta.json captures kind, outcome, duration_ms and input fields', async () => {
    vi.mocked(createScoutAgent).mockReturnValue(createMockAgentWithTrace(true));

    await runScout();

    const runDir = findLatestRunDir();
    expect(runDir).toBeTruthy();

    const meta = JSON.parse(fs.readFileSync(path.join(runDir!, 'meta.json'), 'utf8'));
    expect(meta.kind).toBe('scout');
    expect(meta.outcome).toBe('matches');
    expect(typeof meta.duration_ms).toBe('number');
    expect(meta.duration_ms).toBeGreaterThanOrEqual(0);
    expect(meta.input).toBeDefined();
    expect(meta.startedAt).toBeDefined();
    expect(meta.finishedAt).toBeDefined();
  });

  it('10.3 — timeline.jsonl contains agent invoke begin and agent result events', async () => {
    vi.mocked(createScoutAgent).mockReturnValue(createMockAgentWithTrace(true));

    await runScout();

    const runDir = findLatestRunDir();
    expect(runDir).toBeTruthy();

    const timelinePath = path.join(runDir!, 'timeline.jsonl');
    expect(fs.existsSync(timelinePath)).toBe(true);

    const lines = fs.readFileSync(timelinePath, 'utf8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2);

    const events = lines.map((l) => JSON.parse(l));
    const invokeBegin = events.find((e: any) => e.event === 'agent invoke begin');
    const agentResult = events.find((e: any) => e.event === 'agent result');

    expect(invokeBegin).toBeDefined();
    expect(invokeBegin.module).toBe('scout/orchestrator');
    expect(agentResult).toBeDefined();
    expect(agentResult.module).toBe('scout/orchestrator');
  });
});
