import { tool } from "ai";
import { z } from "zod";
import { log } from "@/lib/utils/log";
import type { WriterRunContext } from "../types";

const MODULE = "writer/tool";

export function makeComposeRationaleTool(ctx: WriterRunContext) {
  return tool({
    description:
      "Submit a SHORT rationale (en ESPAÑOL, no en ingles) that explains, FOR THIS SPECIFIC GENERATION, the criteria you applied. This is meta-content for the user, NOT for the CV or cover letter. Call this AFTER selectBullets, selectSkills and composeCoverLetter so you can summarize actual decisions made -- not abstract guidance. Be concrete: name the specific bullets / skills / angle you chose and why each fit the offer. Avoid restating the system prompt. 2-4 short sentences per rationale field is ideal.",
    inputSchema: z.object({
      priorityRequirements: z
        .array(z.string().min(1))
        .min(2)
        .max(6)
        .describe(
          "Lista de los 2-6 requisitos prioritarios que extrajiste de la oferta (tecnologias, alcance, seniority, dominio, soft skills). En espanol. Cada item es una frase corta.",
        ),
      bulletsRationale: z
        .string()
        .min(20)
        .describe(
          "Por que elegiste y ordenaste estos bullets concretos para esta oferta: que rol/experiencia recibio mas espacio, que se omitio del catalogo y por que. En espanol, 2-4 frases.",
        ),
      skillsRationale: z
        .string()
        .min(20)
        .describe(
          "Por que estas skills concretas y en este orden: que se prioriza por matching directo con la oferta, que se descarto del catalogo. En espanol, 2-4 frases.",
        ),
      coverLetterRationale: z
        .string()
        .min(20)
        .describe(
          "Que angulo elegiste para la cover letter: cual es el hook, que evidencia se conecta a que requisito, tono. En espanol, 2-4 frases.",
        ),
    }),
    execute: async ({
      priorityRequirements,
      bulletsRationale,
      skillsRationale,
      coverLetterRationale,
    }) => {
      log.info(MODULE, "composeRationale begin", {
        priorityCount: priorityRequirements.length,
        bulletsLen: bulletsRationale.length,
        skillsLen: skillsRationale.length,
        coverLen: coverLetterRationale.length,
      });
      ctx.rationale = {
        priorityRequirements,
        bulletsRationale,
        skillsRationale,
        coverLetterRationale,
      };
      log.info(MODULE, "composeRationale end");
      return { ok: true };
    },
  });
}
