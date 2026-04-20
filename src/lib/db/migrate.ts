import { getDb } from "./client";
import { log } from "@/lib/utils/log";

export function migrate(): void {
  log.info("db", "migrate begin");
  const db = getDb();

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

  log.info("db", "migrate end", { tables: ["jobs", "generations"] });
}
