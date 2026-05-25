import { nanoid } from "nanoid";
import { getDb } from "./client";
import { log } from "@/lib/utils/log";

export interface JobChat {
  id: string;
  job_id: string;
  title: string | null;
  agent_role: string;
  system_prompt_hash: string | null;
  created_at: number;
  updated_at: number;
}

export interface ChatMessage {
  id: string;
  chat_id: string;
  role: "user" | "assistant" | "system";
  parts: string;
  serial: number;
  created_at: number;
}

export function createChat(jobId: string, title?: string): JobChat {
  const db = getDb();
  const id = nanoid();
  const now = Date.now();
  db.prepare(
    `INSERT INTO job_chats (id, job_id, title, agent_role, created_at, updated_at)
     VALUES (?, ?, ?, 'job_advisor', ?, ?)`,
  ).run(id, jobId, title ?? null, now, now);
  log.info("db", "job_chats createChat", { id, job_id: jobId });
  return { id, job_id: jobId, title: title ?? null, agent_role: "job_advisor", system_prompt_hash: null, created_at: now, updated_at: now };
}

export function getChatsForJob(jobId: string): JobChat[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM job_chats WHERE job_id = ? ORDER BY updated_at DESC")
    .all(jobId) as JobChat[];
}

export function getLatestChatForJob(jobId: string): JobChat | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM job_chats WHERE job_id = ? ORDER BY updated_at DESC LIMIT 1")
    .get(jobId) as JobChat | undefined;
}

export function getChatById(id: string): JobChat | undefined {
  const db = getDb();
  const chat = db.prepare("SELECT * FROM job_chats WHERE id = ?").get(id) as JobChat | undefined;
  if (!chat) {
    log.warn("db", "getChatById: not found", { id });
  }
  return chat;
}

export function updateChatTimestamp(chatId: string): void {
  const db = getDb();
  db.prepare("UPDATE job_chats SET updated_at = ? WHERE id = ?").run(Date.now(), chatId);
}

export function updateChatTitle(chatId: string, title: string): void {
  const db = getDb();
  db.prepare("UPDATE job_chats SET title = ?, updated_at = ? WHERE id = ?").run(title, Date.now(), chatId);
}

export function deleteChat(chatId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM job_chats WHERE id = ?").run(chatId);
  log.info("db", "job_chats deleteChat", { id: chatId });
}

export function getMessagesForChat(chatId: string): ChatMessage[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY serial ASC")
    .all(chatId) as ChatMessage[];
}

export function insertMessage(
  chatId: string,
  role: ChatMessage["role"],
  parts: string,
): ChatMessage {
  const db = getDb();
  const id = nanoid();
  const now = Date.now();
  const row = db
    .prepare(
      "SELECT COALESCE(MAX(serial), 0) + 1 AS next_serial FROM chat_messages WHERE chat_id = ?",
    )
    .get(chatId) as { next_serial: number };
  const serial = row.next_serial;
  db.prepare(
    `INSERT INTO chat_messages (id, chat_id, role, parts, serial, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, chatId, role, parts, serial, now);
  updateChatTimestamp(chatId);
  return { id, chat_id: chatId, role, parts, serial, created_at: now };
}

export function getLastMessageSerial(chatId: string): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COALESCE(MAX(serial), 0) AS max_serial FROM chat_messages WHERE chat_id = ?")
    .get(chatId) as { max_serial: number };
  return row.max_serial;
}
