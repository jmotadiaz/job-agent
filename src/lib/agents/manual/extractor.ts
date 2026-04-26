import { createDeepInfra } from "@ai-sdk/deepinfra";
import { generateText } from "ai";
import {
  openUrl,
  waitLoad,
  snapshot,
  getText,
  runAgentBrowser,
  closeSession,
} from "@/lib/agent-browser/exec";
import { log } from "@/lib/utils/log";
import { dump } from "@/lib/utils/dump";

const MODULE = "manual/extractor";
const LLM_MODEL = "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo";

export interface ExtractedJob {
  title: string;
  company: string;
  location: string;
  description_md: string;
  raw_text: string;
}

export async function extractJobFromUrl(url: string): Promise<ExtractedJob> {
  const session = `manual-${Date.now()}`;
  log.info(MODULE, "begin", { url, session });

  try {
    await openUrl(url, session);
    await waitLoad(session);

    // Dismiss login walls and cookie banners
    try {
      const snap = await snapshot({ interactive: true }, session);
      const snapText = (snap.data as { snapshot?: string })?.snapshot ?? "";

      const dismissPatterns = [
        /- button "Dismiss" \[ref=([^\]]+)\]/,
        /- button "Cerrar" \[ref=([^\]]+)\]/,
        /- button "Close" \[ref=([^\]]+)\]/,
      ];
      for (const pattern of dismissPatterns) {
        const m = snapText.match(pattern);
        if (m) {
          await runAgentBrowser(["click", `@${m[1]}`], session);
          await runAgentBrowser(["wait", "1500"], session);
          break;
        }
      }

      const cookiePatterns = [
        /- button "Accept" \[ref=([^\]]+)\]/,
        /- button "Aceptar" \[ref=([^\]]+)\]/,
        /- button "Accept all" \[ref=([^\]]+)\]/i,
      ];
      for (const pattern of cookiePatterns) {
        const m = snapText.match(pattern);
        if (m) {
          await runAgentBrowser(["click", `@${m[1]}`], session);
          await runAgentBrowser(["wait", "1500"], session);
          break;
        }
      }
    } catch (e) {
      log.warn(MODULE, "dismiss overlay failed", {
        message: e instanceof Error ? e.message : String(e),
      });
    }

    const rawText =
      (await getText(".description__text", session)) ||
      (await getText('[class*="description"]', session)) ||
      (await getText("main", session));

    if (rawText.length < 50) {
      throw new Error(
        "Could not extract job description — page may require login or is unsupported",
      );
    }

    log.info(MODULE, "raw text extracted", { length: rawText.length });

    const deepinfra = createDeepInfra({
      apiKey: process.env.DEEPINFRA_API_KEY!,
    });
    const { text: description_md } = await generateText({
      model: deepinfra(LLM_MODEL),
      messages: [
        {
          role: "user",
          content: `Extract the following fields from this job description. Be concise and literal — do not infer or invent. If a field is not mentioned, write "Not specified". Return each field as a markdown list item exactly as shown below.

- Role: [job title]
- Company: [company name]
- Location: [city/country and whether remote/hybrid/onsite]
- Remote: [yes / no / hybrid]
- Contract: [full-time / part-time / contract / freelance]
- Experience required: [minimum years]
- Role type: [frontend / backend / fullstack / other]
- Primary tech (required): [main languages, frameworks, tools explicitly required]
- Secondary tech (nice-to-have): [technologies listed as optional or bonus]
- Key responsibilities: [2-3 short phrases separated by semicolons]
- Salary: [salary range or compensation if mentioned, otherwise "Not specified"]
- Hard blockers: [location restrictions, mandatory languages, specific niche tech with no alternative]

Job description:
${rawText.slice(0, 8000)}`,
        },
      ],
      maxOutputTokens: 512,
    });

    // Parse title/company/location from the LLM output
    const parse = (field: string) => {
      const m = description_md.match(
        new RegExp(`^- ${field}:\\s*([^\\n]+)`, "m"),
      );
      const v = m?.[1]?.trim() ?? "";
      return v === "Not specified" || v === "" ? "" : v;
    };

    const title = parse("Role");
    const company = parse("Company");
    const location = parse("Location");

    log.info(MODULE, "end", { title, company, location });
    dump("extracted", { rawText });
    return { title, company, location, description_md, raw_text: rawText };
  } finally {
    await closeSession(session);
  }
}
