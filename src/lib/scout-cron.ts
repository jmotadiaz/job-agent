import cron from "node-cron";
import { runScout } from "@/lib/agents/scout/orchestrator";
import { log } from "@/lib/utils/log";

let _running = false;

export function startScoutCron() {
  cron.schedule("0 */3 * * *", async () => {
    if (_running) {
      log.warn("scout-cron", "skipped: already running");
      return;
    }

    _running = true;
    const start = Date.now();
    log.info("scout-cron", "triggered");

    try {
      const result = await runScout();
      const duration = Date.now() - start;
      log.info("scout-cron", "completed", { kind: result.kind, duration });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("scout-cron", "error", { message });
    } finally {
      _running = false;
    }
  });

  log.info("scout-cron", "scheduled: every 3 hours");
}
