import { log } from "@/lib/utils/log";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { PROFILE_PATH } = await import("@/lib/profile/load");
    const { migrate } = await import("./lib/db/migrate");

    const GENERATED_PDFS_DIR = path.join(process.cwd(), "generated-pdfs");

    // Ensure generated-pdfs dir exists
    if (!fs.existsSync(GENERATED_PDFS_DIR)) {
      fs.mkdirSync(GENERATED_PDFS_DIR, { recursive: true });
    }
    log.info("fs", "generated-pdfs dir ensured", { path: GENERATED_PDFS_DIR });

    // Check profile
    if (fs.existsSync(PROFILE_PATH)) {
      log.info("profile", "detected", { path: PROFILE_PATH });
    } else {
      log.warn("profile", "missing", { path: PROFILE_PATH });
    }

    migrate();
  }
}
