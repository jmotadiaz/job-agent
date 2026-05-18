import { tool } from "ai";
import { z } from "zod";
import * as fs from "node:fs";
import { log } from "@/lib/utils/log";
import { BLOCKED_COMPANIES_PATH } from "@/lib/runtime/paths";
import type { ScoutRunContext } from "../scout/types";

const MODULE = "scout/tool";

export function makeBlockCompanyTool(_ctx: ScoutRunContext) {
  return tool({
    description:
      "Persist a company to the blocked-companies list when it is identified as an IT consulting firm, body-shop, staffing agency, or otherwise misaligned with the user's profile. Subsequent scout runs will skip offers from this company.",
    inputSchema: z.object({
      company: z.string().describe("Exact company name as shown in the job posting"),
      reason: z.string().describe("Brief reason for blocking (e.g., 'IT consulting / body-shop')"),
    }),
    execute: async ({ company, reason }) => {
      log.info(MODULE, "blockCompany begin", { company, reason });

      try {
        const existing = fs.existsSync(BLOCKED_COMPANIES_PATH)
          ? fs.readFileSync(BLOCKED_COMPANIES_PATH, "utf8")
          : "";

        const normalized = company.toLowerCase().trim();
        const alreadyBlocked = existing
          .toLowerCase()
          .includes(`**${normalized}**`) ||
          existing
            .toLowerCase()
            .includes(`- ${normalized}:`);

        if (alreadyBlocked) {
          log.info(MODULE, "blockCompany: already blocked", { company });
          return { ok: true, company, alreadyBlocked: true };
        }

        const entry = `- **${company}**: ${reason}`;
        const updated = existing.trimEnd() + "\n" + entry + "\n";
        fs.writeFileSync(BLOCKED_COMPANIES_PATH, updated, "utf8");

        log.info(MODULE, "blockCompany end", { company });
        return { ok: true, company, alreadyBlocked: false };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(MODULE, "blockCompany error", { company, message: msg });
        return { error: msg };
      }
    },
  });
}
