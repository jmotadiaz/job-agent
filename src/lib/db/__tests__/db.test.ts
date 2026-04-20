import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// Create an isolated in-memory or temp-file DB for tests
let db: Database.Database;

function setupSchema(db: Database.Database) {
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT NOT NULL,
      description_md TEXT NOT NULL,
      raw_snapshot TEXT NULL,
      match_score REAL NOT NULL,
      match_reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'shortlisted' CHECK (status IN ('new', 'shortlisted', 'applied', 'discarded')),
      fetched_at INTEGER NOT NULL,
      UNIQUE(source, external_id)
    );
    CREATE TABLE IF NOT EXISTS generations (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      profile_hash TEXT NOT NULL,
      cv_path TEXT NOT NULL,
      cover_path TEXT NOT NULL,
      bullets_json TEXT NOT NULL DEFAULT '[]',
      cover_paragraphs_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      parent_generation_id TEXT NULL REFERENCES generations(id),
      feedback_rating INTEGER NULL CHECK (feedback_rating BETWEEN 1 AND 5),
      feedback_comment TEXT NULL
    );
  `);
}

const baseJob = {
  id: 'job-1',
  source: 'linkedin',
  external_id: 'ext-1',
  url: 'https://example.com/1',
  title: 'Engineer',
  company: 'Acme',
  location: 'Madrid',
  description_md: '## Job',
  raw_snapshot: null,
  match_score: 0.9,
  match_reason: 'Good fit',
  status: 'shortlisted' as const,
  fetched_at: Date.now(),
};

beforeEach(() => {
  db = new Database(':memory:');
  setupSchema(db);
});

afterEach(() => {
  db.close();
});

describe('jobs UNIQUE(source, external_id)', () => {
  it('allows inserting a job', () => {
    const stmt = db.prepare(
      'INSERT INTO jobs (id, source, external_id, url, title, company, location, description_md, raw_snapshot, match_score, match_reason, status, fetched_at) VALUES (@id, @source, @external_id, @url, @title, @company, @location, @description_md, @raw_snapshot, @match_score, @match_reason, @status, @fetched_at)'
    );
    const info = stmt.run(baseJob);
    expect(info.changes).toBe(1);
  });

  it('rejects duplicate (source, external_id)', () => {
    const stmt = db.prepare(
      'INSERT INTO jobs (id, source, external_id, url, title, company, location, description_md, raw_snapshot, match_score, match_reason, status, fetched_at) VALUES (@id, @source, @external_id, @url, @title, @company, @location, @description_md, @raw_snapshot, @match_score, @match_reason, @status, @fetched_at)'
    );
    stmt.run(baseJob);
    expect(() => stmt.run({ ...baseJob, id: 'job-2' })).toThrow();
  });

  it('allows same external_id with different source', () => {
    const stmt = db.prepare(
      'INSERT INTO jobs (id, source, external_id, url, title, company, location, description_md, raw_snapshot, match_score, match_reason, status, fetched_at) VALUES (@id, @source, @external_id, @url, @title, @company, @location, @description_md, @raw_snapshot, @match_score, @match_reason, @status, @fetched_at)'
    );
    stmt.run(baseJob);
    expect(() => stmt.run({ ...baseJob, id: 'job-2', source: 'indeed' })).not.toThrow();
  });
});

describe('jobs status transitions', () => {
  it('rejects invalid status', () => {
    const stmt = db.prepare(
      "INSERT INTO jobs (id, source, external_id, url, title, company, location, description_md, raw_snapshot, match_score, match_reason, status, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    expect(() => stmt.run('j3', 'linkedin', 'ext-3', 'u', 't', 'c', 'l', 'd', null, 0.5, 'r', 'unknown', Date.now())).toThrow();
  });

  it('allows updating to valid statuses', () => {
    const insert = db.prepare(
      'INSERT INTO jobs (id, source, external_id, url, title, company, location, description_md, raw_snapshot, match_score, match_reason, status, fetched_at) VALUES (@id, @source, @external_id, @url, @title, @company, @location, @description_md, @raw_snapshot, @match_score, @match_reason, @status, @fetched_at)'
    );
    insert.run(baseJob);
    const update = db.prepare('UPDATE jobs SET status = ? WHERE id = ?');
    for (const s of ['new', 'applied', 'discarded'] as const) {
      expect(() => update.run(s, baseJob.id)).not.toThrow();
    }
  });
});

describe('generations feedback_rating check', () => {
  it('rejects rating outside 1..5', () => {
    const insert = db.prepare(
      'INSERT INTO jobs (id, source, external_id, url, title, company, location, description_md, raw_snapshot, match_score, match_reason, status, fetched_at) VALUES (@id, @source, @external_id, @url, @title, @company, @location, @description_md, @raw_snapshot, @match_score, @match_reason, @status, @fetched_at)'
    );
    insert.run(baseJob);
    const genInsert = db.prepare(
      'INSERT INTO generations (id, job_id, profile_hash, cv_path, cover_path, bullets_json, cover_paragraphs_json, created_at, parent_generation_id, feedback_rating, feedback_comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    expect(() => genInsert.run('g1', 'job-1', 'abc', '/cv', '/cover', '[]', '[]', Date.now(), null, 0, null)).toThrow();
    expect(() => genInsert.run('g2', 'job-1', 'abc', '/cv', '/cover', '[]', '[]', Date.now(), null, 6, null)).toThrow();
  });

  it('accepts rating in 1..5', () => {
    const insert = db.prepare(
      'INSERT INTO jobs (id, source, external_id, url, title, company, location, description_md, raw_snapshot, match_score, match_reason, status, fetched_at) VALUES (@id, @source, @external_id, @url, @title, @company, @location, @description_md, @raw_snapshot, @match_score, @match_reason, @status, @fetched_at)'
    );
    insert.run(baseJob);
    const genInsert = db.prepare(
      'INSERT INTO generations (id, job_id, profile_hash, cv_path, cover_path, bullets_json, cover_paragraphs_json, created_at, parent_generation_id, feedback_rating, feedback_comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    // Root generation
    genInsert.run('g0', 'job-1', 'abc', '/cv', '/cover', '[]', '[]', Date.now(), null, null, null);
    // Child with rating
    expect(() => genInsert.run('g1', 'job-1', 'abc', '/cv2', '/cover2', '[]', '[]', Date.now(), 'g0', 3, 'good')).not.toThrow();
  });
});
