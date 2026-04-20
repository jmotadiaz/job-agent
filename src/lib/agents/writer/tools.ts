import { tool } from 'ai';
import { z } from 'zod';
import { log } from '@/lib/log';

const MODULE = 'writer/tool';

export interface WriterRunContext {
  bullets: Array<{ bulletId: string; renderedText: string }> | null;
  coverParagraphs: string[] | null;
  finalized: boolean;
  availableBulletIds: Set<string>;
}

export function makeWriterTools(ctx: WriterRunContext) {
  return {
    selectBullets: tool({
      description:
        'Selecciona y ordena los bullets del perfil para el CV, adaptando la redacción de cada uno al puesto. Los bulletId deben pertenecer al catálogo entregado por el prompt. No introducir hechos ausentes del perfil.',
      inputSchema: z.object({
        items: z
          .array(
            z.object({
              bulletId: z.string().describe('ID del bullet del catálogo del perfil'),
              renderedText: z
                .string()
                .describe('Redacción adaptada del bullet para este puesto'),
            }),
          )
          .min(1),
      }),
      execute: async ({ items }) => {
        log.info(MODULE, 'selectBullets begin', { count: items.length, ids: items.map(i => i.bulletId) });
        const invalid = items.filter(i => !ctx.availableBulletIds.has(i.bulletId));
        if (invalid.length > 0) {
          log.warn(MODULE, 'selectBullets: invalid bulletIds', { invalid: invalid.map(i => i.bulletId) });
          return {
            error: `BulletIds no válidos: ${invalid.map(i => i.bulletId).join(', ')}. Solo puedes usar los IDs del catálogo.`,
          };
        }
        ctx.bullets = items;
        log.info(MODULE, 'selectBullets end', { selected: items.length });
        return { ok: true, selected: items.length };
      },
    }),

    composeCoverLetter: tool({
      description:
        'Redacta el cuerpo de la carta de presentación como array de párrafos. Cada párrafo apoya en hechos del perfil y de la oferta. No inventar experiencia.',
      inputSchema: z.object({
        paragraphs: z.array(z.string().min(1)).min(2).max(6),
      }),
      execute: async ({ paragraphs }) => {
        const totalChars = paragraphs.join('\n').length;
        log.info(MODULE, 'composeCoverLetter begin', { paragraphCount: paragraphs.length });
        ctx.coverParagraphs = paragraphs;
        log.info(MODULE, 'composeCoverLetter end', { paragraphs: paragraphs.length, chars: totalChars });
        return { ok: true, paragraphs: paragraphs.length, chars: totalChars };
      },
    }),

    finalizeGeneration: tool({
      description:
        'Finaliza la generación del CV y carta. Llamar solo después de selectBullets y composeCoverLetter.',
      inputSchema: z.object({}),
      execute: async () => {
        log.info(MODULE, 'finalizeGeneration begin');
        if (!ctx.bullets) {
          log.warn(MODULE, 'finalizeGeneration: missing bullets');
          return { error: 'Debes llamar selectBullets antes de finalizar.' };
        }
        if (!ctx.coverParagraphs) {
          log.warn(MODULE, 'finalizeGeneration: missing coverParagraphs');
          return { error: 'Debes llamar composeCoverLetter antes de finalizar.' };
        }
        ctx.finalized = true;
        log.info(MODULE, 'finalizeGeneration end', { bulletCount: ctx.bullets.length, paragraphCount: ctx.coverParagraphs.length });
        return { ok: true };
      },
    }),
  };
}
