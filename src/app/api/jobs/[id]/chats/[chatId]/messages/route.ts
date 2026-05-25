import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getJobById } from "@/lib/db/jobs";
import { loadProfile } from "@/lib/profile/load";
import { getChatById, getMessagesForChat, insertMessage } from "@/lib/db/job-chats";
import { runAdvisorChat } from "@/lib/agents/advisor/agent";
import { log } from "@/lib/utils/log";

const BodySchema = z.object({
  message: z.string().min(1),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; chatId: string }> },
) {
  const { id: jobId, chatId } = await params;
  const job = getJobById(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  const chat = getChatById(chatId);
  if (!chat || chat.job_id !== jobId) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const messages = getMessagesForChat(chatId);
  return NextResponse.json({ messages });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; chatId: string }> },
) {
  const { id: jobId, chatId } = await params;
  const job = getJobById(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  const chat = getChatById(chatId);
  if (!chat || chat.job_id !== jobId) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const userMessage = parsed.data.message;
  const profileContent = loadProfile();
  const jobDescription = job.raw_snapshot || job.description_md;

  insertMessage(chatId, "user", JSON.stringify([{ type: "text", text: userMessage }]));
  log.info("api/chat/messages", "user message saved", { chatId });

  const previousMessages = getMessagesForChat(chatId);
  const llmMessages = previousMessages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: extractTextFromParts(m.parts),
    }));

  let fullText = "";

  const result = runAdvisorChat({
    jobDescription,
    profileContent,
    messages: llmMessages,
    onFinish({ text }) {
      fullText = text;
      const parts = [{ type: "text", text: fullText }];
      insertMessage(chatId, "assistant", JSON.stringify(parts));
      log.info("api/chat/messages", "assistant message saved", { chatId, length: fullText.length });
    },
  });

  return result.toTextStreamResponse();
}

function extractTextFromParts(partsJson: string): string {
  try {
    const parts = JSON.parse(partsJson) as Array<{ type: string; text?: string }>;
    return parts
      .filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .join("");
  } catch {
    return partsJson;
  }
}
