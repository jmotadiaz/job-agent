## ADDED Requirements

### Requirement: Carpeta por ejecución bajo `log/<runId>/`

El sistema SHALL crear, para cada invocación de un orquestador de agente (Scout, Writer, Manual), una carpeta dedicada bajo `log/<runId>/` que contiene la totalidad de la información observable del run, y SHALL NO mezclar archivos de runs distintos en directorios compartidos.

#### Scenario: Estructura completa de la carpeta tras un run

- **WHEN** un orquestador completa una ejecución (con éxito o error)
- **THEN** existe en filesystem la carpeta `log/<runId>/` con al menos los archivos `meta.json`, `timeline.jsonl` y `agent-trace.jsonl`
- **AND** existe una subcarpeta `artifacts/` (vacía si el run no produjo dumps)
- **AND** ningún otro archivo del run vive fuera de esa carpeta

#### Scenario: Aislamiento entre runs concurrentes

- **WHEN** dos orquestadores se ejecutan simultáneamente en la misma instancia
- **THEN** cada uno escribe únicamente a su propia carpeta `log/<runId-A>/` y `log/<runId-B>/`
- **AND** ningún evento, traza o artefacto de uno aparece en la carpeta del otro

### Requirement: Formato del `runId`

El sistema SHALL generar identificadores de run con la forma `<ISO-timestamp-saneado>_<nanoid8>`, donde `ISO-timestamp-saneado` es la representación ISO-8601 del instante de inicio con los caracteres `:` y `.` sustituidos por `-`, y `nanoid8` es un identificador aleatorio de 8 caracteres del alfabeto por defecto de `nanoid`.

#### Scenario: runId ordenable y único

- **WHEN** se generan múltiples runIds en momentos distintos
- **THEN** el orden lexicográfico de los runIds SHALL coincidir con el orden cronológico de creación
- **AND** la probabilidad de colisión entre dos runIds del mismo timestamp es despreciable gracias al sufijo nanoid

#### Scenario: runId legible en URL y en filesystem

- **WHEN** un runId aparece como segmento de URL o como nombre de carpeta
- **THEN** SHALL contener únicamente caracteres seguros para ambos contextos (`[A-Za-z0-9_-]`)
- **AND** SHALL tener una longitud máxima previsible inferior a 40 caracteres

### Requirement: Propagación implícita del run vía `AsyncLocalStorage`

El sistema SHALL exponer un `RunContext` cuyo ciclo de vida se gestiona mediante `AsyncLocalStorage` y que es leído por las funciones de logging y dump sin requerir que se pase como argumento explícito a través de la pila de llamadas.

#### Scenario: La función envolvente establece el contexto

- **WHEN** un orquestador invoca `runWithContext({ kind, input }, async () => { ... })`
- **THEN** dentro del callback, `getCurrentRunContext()` SHALL devolver un objeto con `runId`, `runDir`, `kind` y un contador de secuencia mutable
- **AND** fuera del callback, `getCurrentRunContext()` SHALL devolver `undefined`

#### Scenario: Las herramientas y helpers no requieren modificarse

- **WHEN** una tool del Scout (`openSearch`, `fetchJobDetail`, etc.) o un helper como `runAgentBrowser` invoca `log.info(...)` o `dump(...)`
- **THEN** la salida correspondiente SHALL escribirse al `runDir` activo sin que la tool reciba el `runId` como parámetro
- **AND** las firmas de las tools SHALL permanecer libres de parámetros relacionados con observabilidad

### Requirement: `meta.json` como tarjeta del run

El sistema SHALL escribir un archivo `meta.json` en `log/<runId>/` que contiene la información identificativa, temporal y de resultado del run, suficiente para realizar triage sin abrir el resto de archivos.

#### Scenario: Campos mínimos al inicio

- **WHEN** se inicia un run vía `runWithContext`
- **THEN** se escribe `meta.json` con al menos `runId`, `kind`, `startedAt`, `input`
- **AND** los campos `finishedAt`, `duration_ms`, `outcome`, `result` SHALL estar ausentes hasta el cierre del run

#### Scenario: Campos de cierre

- **WHEN** el run finaliza (con éxito o error)
- **THEN** `meta.json` SHALL actualizarse para incluir `finishedAt`, `duration_ms` y `outcome` con uno de los valores `"match" | "no_match" | "ok" | "error"`
- **AND** SHALL incluir `result` con la información de cierre específica del agente (ej. `{ jobId }` para Scout en match, `{ message, stage }` para error)

### Requirement: `timeline.jsonl` como log estructurado del run

El sistema SHALL persistir cada invocación de `log.info`, `log.warn` y `log.error` realizada dentro del scope del run como una línea JSON en `log/<runId>/timeline.jsonl`, además de la salida a `console.*`.

#### Scenario: Una línea por evento

- **WHEN** una tool emite `log.info("scout/tool", "fetchJobDetail begin", { url })`
- **THEN** se añade exactamente una línea al archivo `timeline.jsonl` con la forma `{ "ts": <ISO>, "level": "info", "module": "scout/tool", "event": "fetchJobDetail begin", "payload": { "url": "..." } }`
- **AND** la salida a `console.*` SHALL seguir produciéndose en su formato actual

#### Scenario: Sin run activo, sólo consola

- **WHEN** `log.info(...)` se invoca fuera de un `runWithContext` (por ejemplo durante la migración de la base de datos en `instrumentation.ts`)
- **THEN** SHALL escribirse a `console.*`
- **AND** SHALL NO escribirse a ningún archivo

#### Scenario: Robustez ante crash

- **WHEN** el proceso muere abruptamente a media ejecución
- **THEN** las líneas de `timeline.jsonl` ya escritas SHALL ser legibles
- **AND** el archivo SHALL ser parseable línea a línea hasta el último evento emitido (no se pierde la información acumulada)

### Requirement: `agent-trace.jsonl` como traza del LLM

El sistema SHALL persistir, para cada step del bucle de cualquier `ToolLoopAgent` ejecutado dentro del scope del run, una línea JSON en `log/<runId>/agent-trace.jsonl` que captura los mensajes intercambiados, las tool calls emitidas con sus argumentos, los tool results recibidos y el `finishReason` del step.

#### Scenario: Captura por step

- **WHEN** el agente Scout completa un step en el que invoca `fetchJobDetail` y recibe el resultado
- **THEN** se añade una línea a `agent-trace.jsonl` con `{ ts, step, messages, toolCalls: [{ name: "fetchJobDetail", args }], toolResults: [{ name: "fetchJobDetail", output }], finishReason }`
- **AND** los mensajes registrados SHALL ser únicamente los nuevos del step, no el historial acumulado

#### Scenario: Trazabilidad cross-archivo

- **WHEN** se inspecciona un run completo
- **THEN** los timestamps de `timeline.jsonl` y de `agent-trace.jsonl` SHALL permitir reconstruir el orden exacto de los eventos del código y los pasos del modelo intercalados

### Requirement: `artifacts/` con dumps numerados

El sistema SHALL volcar todo contenido pesado (snapshots de página, texto crudo, JSON estructurado producido por una tool) bajo `log/<runId>/artifacts/<NN>_<label>.<ext>`, donde `NN` es un contador incremental por run formateado a al menos 2 dígitos, y `label` es la etiqueta semántica provista por el call site.

#### Scenario: Numeración secuencial

- **WHEN** se invocan `dump("openSearch", a)`, `dump("listVisibleJobs", b)`, `dump("fetchJobDetail", c)` en este orden dentro de un mismo run
- **THEN** los archivos resultantes SHALL ser `01_openSearch.json`, `02_listVisibleJobs.json`, `03_fetchJobDetail.json` (con la extensión inferida del payload)

#### Scenario: `dump()` requiere run activo

- **WHEN** `dump(label, content)` se invoca fuera de un `runWithContext`
- **THEN** la función SHALL lanzar un error explícito y SHALL NO escribir a ningún archivo
- **AND** el mensaje de error SHALL guiar al desarrollador a envolver el call site en `runWithContext`

### Requirement: Cubrimiento de los tres orquestadores

El sistema SHALL aplicar la captura por-run a las tres ejecuciones de agente del proyecto: Scout, Writer y Manual extractor.

#### Scenario: Run del Scout produce carpeta

- **WHEN** se invoca `runScout()` desde la API route
- **THEN** existe `log/<runId>/` con `meta.kind === "scout"` y los archivos esperados

#### Scenario: Run del Writer produce carpeta

- **WHEN** se invoca el orquestador del Writer (sea por generación inicial o por iteración con feedback)
- **THEN** existe `log/<runId>/` con `meta.kind === "writer"` y los archivos esperados

#### Scenario: Run del Manual produce carpeta

- **WHEN** se invoca `extractJobFromUrl(url)` desde la entrada manual
- **THEN** existe `log/<runId>/` con `meta.kind === "manual"` y los archivos esperados

### Requirement: Ausencia de retención automática

El sistema SHALL NO eliminar runs antiguos automáticamente. La gestión del espacio en `log/` queda bajo control explícito del usuario a través de los controles de la UI del dashboard.

#### Scenario: Acumulación indefinida

- **WHEN** se ejecutan N orquestadores consecutivos sin intervención del usuario
- **THEN** las N carpetas correspondientes SHALL permanecer en `log/`
- **AND** ningún proceso de fondo SHALL borrarlas
