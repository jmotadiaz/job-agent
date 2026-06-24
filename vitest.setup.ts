import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const testRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), `job-agent-vitest-${process.pid}-`),
);

process.env.JOB_AGENT_LOG_DIR = path.join(testRoot, "log");
process.env.JOB_AGENT_GENERATED_PDFS_DIR = path.join(
  testRoot,
  "generated-pdfs",
);
process.env.JOB_AGENT_DISABLE_RUN_LOGS = "1";

fs.mkdirSync(process.env.JOB_AGENT_LOG_DIR, { recursive: true });
fs.mkdirSync(process.env.JOB_AGENT_GENERATED_PDFS_DIR, { recursive: true });
