import { execFile, execSync } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { platform, arch } from "node:os";
import fs from "node:fs";
import { log } from "@/lib/utils/log";
import { dump } from "@/lib/utils/dump";

const execFileAsync = promisify(execFile);
const MODULE = "agent-browser/exec";

interface AgentBrowserCommand {
  command: string;
  args: string[];
}

function resolveAgentBrowserCommand(): AgentBrowserCommand {
  const cwd = process.cwd();
  
  // Strategy 1: Try direct platform-specific native binary from node_modules/agent-browser/bin
  try {
    const osName = platform();
    const cpuArch = arch();
    
    let osKey: string | null = null;
    if (osName === "darwin") {
      osKey = "darwin";
    } else if (osName === "linux") {
      // Check for musl libc (e.g. Alpine Linux)
      let isMusl = false;
      try {
        if (typeof execSync === "function") {
          const result = execSync("ldd --version 2>&1 || true", { encoding: "utf8" });
          isMusl = result.toLowerCase().includes("musl");
        } else {
          isMusl = fs.existsSync("/lib/ld-musl-x86_64.so.1") || fs.existsSync("/lib/ld-musl-aarch64.so.1");
        }
      } catch {
        isMusl = fs.existsSync("/lib/ld-musl-x86_64.so.1") || fs.existsSync("/lib/ld-musl-aarch64.so.1");
      }
      osKey = isMusl ? "linux-musl" : "linux";
    } else if (osName === "win32") {
      osKey = "win32";
    }

    let archKey: string | null = null;
    if (cpuArch === "x64" || cpuArch === "x86_64") {
      archKey = "x64";
    } else if (cpuArch === "arm64" || cpuArch === "aarch64") {
      archKey = "arm64";
    }

    if (osKey && archKey) {
      const ext = osName === "win32" ? ".exe" : "";
      const binaryName = `agent-browser-${osKey}-${archKey}${ext}`;
      const nativePath = path.resolve(/*turbopackIgnore: true*/ cwd, "node_modules/agent-browser/bin", binaryName);
      
      if (fs.existsSync(nativePath)) {
        // Ensure execution permission on Unix-like systems
        if (osName !== "win32") {
          try {
            fs.accessSync(nativePath, fs.constants.X_OK);
          } catch {
            fs.chmodSync(nativePath, 0o755);
          }
        }
        return { command: nativePath, args: [] };
      }
    }
  } catch (err) {
    log.warn(MODULE, "failed resolving native binary", { error: String(err) });
  }

  throw new Error(
    `agent-browser native binary not found for ${platform()}-${arch()}. ` +
    `Ensure agent-browser is installed (npm install agent-browser) and ` +
    `the native binary exists in node_modules/agent-browser/bin/.`,
  );
}

async function runDoctor(): Promise<void> {
  try {
    const cmdInfo = resolveAgentBrowserCommand();
    await execFileAsync(cmdInfo.command, [...cmdInfo.args, "doctor", "--fix"], {
      timeout: 15_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    log.info(MODULE, "doctor completed");
  } catch (err) {
    log.warn(MODULE, "doctor failed", { error: String(err) });
  }
}

const DISMISS_PATTERNS = [
  /- button "Dismiss" \[ref=([^\]]+)\]/,
  /- button "Descartar" \[ref=([^\]]+)\]/,
  /- button "Cerrar" \[ref=([^\]]+)\]/,
  /- button "Close" \[ref=([^\]]+)\]/,
];

const COOKIE_PATTERNS = [
  /- button "Accept" \[ref=([^\]]+)\]/,
  /- button "Aceptar" \[ref=([^\]]+)\]/,
  /- button "Accept all" \[ref=([^\]]+)\]/i,
];

export interface AgentBrowserResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export async function runAgentBrowser(
  args: string[],
  session?: string,
  timeoutMs?: number,
): Promise<AgentBrowserResult> {
  const allArgs = [...(session ? ["--session", session] : []), ...args, "--json"];
  // Redact any auth tokens that might appear in URLs
  const safeArgs = allArgs.map((a) =>
    a.startsWith("http") ? a.split("?")[0] : a,
  );
  const t0 = Date.now();
  log.info(MODULE, "exec begin", { args: safeArgs });

  let stdout = "";
  let stderr = "";

  try {
    const cmdInfo = resolveAgentBrowserCommand();
    const cmdArgs = [...cmdInfo.args, ...allArgs];
    const result = await execFileAsync(cmdInfo.command, cmdArgs, {
      timeout: timeoutMs ?? 30_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err: unknown) {
    const cmdInfo = resolveAgentBrowserCommand();
    const cmdArgs = [...cmdInfo.args, ...allArgs];
    const e = err as {
      stdout?: string;
      stderr?: string;
      message?: string;
      code?: number | string;
    };

    // Auto-heal: empty stderr + exit code 1 suggests stale daemon files.
    // Run doctor --fix to clean up and retry once.
    let autoHealed = false;
    const stderrTrimmed = (e.stderr ?? "").trim();
    if ((e.code === 1 || e.code === "1") && stderrTrimmed.length === 0) {
      log.warn(MODULE, "exec failed (empty stderr, exit=1), running doctor --fix and retrying", {
        exitCode: e.code,
        duration: Date.now() - t0,
      });
      await runDoctor();
      try {
        const retryResult = await execFileAsync(cmdInfo.command, cmdArgs, {
          timeout: timeoutMs ?? 30_000,
          maxBuffer: 10 * 1024 * 1024,
        });
        stdout = retryResult.stdout;
        stderr = retryResult.stderr;
        autoHealed = true;
        log.info(MODULE, "exec retry succeeded after doctor --fix");
      } catch {
        log.warn(MODULE, "exec retry also failed after doctor --fix");
      }
    }

    if (!autoHealed) {
      // Gather deep diagnostics to pinpoint path, environment, permission, or executable issues
      let exists = false;
      let executable = false;
      try {
        exists = fs.existsSync(cmdInfo.command);
        if (exists) {
          fs.accessSync(cmdInfo.command, fs.constants.X_OK);
          executable = true;
        }
      } catch {}

      log.error(MODULE, "exec error", {
        resolvedCommand: cmdInfo.command,
        commandArgs: cmdArgs,
        exists,
        executable,
        exitCode: e.code ?? -1,
        stderr: (e.stderr ?? "").slice(0, 500),
        message: e.message,
        duration: Date.now() - t0,
        envPath: process.env.PATH ?? "",
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

export async function waitForSelector(selector: string, session?: string, timeoutMs?: number): Promise<void> {
  await runAgentBrowser(["wait", selector], session, timeoutMs);
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

export async function scrollDown(px: number, session?: string): Promise<void> {
  await runAgentBrowser(["scroll", "down", String(px)], session);
}

export async function waitMs(ms: number, session?: string): Promise<void> {
  await runAgentBrowser(["wait", String(ms)], session);
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

interface SnapshotData {
  snapshot?: string;
  refs?: Record<string, { role: string; name?: string; url?: string }>;
}

export async function dismissBlockingOverlays(
  session?: string,
): Promise<void> {
  log.info(MODULE, "dismiss-attempt", { session });

  let snapData: SnapshotData | undefined;
  try {
    const snap = await snapshot({ interactive: true }, session);
    snapData = snap.data as SnapshotData | undefined;
  } catch {
    return;
  }

  const snapText = snapData?.snapshot ?? "";

  const clicks: { kind: string; ref: string; pattern: string }[] = [];

  // Try login wall dismiss patterns
  for (const pattern of DISMISS_PATTERNS) {
    const m = snapText.match(pattern);
    if (m) {
      clicks.push({ kind: "login-wall", ref: m[1], pattern: pattern.source });
      break;
    }
  }

  // Try cookie banner patterns on the same snapshot
  for (const pattern of COOKIE_PATTERNS) {
    const m = snapText.match(pattern);
    if (m) {
      clicks.push({
        kind: "cookie-banner",
        ref: m[1],
        pattern: pattern.source,
      });
      break;
    }
  }

  // Execute all clicks, then wait for the overlay to animate away
  for (const click of clicks) {
    log.info(MODULE, "dismiss-hit", {
      kind: click.kind,
      pattern: click.pattern,
      ref: click.ref,
    });
    await runAgentBrowser(["click", `@${click.ref}`], session);
  }

  if (clicks.length > 0) {
    await runAgentBrowser(["wait", "1500"], session);

    // Take a second snapshot to verify overlay disappearance
    try {
      const snap2 = await snapshot({ interactive: true }, session);
      const snap2Text = (snap2.data as SnapshotData)?.snapshot ?? "";

      // Only verify the specific buttons we clicked are gone, not all known patterns
      // (e.g., clicking a login-wall dismiss should not fail because a cookie banner is still present)
      const stillPresent = clicks.some((click) => {
        const refPattern = new RegExp(`\\[ref=${click.ref}\\]`);
        return refPattern.test(snap2Text);
      });

      if (stillPresent) {
        const artifactName = dump("dismiss_miss", {
          snapshot: snap2Text,
        });
        log.warn(MODULE, "dismiss-miss", {
          overlay: "clicked element still present after click + 1500ms wait",
          snapshotArtifact: artifactName,
        });
      } else {
        log.info(MODULE, "dismiss-ok", { clicks: clicks.length });
      }
    } catch {
      log.info(MODULE, "dismiss-ok", {
        clicks: clicks.length,
        note: "second snapshot failed, assuming dismiss worked",
      });
    }
  }
}
