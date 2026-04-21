import { getDb } from "./client";
import { log } from "@/lib/utils/log";

export interface Generation {
  id: string;
  job_id: string;
  profile_hash: string;
  cv_path: string;
  cover_path: string;
  bullets_json: string;
  skills_json: string;
  cover_paragraphs_json: string;
  created_at: number;
  parent_generation_id: string | null;
  feedback_rating: number | null;
  feedback_comment: string | null;
}

export interface InsertGenerationInput {
  id: string;
  job_id: string;
  profile_hash: string;
  cv_path: string;
  cover_path: string;
  bullets_json: string;
  skills_json: string;
  cover_paragraphs_json: string;
  parent_generation_id?: string | null;
  feedback_rating?: number | null;
  feedback_comment?: string | null;
}

export function insertGeneration(input: InsertGenerationInput): Generation {
  const db = getDb();
  const now = Date.now();
  const row = {
    ...input,
    created_at: now,
    parent_generation_id: input.parent_generation_id ?? null,
    feedback_rating: input.feedback_rating ?? null,
    feedback_comment: input.feedback_comment ?? null,
  };
  try {
    db.prepare(
      `
      INSERT INTO generations (id, job_id, profile_hash, cv_path, cover_path, bullets_json, skills_json, cover_paragraphs_json, created_at, parent_generation_id, feedback_rating, feedback_comment)
      VALUES (@id, @job_id, @profile_hash, @cv_path, @cover_path, @bullets_json, @skills_json, @cover_paragraphs_json, @created_at, @parent_generation_id, @feedback_rating, @feedback_comment)
    `,
    ).run(row);
    log.info("db", "generations insertGeneration", {
      id: row.id,
      job_id: row.job_id,
      parent_generation_id: row.parent_generation_id,
      feedback_rating: row.feedback_rating,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const constraintMatch = msg.match(
      /(?:UNIQUE|FOREIGN KEY|CHECK) constraint failed: ([^\s]+)/,
    );
    if (constraintMatch) {
      log.error("db", "constraint violation", {
        constraint: constraintMatch[1],
        message: msg.split("\n")[0],
      });
    } else {
      log.error("db", "insertGeneration error", { message: msg });
    }
    throw err;
  }
  return row as Generation;
}

export function listGenerationsForJob(job_id: string): Generation[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM generations WHERE job_id = ? ORDER BY created_at ASC",
    )
    .all(job_id) as Generation[];
}

export function getLatestGenerationForJob(
  job_id: string,
): Generation | undefined {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM generations WHERE job_id = ? ORDER BY created_at DESC LIMIT 1",
    )
    .get(job_id) as Generation | undefined;
}

export function getGenerationById(id: string): Generation | undefined {
  const db = getDb();
  const gen = db.prepare("SELECT * FROM generations WHERE id = ?").get(id) as
    | Generation
    | undefined;
  if (!gen) {
    log.warn("db", "getGenerationById: not found", { id });
  }
  return gen;
}
