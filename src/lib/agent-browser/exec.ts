import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { log } from "@/lib/utils/log";

const execFileAsync = promisify(execFile);
const MODULE = "agent-browser/exec";

export interface AgentBrowserResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export async function runAgentBrowser(
  args: string[],
  session?: string,
): Promise<AgentBrowserResult> {
  const allArgs = [...(session ? ["--session", session] : []), ...args, "--json"];
  // Redact any auth tokens that might appear in URLs
  const safeArgs = allArgs.map((a) =>
    a.startsWith("http") ? a.split("?")[0] : a,
  );
  const t0 = Date.now();
  log.info(MODULE, "exec begin", { args: safeArgs });

  let stdout: string;
  let stderr: string;

  try {
    const result = await execFileAsync("agent-browser", allArgs, {
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err: unknown) {
    const e = err as {
      stdout?: string;
      stderr?: string;
      message?: string;
      code?: number;
    };
    log.error(MODULE, "exec error", {
      args: safeArgs,
      exitCode: e.code ?? -1,
      stderr: (e.stderr ?? "").slice(0, 500),
      message: e.message,
      duration: Date.now() - t0,
    });
    const raw = e.stdout ?? "";
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.success) {
        throw new AgentBrowserError(
          parsed.error ?? "agent-browser command failed",
          allArgs,
          e.stderr ?? "",
        );
      }
      return parsed;
    } catch {
      throw new AgentBrowserError(
        e.message ?? "agent-browser command failed",
        allArgs,
        e.stderr ?? "",
      );
    }
  }

  const duration = Date.now() - t0;

  try {
    const parsed = JSON.parse(stdout);
    if (!parsed.success) {
      log.warn(MODULE, "exec: success=false", {
        args: safeArgs,
        error: parsed.error,
        duration,
      });
      throw new AgentBrowserError(
        parsed.error ?? "agent-browser returned success=false",
        allArgs,
        stderr,
      );
    }
    log.info(MODULE, "exec end", { args: safeArgs, duration });
    return parsed;
  } catch (parseErr) {
    if (parseErr instanceof AgentBrowserError) throw parseErr;
    log.error(MODULE, "exec parse error", {
      args: safeArgs,
      stdout: stdout.slice(0, 200),
      duration,
    });
    throw new AgentBrowserError(
      `Failed to parse agent-browser output: ${stdout}`,
      allArgs,
      stderr,
    );
  }
}

export class AgentBrowserError extends Error {
  constructor(
    message: string,
    public readonly args: string[],
    public readonly stderr: string,
  ) {
    super(message);
    this.name = "AgentBrowserError";
  }
}

export async function openUrl(url: string, session?: string): Promise<void> {
  await runAgentBrowser(["open", url], session);
}

export async function waitLoad(session?: string): Promise<void> {
  await runAgentBrowser(["wait", "--load", "networkidle"], session);
}

export async function snapshot(
  opts?: { selector?: string; interactive?: boolean; urls?: boolean },
  session?: string,
): Promise<AgentBrowserResult> {
  const args: string[] = ["snapshot"];
  if (opts?.interactive) args.push("-i");
  if (opts?.urls) args.push("-u");
  if (opts?.selector) args.push("-s", opts.selector);
  return runAgentBrowser(args, session);
}

export async function getText(selector: string, session?: string): Promise<string> {
  const result = await runAgentBrowser(["get", "text", selector], session);
  const data = result.data as { text?: string } | undefined;
  return data?.text ?? "";
}

export async function getUrl(session?: string): Promise<string> {
  const result = await runAgentBrowser(["get", "url"], session);
  const data = result.data as { url?: string } | undefined;
  return data?.url ?? "";
}

export async function closeSession(session: string): Promise<void> {
  try {
    await runAgentBrowser(["close"], session);
  } catch {
    // ignore if already closed
  }
}

let _browserClosed = false;

export async function closeBrowser(): Promise<void> {
  if (_browserClosed) return;
  try {
    await runAgentBrowser(["close"]);
  } catch {
    // idempotent — ignore if already closed
  } finally {
    _browserClosed = true;
  }
}

export function resetBrowserState(): void {
  _browserClosed = false;
}
