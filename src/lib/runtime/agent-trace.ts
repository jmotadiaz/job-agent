import "server-only";
import * as fs from "node:fs";
import * as path from "node:path";
import { getCurrentRunContext } from "./run-context";

export interface AgentStepRecord {
  ts: string;
  step: number;
  messages: string;
  toolCalls: Array<{ name: string; args: unknown }>;
  toolResults: Array<{ name: string; output: unknown }>;
  finishReason: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export function appendAgentStep(
  step: number,
  data: {
    text?: string;
    toolCalls?: Array<{ toolName: string; input: unknown }>;
    toolResults?: Array<{ toolName: string; output: unknown }>;
    finishReason: string;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  },
): void {
  const ctx = getCurrentRunContext();
  if (!ctx?.persistLogs) return;

  const record: AgentStepRecord = {
    ts: new Date().toISOString(),
    step,
    messages: data.text ?? "",
    toolCalls: (data.toolCalls ?? []).map((tc) => ({
      name: tc.toolName,
      args: tc.input,
    })),
    toolResults: (data.toolResults ?? []).map((tr) => ({
      name: tr.toolName,
      output: tr.output,
    })),
    finishReason: data.finishReason,
    usage: data.usage,
  };

  try {
    const tracePath = path.join(ctx.runDir, "agent-trace.jsonl");
    fs.appendFileSync(tracePath, JSON.stringify(record) + "\n");
  } catch {
    // Don't let filesystem errors break the agent
  }
}
