import { getDb } from './client';
import { log } from '@/lib/log';

export interface Job {
  id: string;
  source: string;
  external_id: string;
  url: string;
  title: string;
  company: string;
  location: string;
  description_md: string;
  raw_snapshot: string | null;
  match_score: number;
  match_reason: string;
  status: 'new' | 'shortlisted' | 'applied' | 'discarded';
  fetched_at: number;
}

export function getSeenExternalIds(source: string): Set<string> {
  const db = getDb();
  const rows = db.prepare('SELECT external_id FROM jobs WHERE source = ?').all(source) as { external_id: string }[];
  return new Set(rows.map(r => r.external_id));
}

export function insertJob(job: Omit<Job, 'fetched_at'> & { fetched_at?: number }): Job {
  const db = getDb();
  const now = job.fetched_at ?? Date.now();
  try {
    db.prepare(`
      INSERT INTO jobs (id, source, external_id, url, title, company, location, description_md, raw_snapshot, match_score, match_reason, status, fetched_at)
      VALUES (@id, @source, @external_id, @url, @title, @company, @location, @description_md, @raw_snapshot, @match_score, @match_reason, @status, @fetched_at)
    `).run({ ...job, fetched_at: now });
    log.info('db', 'jobs insertJob', { id: job.id, source: job.source, external_id: job.external_id, status: job.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const constraintMatch = msg.match(/UNIQUE constraint failed: ([^\s]+)/);
    if (constraintMatch) {
      log.error('db', 'constraint violation', { constraint: constraintMatch[1], message: msg.split('\n')[0] });
    } else {
      log.error('db', 'insertJob error', { message: msg });
    }
    throw err;
  }
  return { ...job, fetched_at: now } as Job;
}

export function listJobs(opts?: { status?: Job['status'] }): Job[] {
  const db = getDb();
  if (opts?.status) {
    return db.prepare('SELECT * FROM jobs WHERE status = ? ORDER BY fetched_at DESC').all(opts.status) as Job[];
  }
  return db.prepare('SELECT * FROM jobs ORDER BY fetched_at DESC').all() as Job[];
}

export function getJobById(id: string): Job | undefined {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Job | undefined;
  if (!job) {
    log.warn('db', 'getJobById: not found', { id });
  }
  return job;
}

export function updateJobStatus(id: string, status: Job['status']): void {
  const db = getDb();
  try {
    db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(status, id);
    log.info('db', 'jobs updateJobStatus', { id, status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('db', 'updateJobStatus error', { id, message: msg });
    throw err;
  }
}
