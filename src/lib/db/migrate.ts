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
      skills_json TEXT NOT NULL DEFAULT '[]',
      cover_paragraphs_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      parent_generation_id TEXT NULL REFERENCES generations(id),
      feedback_rating INTEGER NULL CHECK (feedback_rating BETWEEN 1 AND 5),
      feedback_comment TEXT NULL
    );
  `);

  // Additive column migrations — safe to run on existing DBs
  const columns = db
    .prepare("PRAGMA table_info(generations)")
    .all() as Array<{ name: string }>;
  const colNames = new Set(columns.map((c) => c.name));

  if (!colNames.has("skills_json")) {
    db.exec(`ALTER TABLE generations ADD COLUMN skills_json TEXT NOT NULL DEFAULT '[]'`);
    log.info("db", "migrate: added generations.skills_json");
  }

  if (!colNames.has("rationale_json")) {
    db.exec(`ALTER TABLE generations ADD COLUMN rationale_json TEXT NULL`);
    log.info("db", "migrate: added generations.rationale_json");
  }

  log.info("db", "migrate end", { tables: ["jobs", "generations"] });
}
