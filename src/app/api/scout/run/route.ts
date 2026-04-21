import { NextResponse } from "next/server";
import { runScout } from "@/lib/agents/scout/orchestrator";
import { log } from "@/lib/utils/log";

let _running = false;

export async function POST() {
  const start = Date.now();
  log.info("api/scout/run", "begin", { method: "POST" });

  if (_running) {
    log.warn("api/scout/run", "rejected: already running");
    return NextResponse.json(
      {
        kind: "error",
        stage: "mutex",
        message: "Ya hay una búsqueda en curso. Espera a que termine.",
      },
      { status: 409 },
    );
  }

  _running = true;
  try {
    const result = await runScout();
    const duration = Date.now() - start;
    log.info("api/scout/run", "end", { kind: result.kind, duration });
    if (result.kind === "error") {
      return NextResponse.json(result, { status: 502 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    log.error("api/scout/run", "error", { message, stack });
    return NextResponse.json(
      { kind: "error", stage: "unexpected", message },
      { status: 502 },
    );
  } finally {
    _running = false;
  }
}
