## Context

Hoy la observabilidad del proyecto se reparte entre dos mecanismos:

1. **`src/lib/utils/log.ts`** — emite líneas estructuradas (`[ts] [module] event {payload}`) únicamente a `console.*`. No hay persistencia.
2. **`src/lib/utils/dump.ts`** — escribe a `log/<timestamp>_<label>.json` global, lo que ha producido 130 archivos sueltos sin agrupación por run.

Lo que **no** se captura en absoluto es la traza interna del `ToolLoopAgent`: qué mensajes vio el modelo, qué tool calls emitió con qué argumentos, qué resultados recibió, en qué step terminó. Esa información se pierde al final de la ejecución.

Como consecuencia, cuando el regex de cierre de overlays (`/- button "Dismiss" \[ref=...\]/` y variantes) falla — como pasó con `"Descartar"` en el commit `341d595` — diagnosticarlo es un ejercicio manual de cruzar líneas de consola con dumps por timestamp. Y no hay forma de medir cuántos runs se ven afectados.

La lógica frágil además está duplicada: `openSearch.ts`, `fetchJobDetail.ts` y `manual/extractor.ts` contienen el mismo bloque de ~25 líneas con la misma lista de regex. Cualquier nueva localización requiere tres ediciones idénticas.

## Goals / Non-Goals

**Goals:**
- Eliminar la triplicación de la lógica de cierre de overlays consolidándola en un único helper.
- Capturar para cada ejecución de un agente toda la información necesaria para reconstruir post-hoc qué pasó: eventos del código, traza del modelo, contenido web inspeccionado.
- Hacer que la captura sea totalmente implícita: las funciones existentes (`log.info`, `dump`) no cambian su firma de uso, sólo su destino.
- Habilitar métricas verificables sobre el cierre de overlays (ratio hit/miss) para sustentar con datos la futura decisión de migrar de regex a una micro-decisión LLM.
- Exponer todo lo capturado en el dashboard para inspección humana y para análisis automatizado por un agente revisor.

**Non-Goals:**
- Sustituir aún los regex de cierre de overlays por una llamada LLM. Esta propuesta sólo centraliza e instrumenta; la migración a LLM se decidirá con los datos producidos.
- Introducir un sistema de telemetría externo (OpenTelemetry, Sentry). Todo permanece en filesystem local.
- Política de retención automática. Los runs se acumulan indefinidamente; el usuario decide cuándo limpiar.
- Cifrado o redacción de PII en los archivos. La ejecución es siempre local; el `agent-trace.jsonl` contendrá el `profile.md` del usuario.
- Refactor de los flujos de feedback del Writer ni de la persistencia de jobs en SQLite.

## Decisions

### D1 — Identidad del run: `<ISO>_<nanoid8>`

El `runId` se construye como `2026-05-04T08-15-22Z_h7Kx2Ab` (timestamp ISO con `:` y `.` reemplazados por `-`, separador `_`, nanoid de 8 caracteres). Es ordenable lexicográficamente, único, legible, y diff-friendly en logs y URLs. Se evita UUID puro por legibilidad y no-ordenabilidad. Se evita autoincremental por colisiones entre orquestadores concurrentes.

### D2 — Propagación implícita vía `AsyncLocalStorage`

El `RunContext` se establece en el orquestador (capa más alta) y se lee desde dentro de `log.info`, `dump` y el hook de trace del agente sin pasarse explícitamente como argumento. Patrón estándar de Node 18+ para tracing/scoping (equivalente a OpenTelemetry context o Sentry Hub). Alternativa descartada: threading explícito vía argumento `ctx` — invadiría 30+ funciones, incluido el helper genérico `runAgentBrowser`.

```ts
// src/lib/runtime/run-context.ts
import { AsyncLocalStorage } from "node:async_hooks";

interface RunContext {
  runId: string;
  runDir: string;
  kind: "scout" | "writer" | "manual";
  sequenceCounter: { value: number };  // mutable, used by dump() for NN_
}

const storage = new AsyncLocalStorage<RunContext>();

export function runWithContext<T>(ctx: Omit<RunContext, "sequenceCounter">, fn: () => Promise<T>): Promise<T> {
  return storage.run({ ...ctx, sequenceCounter: { value: 0 } }, fn);
}

export function getCurrentRunContext(): RunContext | undefined {
  return storage.getStore();
}
```

### D3 — Estructura en disco

```
log/
├── <runId>/
│   ├── meta.json              metadatos del run (kind, input, outcome, duration)
│   ├── timeline.jsonl         eventos log.info/warn/error
│   ├── agent-trace.jsonl      mensajes/tool-calls/tool-results del modelo
│   ├── review.md              (si se solicita revisión) informe del agente revisor
│   └── artifacts/
│       ├── 01_openSearch.snapshot.json
│       ├── 02_dismiss_miss.snapshot.json   ← evidencia de fallo
│       ├── 03_listVisibleJobs.snapshot.json
│       └── 04_fetchJobDetail_4012398.json
└── <runId-anterior>/
    └── ...
```

Nada vive en `log/` raíz salvo carpetas de runs. Los 130 archivos sueltos actuales se eliminarán como parte de la migración (no es código, es debris de desarrollo).

### D4 — JSONL, no JSON

`timeline.jsonl` y `agent-trace.jsonl` son append-only line-delimited JSON. Razones:
- Sobrevive a crashes a media ejecución sin corrupción del archivo.
- Permite `tail -f` mientras el agente corre.
- `jq -c`, `grep` y `wc -l` funcionan natively.
- Append concurrente seguro a nivel POSIX para escrituras < `PIPE_BUF` (~4 KB), que cubre todos nuestros eventos.

`meta.json` y `review.md` se escriben de una vez al final del run, no necesitan ser JSONL.

### D5 — Captura de la traza del agente

`ToolLoopAgent` del Vercel AI SDK acepta un callback que se invoca al finalizar cada step. En ese callback se serializa: `step` (índice incremental), `messages` (sólo los nuevos), `toolCalls` (`{ name, args }`), `toolResults` (`{ name, output }`), `finishReason`, `usage`. Cada step se hace `appendFileSync` a `<runDir>/agent-trace.jsonl`.

No usamos un proveedor de telemetría externo: el dato vive en el filesystem local junto al resto del run.

### D6 — `dump()` requiere run activo, `log.*` no

`dump()` pasa a requerir un `RunContext` activo: si no hay, lanza error. Esto fuerza a todo call site a estar dentro de `runWithContext` y previene la acumulación de "huérfanos" como los 130 actuales. Los tests envuelven sus call sites en `runWithContext({ kind: "...", runId: "test", runDir: <tmpdir> })`.

`log.*` mantiene comportamiento permisivo: si hay run, escribe también a `timeline.jsonl`; si no hay, sólo `console.*`. Esto evita romper la salida de cualquier código que se ejecute fuera de un orquestador (instrumentation, scripts, migraciones).

### D7 — Numeración de artefactos

El campo `sequenceCounter.value` del `RunContext` se incrementa atómicamente cada vez que `dump()` se invoca. El nombre de archivo es `<NN>_<label>.<ext>` con `NN` formateado a 2 dígitos (`01`, `02`, …, `99`, `100`). Si un run produce más de 99 dumps, el ancho crece naturalmente; el orden lexicográfico se preserva mientras todos los archivos del mismo run tengan el mismo número de dígitos — pero el caso es teórico, ningún run real se acerca.

### D8 — Instrumentación del cierre de overlays

`dismissBlockingOverlays(session?)` emite tres tipos de evento al `timeline.jsonl`:

| Evento | Cuándo | Carga útil |
|--------|--------|----------|
| `dismiss-attempt` | siempre, al iniciar | `{ session }` |
| `dismiss-hit` | si algún patrón matchea | `{ kind: "login-wall" \| "cookie-banner", pattern, ref }` |
| `dismiss-miss` | si ningún patrón matchea pero el snapshot tiene apariencia de overlay | `{ snapshotArtifact: "<NN>_dismiss_miss.snapshot.json" }` |

Sólo en `dismiss-miss` se vuelca el snapshot pre como artefacto. En `dismiss-hit` y en "no había overlay" no se vuelca nada para no inflar la carpeta. El criterio de "apariencia de overlay" se mantiene heurístico inicialmente: cualquier `- button "..."` en las primeras 30 líneas del snapshot que no coincida con un patrón conocido. Es ruidoso a propósito — el objetivo es capturar suficientes ejemplos para decidir el upgrade a LLM.

### D9 — Agente revisor: `generateText`, no `ToolLoopAgent`

El revisor es una sola llamada a `generateText` con:
- Un prompt de sistema que describe su rol (analizar el run y proponer mejoras concretas a prompts, herramientas, lógica de orquestación).
- Como contenido del usuario: el bundle del run formateado como markdown (meta + timeline + trace + lista de artefactos con descripciones cortas, no su contenido íntegro para no explotar el contexto).
- Output de texto libre que se escribe directamente a `<runDir>/review.md`.

No tiene tools, no tiene loop, no tiene contexto mutado. Es analítico y unidireccional. Si en el futuro el revisor necesita leer el contenido de artefactos específicos para profundizar, se puede convertir en `ToolLoopAgent` con tools de lectura — pero esa complejidad no se justifica todavía.

### D10 — UI bajo `/log`, no `/runs`

La URL del dashboard alinea con el nombre de la carpeta en disco para evitar disonancia entre lo que el usuario ve en la URL y lo que ve en su filesystem si decide inspeccionar a mano. `/log` index lista runs; `/log/<runId>` muestra el detalle.

### D11 — Sin retención

Los runs se acumulan indefinidamente. La limpieza se hace explícita por el usuario vía dos botones en la UI: uno por run (`Eliminar este log`) y uno global (`Limpiar todos los logs`, con confirmación). Esto es coherente con que la ejecución es siempre local y el usuario controla el disco.

## Open Questions

- **Tamaño de los snapshots**: una página de resultados de LinkedIn produce snapshots de 100–200 KB. Un run típico genera ~15 dumps. Sin retención, esto crece. No se aborda en esta propuesta; si en uso real los runs llegan a ocupar GBs, se evaluará gzip de artefactos al cerrar el run o un comando de "limpiar runs anteriores a X".
- **Concurrencia de orquestadores**: la propuesta asume que cada `runScout`/`runWriter`/`runManualExtract` se invoca uno a uno desde el dashboard. Si en el futuro se permitieran ejecuciones concurrentes, `AsyncLocalStorage` lo soporta sin cambios — cada uno en su propio scope. Pero `closeBrowser()` global tendría que repensarse; eso queda fuera de alcance.
- **Modelo del revisor**: arrancamos con el mismo proveedor que el resto (`@ai-sdk/deepinfra`) y un modelo de tamaño medio (p. ej. `zai-org/GLM-5.1`). El modelo concreto se ajusta tras la primera iteración de uso — no se hard-codea en la spec.
