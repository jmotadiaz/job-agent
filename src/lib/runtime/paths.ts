import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_NAME = "next-scaffold";

function readPackageName(dir: string): string | null {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return pkg.name ?? null;
  } catch {
    return null;
  }
}

function findProjectRoot(): string {
  // Strategy 1: traverse up from this module's location (most reliable)
  try {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    let dir = moduleDir;
    while (dir !== path.dirname(dir)) {
      const name = readPackageName(dir);
      if (name === PROJECT_NAME) return dir;
      dir = path.dirname(dir);
    }
  } catch {
    // import.meta.url may not be available in all runtimes
  }

  // Strategy 2: traverse up from process.cwd()
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    const name = readPackageName(dir);
    if (name === PROJECT_NAME) return dir;
    dir = path.dirname(dir);
  }

  // Strategy 3: fallback to process.cwd()
  return process.cwd();
}

export const PROJECT_ROOT = findProjectRoot();
export const LOG_DIR = path.join(PROJECT_ROOT, "log");
export const GENERATED_PDFS_DIR = path.join(PROJECT_ROOT, "generated-pdfs");
export const DB_PATH = path.join(PROJECT_ROOT, "data", "job-agent.sqlite");
export const PROFILE_PATH = path.join(PROJECT_ROOT, "profile.md");
