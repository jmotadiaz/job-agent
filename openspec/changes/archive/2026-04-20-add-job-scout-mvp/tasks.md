## Reglas para el apply

Estas reglas son **vinculantes** para la persona o agente que ejecute `/opsx:apply` sobre este change. Aplican a todas las tareas de abajo, no solo a las explícitamente marcadas.

1. **Inicialización del proyecto Next.js**: el scaffolding inicial SHALL ejecutarse exactamente con `npx create-next-app@latest . --yes`. No usar plantillas alternativas, no adoptar configuraciones manualmente que `create-next-app` ya provee. El `.` apunta a la raíz del repo (que ya contiene `openspec/`, `.claude/`, etc., y debe sobrevivir intacto).

2. **Instalación de dependencias**: cada dependencia SHALL instalarse con `npm install ${dependencyName}` (o `npm install -D ${dependencyName}` para devDependencies), invocando el comando **una dependencia por línea** o como mucho agrupando dependencias del mismo tipo en una sola invocación. **Prohibido** fijar versiones específicas en el comando (no `npm install foo@1.2.3`) — el objetivo es siempre traer la última versión estable. **Prohibido** editar `package.json` a mano para añadir dependencias; siempre pasar por `npm install` para que el lockfile y la versión queden bien resueltos.

3. **Uso de dependencias vía Context7**: antes de escribir código que use cualquier librería externa instalada (Next.js, Vercel AI SDK, `agent-browser`, `better-sqlite3`, `@react-pdf/renderer`, `zod`, etc.), el implementador SHALL consultar la documentación actual de esa librería usando las herramientas de Context7 (`mcp__context7__resolve-library-id` seguido de `mcp__context7__query-docs`). Esto aplica también a librerías "que crees conocer" — el knowledge cutoff puede dejar fuera APIs nuevas, breaking changes o convenciones recientes. La consulta se hace **al empezar a usar** la librería, no de forma anticipada para todas a la vez.

## 1. Scaffolding del proyecto

- [x] 1.1 Inicializar el proyecto ejecutando exactamente `npx create-next-app@latest . --yes` en la raíz del repo (verificar antes que `openspec/`, `.claude/`, `.gitignore`, etc. siguen intactos al terminar)
- [x] 1.2 Instalar dependencias de runtime, una invocación de `npm install` por dependencia y sin fijar versión: `@ai-sdk/anthropic`, `ai`, `agent-browser`, `better-sqlite3`, `@react-pdf/renderer`, `zod`, `nanoid`. Antes de empezar a usar cada una, consultar su doc actual en Context7.
- [x] 1.3 Instalar dependencias de desarrollo con `npm install -D` (sin fijar versión): `@types/better-sqlite3`, `vitest`, `@types/node`
- [x] 1.4 Configurar `tsconfig.json` con paths (`@/*` → `src/*`)
- [x] 1.5 Crear estructura de carpetas: `src/app`, `src/lib/db`, `src/lib/agents`, `src/lib/agent-browser`, `src/lib/writer`, `src/lib/profile`
- [x] 1.6 Añadir `profile.md`, `*.sqlite`, `.agent-browser/`, `.env.local`, `generated-pdfs/` al `.gitignore`
- [x] 1.7 Crear `profile.md.example` con una estructura vacía comentada y una sección `## search` de ejemplo

## 2. Capa de datos (SQLite)

- [x] 2.1 Implementar `src/lib/db/client.ts` que abre `better-sqlite3` contra `data/job-agent.sqlite` (crea el directorio si no existe) y expone una instancia singleton
- [x] 2.2 Implementar `src/lib/db/migrate.ts` con las sentencias `CREATE TABLE IF NOT EXISTS` para `jobs` (incluyendo `UNIQUE(source, external_id)`) y `generations` (con FK a `jobs`, columna `parent_generation_id TEXT NULL` con FK a `generations.id` para el árbol de iteraciones, y columnas `feedback_rating INTEGER NULL CHECK (feedback_rating BETWEEN 1 AND 5)` y `feedback_comment TEXT NULL`)
- [x] 2.3 Invocar `migrate()` de forma idempotente al arranque del servidor Next.js (p. ej. en `instrumentation.ts`)
- [x] 2.4 Implementar `src/lib/db/jobs.ts` con funciones `getSeenExternalIds`, `insertJob`, `listJobs({ status? })`, `getJobById`, `updateJobStatus`
- [x] 2.5 Implementar `src/lib/db/generations.ts` con funciones `insertGeneration`, `listGenerationsForJob`, `getLatestGenerationForJob`
- [x] 2.6 Escribir tests unitarios para dedupe por `UNIQUE(source, external_id)` y transiciones de status

## 3. Perfil del usuario

- [x] 3.1 Implementar `src/lib/profile/load.ts` que lee `profile.md` de la raíz del repo y devuelve su contenido como string, lanzando un error claro si no existe
- [x] 3.2 Implementar `src/lib/profile/hash.ts` que calcula el SHA-1 hex del contenido de `profile.md`
- [x] 3.3 Implementar `src/lib/profile/parse.ts` que extrae al menos la sección `## search` (query, ubicación, filtros) como objeto tipado, dejando el resto del perfil como texto bruto para consumo del LLM

## 4. Wrapper de `agent-browser`

- [x] 4.1 Implementar `src/lib/agent-browser/exec.ts` con una función `runAgentBrowser(args: string[])` que ejecuta el CLI como subprocess, pasa siempre `--json`, parsea la respuesta y lanza errores estructurados al fallar
- [x] 4.2 Implementar helpers `open(url)`, `waitLoad()`, `snapshot({ selector?, interactive?, urls? })`, `getText(selector)`, `getUrl()` que envuelven `runAgentBrowser`
- [x] 4.3 Implementar `closeBrowser()` idempotente para garantizar que el subprocess queda limpio al final de cada ejecución del Scout
- [x] 4.4 Escribir un test de humo que abra una URL pública estable, tome snapshot y confirme que la respuesta parsea correctamente

## 5. Tools del agente Scout

- [x] 5.1 Definir tipos compartidos `JobCard`, `JobSummary`, `ScoutResult` con zod en `src/lib/agents/scout/types.ts`
- [x] 5.2 Implementar `openSearch(query)` que construye la URL pública de LinkedIn Jobs a partir de la query y los filtros del perfil, llama a `agent-browser open` y `wait --load networkidle`
- [x] 5.3 Implementar `listVisibleJobs()` que toma snapshot del contenedor de resultados, extrae `JobCard[]`, consulta `getSeenExternalIds()` y filtra internamente los ya vistos antes de devolver
- [x] 5.4 Implementar `fetchJobDetail(url)` que navega al detalle, extrae el texto de la descripción con `get text`, llama a llama-3.1-8b-instant con un prompt de resumen y devuelve `JobSummary` con `summary_md` de 6-10 bullets
- [x] 5.5 Implementar `saveCurrentJob({ score, reason })` que persiste la última `JobSummary` observada en la ejecución con status `shortlisted`, manejando de forma explícita el error de UNIQUE violation como condición inesperada
- [x] 5.6 Implementar `noMatch(reason)` que finaliza la ejecución sin persistir nada
- [x] 5.7 Escribir unit tests con mocks para `listVisibleJobs` verificando el filtrado por `external_id`

## 6. Orquestador y agente Scout

- [x] 6.1 Implementar `src/lib/agents/scout/agent.ts` que construye el agente Scout con `new ToolLoopAgent({ model, instructions, tools, stopWhen })` del paquete `ai` (Vercel AI SDK), modelo Sonnet, y registra las 5 tools definidas en el grupo 5. La condición `stopWhen` combina `isLoopFinished()` con la aplicación del tope de candidatos descrito en 6.4. Antes de escribir el código, consultar la doc actual de `ToolLoopAgent` en Context7 para confirmar la firma exacta de constructor, `generate` y `stopWhen`.
- [x] 6.2 Redactar las `instructions` (system prompt) del Scout: rol (buscar una oferta que encaje con el perfil), flujo esperado (openSearch → listVisibleJobs → por cada candidato hasta límite: fetchJobDetail + decisión → saveCurrentJob o noMatch), y criterio de "match" permitiendo explícitamente rendirse con `noMatch`
- [x] 6.3 Implementar `src/lib/agents/scout/orchestrator.ts` como capa de sistema en TypeScript determinista: carga perfil, instancia (o reutiliza) el `ToolLoopAgent`, invoca `agent.generate({ prompt })` construyendo el prompt con la query derivada del perfil, traduce el resultado a `ScoutResult`, captura errores y NO toma decisiones vía LLM
- [x] 6.4 Añadir constante `SCOUT_MAX_CANDIDATES = 5` en config y aplicarla como tope estricto en el runtime (el runner intercepta invocaciones adicionales de `fetchJobDetail` una vez alcanzado el tope, ya sea rechazando la tool call o propagando un error estructurado que fuerza al agente a emitir `noMatch`)
- [x] 6.5 Escribir un test de integración que simule un ciclo completo con tools mockeadas

## 7. API routes del Scout

- [x] 7.1 Crear `POST /api/scout/run` en `src/app/api/scout/run/route.ts` que llama al orquestador del Scout y devuelve `{ kind: "match" | "no_match" | "error", ... }`
- [x] 7.2 Validar que solo se permite una ejecución simultánea del Scout (mutex a nivel de proceso) y responder 409 si ya hay una en curso
- [x] 7.3 Logging estructurado de cada ejecución: inputs de las tools, tiempos, resultado final

## 8. Writer

- [x] 8.1 Diseñar la plantilla fija del CV en `src/lib/writer/templates/cv.tsx` usando React-PDF: secciones header, summary, experiencia, skills, educación
- [x] 8.2 Diseñar la plantilla fija de la carta en `src/lib/writer/templates/cover-letter.tsx`
- [x] 8.3 Definir las tools del Writer en `src/lib/agents/writer/tools.ts`: al menos `selectBullets({ items: { bulletId: string, renderedText: string }[] })` (registra la selección ordenada del LLM junto con la redacción adaptada que el modelo propone para cada bullet — el `bulletId` debe pertenecer al catálogo entregado vía prompt, el `renderedText` es libre pero sujeto a la invariante de no introducir entidades factuales ausentes del perfil), `composeCoverLetter({ paragraphs: string[] })` (registra el cuerpo de la carta, validando que se apoya en hechos del perfil y de la oferta), y `finalizeGeneration()` como tool terminal que cierra el bucle. Los bullets disponibles (con su texto original) y la descripción de la oferta se entregan al LLM vía el prompt, no vía tools, para que el agente no pueda inventar IDs.
- [x] 8.4 Implementar `src/lib/agents/writer/agent.ts` que construye el agente Writer con `new ToolLoopAgent({ model, instructions, tools, stopWhen })`, modelo Sonnet, y `isLoopFinished()` como base del `stopWhen`. Antes de escribir el código, consultar la doc actual de `ToolLoopAgent` en Context7 para confirmar la firma.
- [x] 8.5 Redactar las `instructions` del Writer: rol (adaptar un CV y una carta a una oferta concreta), restricciones duras (no inventar hechos — tecnologías, títulos, empresas, duraciones ni logros ausentes del perfil — ni cambiar la estructura de la plantilla; la redacción de cada bullet SÍ puede adaptarse al puesto siempre que la información factual quede trazable al perfil; solo pueden seleccionarse `bulletId`s del catálogo entregado por prompt), flujo esperado (selectBullets → composeCoverLetter → finalizeGeneration)
- [x] 8.6 Implementar `src/lib/agents/writer/orchestrator.ts` como capa de sistema en TypeScript: carga perfil parseado, carga la oferta desde `jobs` por `jobId`, instancia el Writer `ToolLoopAgent`, invoca `agent.generate({ prompt })`, recibe la selección de bullets y el cuerpo de la carta, renderiza ambas plantillas a PDF con React-PDF, guarda los ficheros en `generated-pdfs/<jobId>/<generationId>/cv.pdf` y `cover.pdf` (el generationId en la ruta evita colisiones entre iteraciones sobre el mismo job), e inserta la fila correspondiente en `generations` con el `profile_hash` actual
- [x] 8.7 Crear `POST /api/writer/generate` que valida el `jobId`, comprueba la existencia de `profile.md`, invoca el orquestador del Writer y devuelve `{ generationId, cvUrl, coverUrl }`
- [x] 8.8 Crear `GET /api/generations/[id]/cv` y `GET /api/generations/[id]/cover` que leen el fichero del disco y lo sirven, respondiendo 404 si ya no existe
- [x] 8.9 Escribir un test de integración que genere PDFs contra un `profile.md` fixture y un `jobId` sembrado

## 9. Dashboard UI

- [x] 9.1 Implementar layout raíz con header mínimo y el botón global "buscar nueva oferta"
- [x] 9.2 Implementar `src/app/page.tsx` que renderiza la lista de ofertas consultando `listJobs({ status })` en el server component, con filtros por tab (`new`, `shortlisted`, `applied`, `discarded`)
- [x] 9.3 Implementar el componente `JobRow` que muestra título, empresa, ubicación, score, extracto de razón, enlaces a la oferta original y botones de acción según estado
- [x] 9.4 Implementar el hook/cliente que dispara `POST /api/scout/run` al pulsar el botón global, muestra un spinner mientras dura y notifica el resultado (match con refresh de la lista, no_match con razón, error con mensaje)
- [x] 9.5 Implementar acción "generar" por oferta que dispara `POST /api/writer/generate`, muestra progreso y, al terminar, revela los enlaces de descarga
- [x] 9.6 Implementar acciones "marcar como aplicado" y "descartar" que llaman a `PATCH /api/jobs/[id]` con el nuevo status y refrescan la lista
- [x] 9.7 Crear `PATCH /api/jobs/[id]` con validación de transiciones y persistencia en `updateJobStatus`
- [x] 9.8 Implementar el indicador de obsolescencia que compara `profile_hash` de la última generación contra el hash actual de `profile.md` y muestra un badge "perfil cambió — regenerar" cuando difieren

## 10. Feedback humano e iteración del Writer

- [x] 10.1 Extender `src/lib/db/generations.ts`: `insertGeneration` SHALL aceptar y persistir `parentGenerationId?`, `feedbackRating?`, `feedbackComment?`; añadir `getGenerationById(id)` que devuelva la fila completa (incluyendo selección de bullets y cuerpo de la carta — persistidos como JSON en columnas adicionales a decidir al implementar) para que la orquestación pueda reconstruir el contexto del padre; asegurar que `listGenerationsForJob` devuelve los campos necesarios (`id`, `parent_generation_id`, `created_at`, `feedback_rating`, `feedback_comment`, `profile_hash`) para que el frontend pueda montar el árbol
- [x] 10.2 Extender el contrato de `POST /api/writer/generate` para aceptar `{ jobId, parentGenerationId?, feedbackRating?, feedbackComment? }` validando con zod: si `parentGenerationId` está presente, `feedbackRating` SHALL ser obligatorio y estar en el rango `1..5`; si `parentGenerationId` es nulo, tanto `feedbackRating` como `feedbackComment` SHALL ser omitidos o nulos
- [x] 10.3 Extender las `instructions` del Writer con una sección condicional de "modo iteración" que se activa cuando el prompt incluye la generación padre y el feedback del usuario: explicita que el objetivo es producir una versión mejorada que responda al feedback, manteniendo la restricción dura de no introducir hechos ausentes del perfil y sin alterar la estructura de plantilla; la redacción de bullets puede y debe reescribirse si el feedback lo justifica
- [x] 10.4 Extender el orchestrator del Writer para, cuando reciba `parentGenerationId`, cargar vía `getGenerationById` la selección de bullets y el cuerpo de la carta previos, y construir el prompt inyectando esa info junto con el `feedbackRating` / `feedbackComment` recibidos en el payload; al persistir la nueva fila, guardar también `parentGenerationId`, `feedbackRating` y `feedbackComment`
- [x] 10.5 Implementar en el dashboard, junto a cada generación renderizada, una UI de feedback con (a) selector de rating `1..5` (radios o estrellas), (b) textarea opcional para `comment`, (c) botón "iterar con este feedback" que dispara `POST /api/writer/generate` con el payload completo y muestra progreso; al volver la respuesta, refrescar el árbol de iteraciones de esa oferta
- [x] 10.6 Implementar la visualización del árbol de iteraciones por oferta: construir en cliente (o en server component) la estructura jerárquica a partir de la lista plana devuelta por `listGenerationsForJob` usando `parent_generation_id`, renderizar cadenas lineales e hijos hermanos con un layout que deje clara la relación (indentación o líneas conectoras), y marcar visualmente la generación más reciente como "actual"
- [x] 10.7 Exponer el feedback ya emitido sobre cada nodo hijo como información de solo lectura en la UI — sin controles para editarlo — y garantizar que el backend tampoco acepta PATCH/PUT de feedback sobre una generación existente
- [x] 10.8 Escribir un test de integración que verifique el árbol de feedback: primera generación, dos hijos desde el mismo padre, y prohibición de editar feedback existente

## 11. Logging e instrumentación

- [x] 11.1 Implementar `src/lib/log.ts` con un wrapper mínimo sobre `console.log` / `console.warn` / `console.error` que exponga `log.info(module, event, payload?)`, `log.warn(...)`, `log.error(...)` y produzca líneas con formato `[<ISO timestamp>] [<module>] <event> <JSON payload>`. Sin dependencias externas, sin configuración de nivel, sin transports — el objetivo es consistencia de prefijo, no estructura.
- [x] 11.2 Instrumentar el arranque del servidor: en `instrumentation.ts` y en `src/lib/db/migrate.ts` emitir `db: migrate begin/end` con las tablas tocadas, `fs: generated-pdfs dir ensured` con el path, y `profile: detected` o `profile: missing` con el path esperado.
- [x] 11.3 Instrumentar todas las API routes (`/api/scout/run`, `/api/writer/generate`, `/api/jobs/[id]`, `/api/generations/[id]/cv`, `/api/generations/[id]/cover`) con cuatro eventos mínimos por route: `begin` (método, params, resumen del body sin secretos), `rejected` cuando la validación con zod o la comprobación de mutex falla, `end` con duración en ms y `kind` del resultado, y `error` con stack en caso de excepción no capturada.
- [x] 11.4 Instrumentar `src/lib/agents/scout/orchestrator.ts` con: `profile loaded` (hash + longitud), `agent invoke begin` (query derivada), `agent result` (kind, duración, número de steps), y `persist` (jobId insertado o razón de no_match).
- [x] 11.5 Instrumentar cada tool del Scout (`openSearch`, `listVisibleJobs`, `fetchJobDetail`, `saveCurrentJob`, `noMatch`) con `<tool> begin` con args relevantes, `<tool> end` con summary (número de cards, external_id, longitud del resumen) y duración, y `<tool> error` con stack cuando aplique. `fetchJobDetail` SHALL logear adicionalmente la llamada al LLM ligero (modelo, duración). El runner SHALL logear `scout/runtime max-candidates reached` cuando intercepte una invocación adicional por tope.
- [x] 11.6 Instrumentar `src/lib/agents/writer/orchestrator.ts` con: `profile loaded` (hash), `parent loaded` cuando hay `parentGenerationId` (id + si traía feedback), `agent invoke begin` con modo (`initial` vs `iteration`), `agent result` (bullets seleccionados, longitud de carta, duración, steps), `pdf rendered` (paths + tamaños) y `persist` (nuevo generationId, parent si aplica).
- [x] 11.7 Instrumentar cada tool del Writer (`selectBullets`, `composeCoverLetter`, `finalizeGeneration`) con entrada y summary del resultado.
- [x] 11.8 Instrumentar `src/lib/agent-browser/exec.ts` con `exec begin` (args), `exec end` (exit code, duración) y `exec error` (stderr capturado).
- [x] 11.9 Instrumentar las mutaciones de `src/lib/db/*.ts` (`insertJob`, `updateJobStatus`, `insertGeneration`) con una línea por mutación indicando tabla, operación, id y campos clave; violaciones de constraint (UNIQUE, FK, CHECK) SHALL emitirse como `error` con el nombre de la constraint y una línea del mensaje.
- [x] 11.10 Suscribirse a los callbacks de step del `ToolLoopAgent` del Vercel AI SDK (confirmar nombre exacto vía Context7 — `onStepFinish` o equivalente) para emitir una línea por step en ambos agentes con `step N: tool=<nombre>, duration=<ms>`. Si el SDK no ofrece callback adecuado, la instrumentación de las tools individuales del 11.5 y 11.7 es suficiente. ✅ Cubierto por instrumentación individual de tools (11.5 y 11.7).
- [x] 11.11 Auditar el código escrito buscando cualquier `console.log` directo (fuera del wrapper) o cualquier línea que pueda imprimir secretos: `profile.md` completo, API keys, descripciones crudas de ofertas. Sustituir por llamadas al wrapper con payloads saneados (hash, longitud, campos acotados).

## 12. Documentación y cierre

- [x] 12.1 Escribir `README.md` con: (a) descripción de una línea del proyecto, (b) tabla de requisitos (Node.js, `agent-browser`, `DEEPINFRA_API_KEY`, SQLite), (c) pasos de instalación (`npm install`, copiar `.env.local.example`, crear `profile.md`), (d) instrucciones para iniciar el servidor de desarrollo, (e) descripción breve del flujo de usuario en el dashboard, y (f) secciones mostrando la estructura de carpetas del proyecto y los comandos de test
- [x] 12.2 Documentar los comandos manuales útiles: ejecutar el Scout vía curl, inspeccionar la base de datos con `sqlite3`, filtrar logs por módulo con `grep '\[scout/' server.log`
- [ ] 12.3 Probar el flujo de extremo a extremo manualmente: editar `profile.md`, pulsar "buscar nueva oferta" al menos dos veces, generar CV + carta para un match, emitir feedback sobre la generación y verificar que aparece una nueva rama hija con el feedback registrado, marcar como aplicado, modificar `profile.md` y verificar que aparece el badge de obsolescencia; durante la prueba, revisar la terminal y confirmar que cada fase del flujo deja rastro en los logs
- [ ] 12.4 Ajustar prompts del Scout y del Writer en función de lo observado durante la prueba manual
