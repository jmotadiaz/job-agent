## 1. Primitiva `RunContext` y propagación

- [x] 1.1 Crear `src/lib/runtime/run-context.ts` con `AsyncLocalStorage<RunContext>`, `runWithContext()`, `getCurrentRunContext()` y `nextSequenceNumber()`
- [x] 1.2 Definir el tipo `RunContext` con `runId`, `runDir`, `kind: "scout" | "writer" | "manual"` y `sequenceCounter: { value: number }`
- [x] 1.3 Implementar `makeRunId()` que produce `<ISO>_<nanoid8>` (ISO con `:` y `.` reemplazados por `-`)
- [x] 1.4 Implementar `runWithContext()` para crear la carpeta `log/<runId>/artifacts/`, registrar `meta.json` inicial al inicio (con `kind`, `startedAt`, `input`) y al cierre (con `finishedAt`, `duration_ms`, `outcome`, `result`)
- [x] 1.5 Tests unitarios de `RunContext`: que `getCurrentRunContext` devuelve `undefined` fuera de `runWithContext`, que devuelve el ctx correcto dentro, que es seguro para llamadas anidadas/concurrentes

## 2. Persistencia en `log.ts`

- [x] 2.1 Modificar `src/lib/utils/log.ts` para que, además de `console.*`, escriba a `<runDir>/timeline.jsonl` cuando `getCurrentRunContext()` devuelve un ctx
- [x] 2.2 Formato JSONL: `{ ts, level, module, event, payload? }` por línea
- [x] 2.3 Usar `appendFileSync` (apertura/cierre por evento, sin file handles abiertos) para no perder eventos si el proceso muere
- [x] 2.4 Cuando no hay run activo, comportamiento idéntico al actual (sólo consola)
- [ ] 2.5 Tests: log dentro de run produce línea en `timeline.jsonl`; log fuera de run no toca filesystem

## 3. Persistencia y numeración en `dump.ts`

- [ ] 3.1 Modificar `src/lib/utils/dump.ts` para escribir a `<runDir>/artifacts/<NN>_<label>.json`, con `NN` obtenido de `nextSequenceNumber()` formateado a 2 dígitos
- [ ] 3.2 Lanzar error explícito si `dump()` se invoca sin `RunContext` activo (mensaje: "dump() requires an active run context — wrap in runWithContext()")
- [ ] 3.3 Eliminar la lógica que escribía a `log/` raíz y los 130 archivos sueltos preexistentes (limpieza manual o `rm log/*.json`)
- [ ] 3.4 Tests: dump dentro de run escribe a la carpeta del run con número incremental; dump fuera de run lanza

## 4. Captura de la traza del agente

- [ ] 4.1 Crear `src/lib/runtime/agent-trace.ts` con `appendAgentStep(step)` que escribe a `<runDir>/agent-trace.jsonl` si hay run activo
- [ ] 4.2 El registro por step contiene `{ ts, step, messages, toolCalls, toolResults, finishReason, usage? }` — sólo los mensajes nuevos del step, no el historial acumulado
- [ ] 4.3 Investigar y usar el callback equivalente a `onStepFinish` que expone `ToolLoopAgent` del Vercel AI SDK; consultar context7 para el nombre exacto en la versión instalada
- [ ] 4.4 Wirear el callback en `src/lib/agents/scout/agent.ts` (`createScoutAgent`)
- [ ] 4.5 Wirear el callback en `src/lib/agents/writer/agent.ts` (`createWriterAgent` o equivalente)
- [ ] 4.6 Tests de integración: tras un run del Scout, `agent-trace.jsonl` existe y contiene N≥1 líneas con la estructura esperada

## 5. Centralización de cierre de overlays

- [ ] 5.1 Implementar `dismissBlockingOverlays(session?: string): Promise<void>` en `src/lib/agent-browser/exec.ts`
- [ ] 5.2 Mover la lista actual de patrones (`Dismiss | Descartar | Cerrar | Close`) y de cookies (`Accept | Aceptar | Accept all`) a constantes `DISMISS_PATTERNS` y `COOKIE_PATTERNS` dentro del helper
- [ ] 5.3 La función debe: tomar snapshot, recorrer patterns, clickar el primero que matchee, esperar 1500ms, repetir para cookies
- [ ] 5.4 Emitir `log.info("agent-browser/exec", "dismiss-attempt", { session })` siempre al inicio
- [ ] 5.5 Emitir `log.info("agent-browser/exec", "dismiss-hit", { kind: "login-wall" | "cookie-banner", pattern: <stringified>, ref })` cuando matchea
- [ ] 5.6 Cuando el snapshot contiene cualquier `- button "..."` en sus primeras 30 líneas que no coincida con ningún patrón conocido: emitir `log.warn("agent-browser/exec", "dismiss-miss", { snapshotArtifact: <NN_dismiss_miss.snapshot.json> })` y `dump("dismiss_miss", { snapshot, refs })`
- [ ] 5.7 Sustituir el bloque inline en `src/lib/agents/scout/tools/openSearch.ts` por una llamada a `dismissBlockingOverlays()`
- [ ] 5.8 Sustituir el bloque inline en `src/lib/agents/scout/tools/fetchJobDetail.ts` por una llamada a `dismissBlockingOverlays(session)`
- [ ] 5.9 Sustituir el bloque inline en `src/lib/agents/manual/extractor.ts` por una llamada a `dismissBlockingOverlays(session)`
- [ ] 5.10 Tests: con un snapshot mock que incluye "Descartar", el helper detecta el ref y emite `dismiss-hit`; con un snapshot que incluye un botón "Verwerfen" desconocido, emite `dismiss-miss` y produce el dump

## 6. Wiring de los orquestadores

- [ ] 6.1 `src/lib/agents/scout/orchestrator.ts`: envolver `runScout()` con `runWithContext({ kind: "scout", input: { query, location, profileHash } }, async () => { ... })`. El `meta.json` final captura `outcome: "match" | "no_match" | "error"` y los campos relevantes
- [ ] 6.2 `src/lib/agents/writer/orchestrator.ts`: envolver la ejecución del Writer con `runWithContext({ kind: "writer", input: { jobId, generationId } }, ...)`
- [ ] 6.3 `src/lib/agents/manual/extractor.ts`: envolver `extractJobFromUrl()` con `runWithContext({ kind: "manual", input: { url } }, ...)`
- [ ] 6.4 Comprobar manualmente que tras un run de cada agente queda una carpeta `log/<runId>/` completa

## 7. Endpoints de la API del log

- [ ] 7.1 `GET /api/log` — listar todos los runs presentes en `log/`, devuelve `Array<{ runId, kind, startedAt, finishedAt?, outcome?, hasReview }>` ordenado por `startedAt` descendente
- [ ] 7.2 `DELETE /api/log` — elimina recursivamente todas las carpetas dentro de `log/`
- [ ] 7.3 `GET /api/log/[runId]` — devuelve `meta.json` parseado, `timeline.jsonl` parseado a array, `agent-trace.jsonl` parseado a array, lista de artefactos con `name` y `size`, contenido de `review.md` si existe
- [ ] 7.4 `DELETE /api/log/[runId]` — elimina recursivamente la carpeta `log/<runId>/`
- [ ] 7.5 `POST /api/log/[runId]/review` — invoca al revisor (sección 8) y devuelve `{ review: <markdown> }`

## 8. Agente revisor

- [ ] 8.1 Crear `src/lib/agents/reviewer/prompt.ts` con el prompt de sistema (rol: analizar trace y proponer mejoras concretas a prompts/tools/orquestación; output en markdown estructurado)
- [ ] 8.2 Crear `src/lib/agents/reviewer/bundle.ts` que serializa el run a un único string markdown con secciones `## Meta`, `## Timeline`, `## Agent trace`, `## Artifacts (resumen)` — los artefactos sólo se listan por nombre y tamaño, no se incluye su contenido íntegro
- [ ] 8.3 Crear `src/lib/agents/reviewer/run.ts` con `reviewRun(runId): Promise<string>` que lee el bundle, invoca `generateText` (DeepInfra, modelo `zai-org/GLM-5.1`), y persiste el output a `log/<runId>/review.md`
- [ ] 8.4 Tests: snapshot de bundle.ts con un run mock; smoke test del endpoint `/api/log/[runId]/review` con `MOCK_LLM=1`

## 9. UI del dashboard

- [ ] 9.1 Crear `src/app/log/page.tsx` — index que pinta la lista de runs (componente cliente que llama a `GET /api/log`), con un botón "Limpiar todos los logs" (confirm + `DELETE /api/log` + refresh)
- [ ] 9.2 Crear `src/app/log/[runId]/page.tsx` — detalle del run: tarjeta con `meta.json`, tabla del `timeline.jsonl` (filtrable por nivel y módulo), expandable de la traza del agente paso a paso, lista de artefactos con enlaces de descarga
- [ ] 9.3 Botón "Eliminar este log" en el detalle (confirm + `DELETE /api/log/[runId]` + redirect a /log)
- [ ] 9.4 Botón "Pedir revisión" en el detalle (POST /api/log/[runId]/review + spinner + render del markdown devuelto + persistencia en `review.md`)
- [ ] 9.5 Si `review.md` ya existe al cargar el detalle, renderizarlo directamente sin botón de "Pedir revisión" (o con uno de "Re-revisar")
- [ ] 9.6 Enlace "Logs" en la navegación principal del dashboard que apunta a `/log`

## 10. Tests de integración end-to-end

- [ ] 10.1 Test: `runScout()` con browser mockeado produce una carpeta `log/<runId>/` con los 4 archivos esperados (`meta.json`, `timeline.jsonl`, `agent-trace.jsonl`, `artifacts/`)
- [ ] 10.2 Test: el `meta.json` resultante captura `kind`, `outcome`, `duration_ms` y los campos de input
- [ ] 10.3 Test: el `timeline.jsonl` contiene al menos los eventos `agent invoke begin`, `agent result`, `dismiss-attempt`
- [ ] 10.4 Test: el `agent-trace.jsonl` contiene al menos un step con `toolCalls` no vacío

## 11. Limpieza

- [ ] 11.1 Borrar los archivos huérfanos preexistentes en `log/` (los 130 dumps con timestamp en el nombre); documentar el comando en el changelog del run
- [ ] 11.2 Verificar `.gitignore` cubre `log/` recursivamente
- [ ] 11.3 Eliminar de los tres call sites el código muerto comentado (el bloque comentado de `Show more` en `fetchJobDetail.ts`)
