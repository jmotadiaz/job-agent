import "server-only";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  getCurrentRunContext,
  nextSequenceNumber,
} from "@/lib/runtime/run-context";
import { log } from "./log";

/**
 * Dumps content to a JSON file in the active run's artifacts directory.
 * Requires an active RunContext — call inside runWithContext().
 */
export function dump(label: string, content: unknown): string {
  const ctx = getCurrentRunContext();
  if (!ctx) {
    throw new Error(
      "dump() requires an active run context — wrap in runWithContext()",
    );
  }

  const nn = nextSequenceNumber();
  const nnStr = String(nn).padStart(2, "0");
  const filename = `${nnStr}_${label}.json`;
  const filePath = path.join(ctx.runDir, "artifacts", filename);

  fs.writeFileSync(filePath, JSON.stringify(content, null, 2), "utf8");

  log.info("fs", "dump written", { file: filename });
  return filename;
}
