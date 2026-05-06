## Why

El último commit (`341d595`) tuvo que añadir el patrón `"Descartar"` en **tres** archivos casi idénticos (`openSearch.ts`, `fetchJobDetail.ts`, `manual/extractor.ts`) porque la lógica de cierre de overlays de LinkedIn está duplicada literalmente con una lista de regex codificada en cada uno. Cada nueva localización (Polonia, Francia) o variante A/B exigirá tres ediciones idénticas.

Detectar el bug y diagnosticarlo es además innecesariamente caro: hoy no hay forma de saber cuántos runs fallan al cerrar el popup, qué snapshot vio el modelo cuando reaccionó al fallo, ni qué razonó. Los logs van únicamente a `console.*`, los dumps caen en `log/<timestamp>_<label>.json` sin agrupación por run, y la traza del LLM (mensajes, tool calls, tool results) no se persiste en ningún sitio.

Esta propuesta consolida la lógica frágil de cierre de overlays en un único helper, instrumenta su tasa de éxito/fallo, y captura toda la actividad de cada run del Scout, Writer y Manual en una carpeta por ejecución bajo `log/`. Encima de esa captura, se añade en el dashboard una pestaña `/log` para inspeccionar los runs y un agente revisor que analiza un run y propone mejoras.

## What Changes

- **Centralización del cierre de overlays**: nueva función `dismissBlockingOverlays(session?)` en `src/lib/agent-browser/exec.ts` que absorbe los bloques duplicados de `openSearch`, `fetchJobDetail` y `manual/extractor`. La lista de patrones de botón vive en un único sitio. Se emiten eventos `dismiss-attempt`/`dismiss-hit`/`dismiss-miss` para metricar la tasa de fallo, y en cada miss se vuelca el snapshot pre como evidencia.
- Nueva primitiva `RunContext` por ejecución, propagada vía `AsyncLocalStorage`, con campos `{ runId, runDir, kind, sequenceCounter }`.
- `runId` con formato `<ISO>_<nanoid8>` (ordenable, único, legible).
- Carpeta `log/<runId>/` por run con `meta.json`, `timeline.jsonl`, `agent-trace.jsonl` y `artifacts/<NN>_<label>.<ext>`.
- `src/lib/utils/log.ts` añade salida adicional a `<runDir>/timeline.jsonl` cuando hay `RunContext` activo (mantiene `console.*` para depuración en vivo).
- `src/lib/utils/dump.ts` deja de escribir a `log/` global; vuelca a `<runDir>/artifacts/<NN>_<label>.json` con `NN` asignado por el contador del `RunContext`.
- Captura de cada step del agente (mensajes, tool calls, tool results, finishReason) en `agent-trace.jsonl` mediante el hook de `ToolLoopAgent`.
- Los orquestadores de Scout, Writer y Manual envuelven su trabajo con `runWithContext({ kind, ... }, ...)` para abrir/cerrar el run y escribir `meta.json`.
- **Dashboard**: nueva ruta `/log` que lista todos los runs ordenados por fecha; nueva ruta `/log/<runId>` que renderiza `meta.json`, el timeline filtrable, la traza del agente y los artefactos. Botón "Eliminar este log" por run y botón global "Limpiar todos los logs" en la index.
- **Agente revisor**: endpoint `POST /api/log/<runId>/review` que ejecuta una revisión LLM sobre el bundle del run (`meta.json` + `timeline.jsonl` + `agent-trace.jsonl` + lista de artefactos) y persiste un informe en `log/<runId>/review.md`. Botón "Pedir revisión" en el detalle.
- **BREAKING (interno)** — la firma de `dump()` cambia: ahora requiere un `RunContext` activo o lanza error. Los call sites de tests necesitan envolverse en `runWithContext`.

## Capabilities

### New Capabilities

- `run-observability`: Captura por-run de todo lo que hace cada agente — eventos del orquestador y herramientas, traza del LLM, dumps de contenido web — en una estructura de carpeta única por ejecución con propagación implícita del run vía `AsyncLocalStorage`.
- `run-review`: Análisis post-hoc de un run concreto por un agente revisor que produce un informe markdown con observaciones y propuestas de mejora.

### Modified Capabilities

- `job-scout`: La lógica de cierre de overlays en `openSearch` y `fetchJobDetail` se desplaza a un helper compartido. El comportamiento observable (cerrar login walls, aceptar cookies) se preserva; se añade contrato de instrumentación.
- `manual-job-fetch`: Mismo desplazamiento de la lógica de overlays al helper compartido.
- `job-dashboard`: Nueva sección `/log` con index y detalle, controles de limpieza y de revisión.

## Impact

- `src/lib/agent-browser/exec.ts` — nueva función `dismissBlockingOverlays(session?)`; mantiene las primitivas existentes intactas.
- `src/lib/agents/scout/tools/openSearch.ts` — sustituye el bloque duplicado por una llamada al helper.
- `src/lib/agents/scout/tools/fetchJobDetail.ts` — sustituye el bloque duplicado por una llamada al helper.
- `src/lib/agents/manual/extractor.ts` — sustituye el bloque duplicado por una llamada al helper.
- `src/lib/runtime/run-context.ts` — **NUEVO**: define `RunContext`, `runWithContext()`, `getCurrentRunContext()`.
- `src/lib/utils/log.ts` — añade escritura a `timeline.jsonl` cuando hay run activo.
- `src/lib/utils/dump.ts` — pasa a escribir bajo `<runDir>/artifacts/`; numera por orden.
- `src/lib/runtime/agent-trace.ts` — **NUEVO**: integra el hook de `ToolLoopAgent` y persiste a `agent-trace.jsonl`.
- `src/lib/agents/scout/agent.ts` — registra el hook de trace en el `ToolLoopAgent`.
- `src/lib/agents/writer/agent.ts` — registra el hook de trace en el `ToolLoopAgent`.
- `src/lib/agents/scout/orchestrator.ts` — envuelve la ejecución en `runWithContext({ kind: "scout", ... })`.
- `src/lib/agents/writer/orchestrator.ts` — envuelve la ejecución en `runWithContext({ kind: "writer", ... })`.
- `src/lib/agents/manual/extractor.ts` — envuelve la ejecución en `runWithContext({ kind: "manual", ... })`.
- `src/app/log/page.tsx`, `src/app/log/[runId]/page.tsx` — **NUEVO**: index y detalle.
- `src/app/api/log/route.ts` (GET, DELETE), `src/app/api/log/[runId]/route.ts` (GET, DELETE), `src/app/api/log/[runId]/review/route.ts` (POST) — **NUEVO**.
- `src/lib/agents/reviewer/` — **NUEVO**: prompt + invocación `generateText` del revisor.
- `.gitignore` — `log/` ya está ignorado; verificar.
