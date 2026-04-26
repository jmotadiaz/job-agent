import { tool } from "ai";
import { z } from "zod";
import { log } from "@/lib/utils/log";
import type { ScoutRunContext } from "../types";

const MODULE = "scout/tool";

export function makeNoMatchTool(ctx: ScoutRunContext) {
  return tool({
    description:
      "End the search without persisting any offer. Call when no candidate fits the profile.",
    inputSchema: z.object({
      reason: z.string().describe("Reason why no offer fit"),
    }),
    execute: async ({ reason }) => {
      log.info(MODULE, "noMatch begin", { reason });
      ctx.noMatchCalled = true;
      log.info(MODULE, "noMatch end", { reason });
      return { ok: true, reason };
    },
  });
}
