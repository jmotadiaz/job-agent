"use client";

import { Streamdown } from "streamdown";
import type { ChatMessage as ChatMessageType } from "@/lib/db/job-chats";

interface Part {
  type: string;
  text?: string;
}

function extractText(partsJson: string): string {
  try {
    const parts = JSON.parse(partsJson) as Part[];
    return parts
      .filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .join("\n\n");
  } catch {
    return partsJson;
  }
}

export function ChatMessage({ message }: { message: ChatMessageType }) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  if (message.role === "system") return null;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`
          max-w-[85%] px-3.5 py-2.5 rounded-xl text-[13px] leading-relaxed
          ${isUser
            ? "bg-[var(--accent)] text-[var(--accent-foreground)] rounded-br-md"
            : "bg-[var(--bg-raised)] text-[var(--text-primary)] rounded-bl-md border border-[var(--border)]"
          }
        `}
      >
        {isAssistant ? (
          <div className="text-[13px] leading-[1.7] text-[var(--text-secondary)]">
            <Streamdown mode="static">{extractText(message.parts)}</Streamdown>
          </div>
        ) : (
          <p className="m-0 whitespace-pre-wrap">{extractText(message.parts)}</p>
        )}
      </div>
    </div>
  );
}

export function StreamingMessage({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[85%] px-3.5 py-2.5 rounded-xl rounded-bl-md text-[13px] leading-relaxed bg-[var(--bg-raised)] text-[var(--text-primary)] border border-[var(--border)]">
        <div className="text-[13px] leading-[1.7] text-[var(--text-secondary)]">
          <Streamdown mode="static">{text}</Streamdown>
        </div>
      </div>
    </div>
  );
}
