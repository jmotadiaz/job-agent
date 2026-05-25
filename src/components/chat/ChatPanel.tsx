"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  MessageSquare,
  Send,
  Plus,
  Loader2,
} from "lucide-react";
import type { JobChat, ChatMessage as ChatMessageType } from "@/lib/db/job-chats";
import { ChatMessage, StreamingMessage } from "./ChatMessage";

interface ChatPanelProps {
  jobId: string;
}

export function ChatPanel({ jobId }: ChatPanelProps) {
  const [chats, setChats] = useState<JobChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  // Load chats on mount
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/jobs/${jobId}/chats`);
        const data = await res.json();
        if (res.ok && Array.isArray(data.chats)) {
          setChats(data.chats);
          if (data.chats.length > 0) {
            setActiveChatId(data.chats[0].id);
          } else {
            // Auto-create first chat
            const createRes = await fetch(`/api/jobs/${jobId}/chats`, { method: "POST" });
            const createData = await createRes.json();
            if (createRes.ok && createData.chat) {
              setChats([createData.chat]);
              setActiveChatId(createData.chat.id);
            }
          }
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [jobId]);

  const switchChat = useCallback(
    (chatId: string) => {
      abortRef.current?.abort();
      setSending(false);
      setStreamingText("");
      setActiveChatId(chatId);
    },
    [],
  );

  // Load messages when active chat changes
  useEffect(() => {
    if (!activeChatId) return;
    (async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/chats/${activeChatId}/messages`);
        const data = await res.json();
        if (res.ok && Array.isArray(data.messages)) {
          setMessages(data.messages);
          scrollToBottom();
        }
      } catch {
        // ignore
      }
    })();
  }, [activeChatId, jobId, scrollToBottom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, scrollToBottom]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !activeChatId || sending) return;

    // Abort any in-progress stream
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setInput("");
    setSending(true);
    setStreamingText("");

    const tempUserMsg: ChatMessageType = {
      id: "temp-" + Date.now(),
      chat_id: activeChatId,
      role: "user",
      parts: JSON.stringify([{ type: "text", text }]),
      serial: messages.length + 1,
      created_at: Date.now(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    scrollToBottom();

    try {
      const res = await fetch(`/api/jobs/${jobId}/chats/${activeChatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error ?? "Request failed");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (controller.signal.aborted) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setStreamingText(accumulated);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      const errorText = err instanceof Error ? err.message : "Error sending message";
      setMessages((prev) => [
        ...prev,
        {
          id: "err-" + Date.now(),
          chat_id: activeChatId,
          role: "assistant",
          parts: JSON.stringify([{ type: "text", text: `⚠ ${errorText}` }]),
          serial: prev.length + 1,
          created_at: Date.now(),
        },
      ]);
    } finally {
      if (!controller.signal.aborted) {
        setSending(false);
        setStreamingText("");
      }
      // Reload messages to get persisted ones
      try {
        const res = await fetch(`/api/jobs/${jobId}/chats/${activeChatId}/messages`);
        const data = await res.json();
        if (res.ok && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      } catch {
        // ignore
      }
      scrollToBottom();
    }
  }, [input, activeChatId, sending, messages.length, jobId, scrollToBottom]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const createNewChat = useCallback(async () => {
    try {
      const existingNumbers = chats
        .map((c) => {
          const match = c.title?.match(/^Chat (\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter((n) => n > 0);
      const nextNumber = Math.max(0, ...existingNumbers) + 1;
      const title = `Chat ${nextNumber}`;

      const res = await fetch(`/api/jobs/${jobId}/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (res.ok && data.chat) {
        setChats((prev) => [data.chat, ...prev]);
        switchChat(data.chat.id);
      }
    } catch {
      // ignore
    }
  }, [jobId, chats, switchChat]);

  if (loading) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)] text-[13px]">
        <Loader2 size={16} className="inline animate-spin mr-2" />
        Loading chat…
      </div>
    );
  }

  const activeChat = chats.find((c) => c.id === activeChatId);

  return (
    <div className="flex flex-col h-[500px] border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--bg-primary)]">
      {/* Header with chat selector */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-raised)] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare size={14} className="text-[var(--text-muted)] shrink-0" />
          <span className="text-[12px] font-semibold text-[var(--text-primary)] truncate">
            {activeChat?.title || "Chat"}
          </span>
          {chats.length > 1 && (
            <select
              className="text-[11px] bg-[var(--bg-primary)] border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text-secondary)] max-w-[120px]"
              value={activeChatId ?? ""}
              onChange={(e) => switchChat(e.target.value)}
            >
              {chats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || `Chat ${c.id.slice(0, 6)}`}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          className="btn btn-ghost btn-sm !p-1"
          onClick={createNewChat}
          title="New chat"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3"
        style={{ scrollBehavior: "smooth" }}
      >
        {messages.length === 0 && !streamingText && (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-[13px]">
            Ask about this offer — fit, gaps, strategy, interview prep…
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {streamingText && <StreamingMessage text={streamingText} />}
        {sending && !streamingText && (
          <div className="flex justify-start mb-3">
            <div className="px-3 py-2 text-[var(--text-muted)] text-[13px]">
              <Loader2 size={14} className="inline animate-spin" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-[var(--border)] p-3 bg-[var(--bg-raised)] shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this offer…"
            rows={2}
            disabled={sending}
            className="flex-1 resize-none text-[13px]"
          />
          <button
            className="btn btn-primary btn-sm shrink-0"
            onClick={handleSend}
            disabled={!input.trim() || sending}
            title="Send"
          >
            {sending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
