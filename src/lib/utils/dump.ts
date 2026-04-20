import "server-only";
import * as fs from "node:fs";
import * as path from "node:path";
import { log } from "./log";

const DUMP_DIR = path.join(process.cwd(), "log");

/**
 * Dumps content to a JSON file in the /log directory.
 * This is a server-only utility using Node.js filesystem.
 */
export function dump(label: string, content: unknown): void {
  try {
    if (!fs.existsSync(DUMP_DIR)) {
      fs.mkdirSync(DUMP_DIR, { recursive: true });
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = path.join(DUMP_DIR, `${ts}_${label}.json`);
    fs.writeFileSync(filename, JSON.stringify(content, null, 2), "utf8");

    log.info("fs", "dump written", { file: filename });
  } catch (e) {
    log.warn("fs", "dump failed", { message: String(e) });
  }
}
