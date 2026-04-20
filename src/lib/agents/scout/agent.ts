import { ToolLoopAgent, isLoopFinished } from 'ai';
import { createDeepInfra } from '@ai-sdk/deepinfra';
import { makeScoutTools, type ScoutRunContext } from './tools';
import { log } from '@/lib/log';
import type { SearchConfig } from '@/lib/profile/parse';

export const SCOUT_MAX_CANDIDATES = 5;

const INSTRUCTIONS = `Eres un agente especializado en búsqueda de empleo. Tu tarea es encontrar UNA oferta que encaje bien con el perfil del usuario en LinkedIn.

## Flujo esperado
1. Llama a \`openSearch\` con la query derivada del perfil para abrir los resultados de LinkedIn.
2. Llama a \`listVisibleJobs\` para obtener las ofertas visibles (ya filtradas por las no vistas).
3. Para cada candidato prometedor (máximo ${SCOUT_MAX_CANDIDATES} en total):
   a. Llama a \`fetchJobDetail\` con la URL de la oferta.
   b. Analiza el resumen recibido contra el perfil del usuario.
   c. Si encaja bien: llama a \`saveCurrentJob\` con un score (0-1) y razón. La búsqueda termina.
   d. Si no encaja: continúa con el siguiente candidato.
4. Si revisaste todos los candidatos disponibles sin encontrar match: llama a \`noMatch\` explicando por qué.

## Criterio de match
Una oferta encaja si cumple mayoritariamente con las habilidades, nivel de experiencia y preferencias de ubicación/remoto del perfil. No busques la perfección — un buen match parcial vale más que ningún match.

## Importante
- Puedes rendirte con \`noMatch\` en cualquier momento si los candidatos son claramente inadecuados.
- Siempre termina con \`saveCurrentJob\` o \`noMatch\` — nunca dejes la búsqueda sin resolución.
- No inventes datos sobre las ofertas.`;

export function createScoutAgent(search: SearchConfig) {
  const deepinfra = createDeepInfra({ apiKey: process.env.DEEPINFRA_API_KEY! });

  const ctx: ScoutRunContext = {
    search,
    lastSummary: null,
    lastRawText: null,
    candidateCount: 0,
    noMatchCalled: false,
    saveMatchCalled: false,
    matchResult: null,
  };

  const tools = makeScoutTools(ctx);

  const agent = new ToolLoopAgent({
    model: deepinfra('moonshotai/Kimi-K2.5'),
    instructions: INSTRUCTIONS,
    tools,
    stopWhen: (state) => {
      // Stop when terminal tool was called
      if (ctx.saveMatchCalled || ctx.noMatchCalled) return true;
      // Stop when max candidates reached (force noMatch on next loop)
      if (ctx.candidateCount >= SCOUT_MAX_CANDIDATES) {
        log.warn('scout/runtime', 'max-candidates reached', { count: ctx.candidateCount, max: SCOUT_MAX_CANDIDATES });
        return true;
      }
      // Fall back to isLoopFinished behavior
      return isLoopFinished()(state);
    },
  });

  return { agent, ctx };
}
