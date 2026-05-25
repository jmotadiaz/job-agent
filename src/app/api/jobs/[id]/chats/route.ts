import { NextRequest, NextResponse } from "next/server";
import { getJobById } from "@/lib/db/jobs";
import { createChat, getChatsForJob } from "@/lib/db/job-chats";
import { log } from "@/lib/utils/log";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: jobId } = await params;
  const job = getJobById(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  const chats = getChatsForJob(jobId);
  return NextResponse.json({ chats });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: jobId } = await params;
  const job = getJobById(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : undefined;

  const chat = createChat(jobId, title);
  log.info("api/chats", "created chat", { chatId: chat.id, jobId });

  return NextResponse.json({ chat }, { status: 201 });
}
