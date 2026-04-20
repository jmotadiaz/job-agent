## Context

`job-agent` es un proyecto greenfield que corre exclusivamente en la máquina local del usuario. El objetivo inmediato es cubrir un flujo extremo a extremo (búsqueda → revisión → generación de CV → descarga → cambio de estado) con la menor superficie posible, reservando deliberadamente optimizaciones y features "potentes pero no esenciales" para una fase 2 documentada.

Restricciones relevantes:

- **Local-only**: no hay despliegue en cloud ni infraestructura compartida. La única credencial sensible es una API key del proveedor de LLM.
- **LinkedIn público**: una prueba manual del usuario ha confirmado que la búsqueda de ofertas funciona sin login. Esto se mantiene como punto de partida; `--session-name` de `agent-browser` queda reservado como escape hatch si en el futuro LinkedIn endurece el acceso.
- **Perfil privado**: el contenido que alimenta al Scout y al Writer (experiencia, preferencias de búsqueda, bullets de CV) vive en un `profile.md` gitignored en la raíz del repo. Nunca se commitea y nunca sale de la máquina salvo como parte de prompts hacia el proveedor de LLM.
- **Disparo on-demand en MVP**: en lugar de un scheduler, las ejecuciones del Scout se inician explícitamente desde el dashboard. Esto hace cada ejecución directamente observable y simplifica la iteración sobre prompts y tools. El scheduler automático se añadirá en fase 2.

## Goals / Non-Goals

**Goals**

- Producir una arquitectura donde cada ejecución del Scout tenga un resultado binario auditable: **una oferta nueva persistida**, o **no_match** con una razón explícita.
- Separar nítidamente dos capas: **orquestación a nivel de sistema** (la API route de Next.js, la carga de `profile.md`, la invocación del runner del agente, el manejo de errores, la persistencia final del resultado y la respuesta HTTP) escrita en TypeScript plano sin intervención de LLM; y **bucle del agente** (el Scout propiamente dicho, implementado con el agent loop multi-step del Vercel AI SDK vía `ToolLoopAgent` + `stopWhen`) donde el LLM conduce la exploración decidiendo en cada step qué tool invocar. El LLM aparece como conductor del bucle del Scout, como generador dentro del Writer, y excepcionalmente como resumidor ligero dentro de la implementación de la tool `fetchJobDetail`. El LLM nunca toma decisiones a nivel de sistema (si responder 200 o 502, si commitear o revertir una transacción, si relanzar una ejecución, etc.).
- Garantizar que el agente **nunca ve HTML crudo**. Toda la información web llega estructurada (árbol de accesibilidad, JSON, o resumen en markdown) gracias a `agent-browser`.
- Idempotencia a nivel de datos: ejecutar el Scout dos veces con la misma página de resultados no crea duplicados ni requiere lógica de aplicación especial — la constraint `UNIQUE(source, external_id)` lo fuerza a nivel de DB.
- Trazabilidad entre perfil y generaciones: una generación de CV producida contra `profile.md` v1 debe poder detectarse como "stale" cuando `profile.md` cambia, sin comparar contenidos a mano.

**Non-Goals**

- Scheduler automático del Scout (fase 2).
- Prefiltrado con embeddings o ranking híbrido (fase 2).
- Múltiples queries de búsqueda en paralelo (fase 2).
- Login autenticado en LinkedIn con sesión persistente (fase 2).
- Fuentes de empleo distintas de LinkedIn (fase 2).
- Despliegue remoto, multi-usuario, o aislamiento por usuario.

## Decisions

### 1. Dos capas: orquestación de sistema determinista + bucle de agente dirigido por LLM

**Decisión:** La ejecución del Scout se estructura en dos capas separadas:

- **Capa de sistema (TypeScript puro, sin LLM)**: la API route `POST /api/scout/run` carga `profile.md`, instancia el runner del agente, recibe el resultado estructurado, lo persiste en SQLite si procede, y devuelve una respuesta HTTP. En esta capa se resuelven errores de I/O, contratos del endpoint, mutex de ejecución simultánea, y el tope duro de steps. Ningún LLM toma decisiones aquí.

- **Capa de bucle del agente (Vercel AI SDK, dirigido por LLM)**: tanto el Scout como el Writer se implementan instanciando un `ToolLoopAgent` del Vercel AI SDK (`new ToolLoopAgent({ model, instructions, tools, stopWhen })`) y ejecutándolo vía `agent.generate({ prompt })`. El `ToolLoopAgent` gestiona internamente el reasoning-and-acting loop multi-step: en cada step el LLM decide qué tool invocar, el SDK ejecuta la tool (que es código TypeScript plano) y le devuelve el resultado al LLM, y el bucle continúa hasta que el LLM emite una respuesta final (expresada como invocación de una tool terminal, p. ej. `saveCurrentJob` o `noMatch` en el Scout) o se cumple la condición `stopWhen`. El LLM conduce la exploración dentro del bucle.

**Alternativa considerada:** Una sola capa LLM que además de dirigir el bucle del agente también tome decisiones a nivel de sistema — p. ej. un prompt que decida si persistir o no, qué código HTTP devolver, si reintentar tras un error, o incluso que escriba directamente en SQLite con una tool "writeSQL".

**Por qué se descarta:** Los contratos a nivel de sistema (idempotencia, códigos HTTP, integridad transaccional, manejo de errores de I/O) no son tareas de juicio — son invariantes que deben cumplirse deterministamente y ser testeables con unit tests triviales. Dar esas decisiones a un LLM añade tokens, latencia, y una superficie enorme de bugs sutiles (el LLM devuelve un HTTP 200 cuando debería ser 502; el LLM "olvida" persistir; el LLM genera SQL con sintaxis ambigua). En cambio, el bucle del agente **sí** es una tarea de juicio (qué candidato merece ser explorado, qué oferta encaja con el perfil) y ahí el LLM aporta valor real. Separar ambas capas permite optimizar cada una en sus propios términos: la capa de sistema se testea con unit tests; el bucle del agente se itera afinando prompts y observando trazas.

**Consecuencia concreta para `stopWhen`:** el tope de 5 candidatos (ver decisión 4) se codifica como un invariante del sistema sobre cuántas veces puede ejecutarse la tool `fetchJobDetail` durante el bucle del `ToolLoopAgent`, **no** como un simple `isStepCount(N)`. Se implementa combinando `isLoopFinished()` (para permitir al LLM rendirse de forma natural emitiendo `noMatch` o `saveCurrentJob`) con un contador en el runner que intercepta o rechaza invocaciones adicionales de `fetchJobDetail` una vez alcanzado el tope. De esa forma el tope es un invariante del sistema, no una heurística que el LLM pudiera ignorar.

### 2. Un solo agente Scout por ejecución, sin fan-out

**Decisión:** Cada disparo del Scout lanza exactamente **una** instancia del agente Scout. Esa instancia tiene acceso a sus tools, decide una oferta (o `no_match`), y termina. No hay sub-agentes, ni paralelismo entre candidatos, ni colas.

**Alternativa considerada:** Fan-out donde un "Discovery" agente lista candidatas y N "Extraction" agentes las procesan en paralelo con contextos limpios.

**Por qué se descarta:** El fan-out era interesante para volumen (procesar muchas ofertas por ejecución) pero contradice el modelo "una ejecución = una oferta". Con el modelo actual, el contexto del Scout se mantiene naturalmente pequeño: ve una lista de ~25 tarjetas ya resumidas por la tool, y luego como mucho 5 resúmenes densos de detalles. No hay presión de contexto que justifique fan-out.

### 3. Filtrado de ofertas ya vistas dentro de `listVisibleJobs`, no como tool explícita

**Decisión:** La tool `listVisibleJobs` consulta SQLite internamente y devuelve al agente solo tarjetas cuyo `external_id` no está ya presente en la tabla `jobs`. El agente nunca ve IDs ya conocidos.

**Alternativa considerada (descartada durante la exploración):** Pasar la lista completa de IDs ya vistos en el prompt del sistema del agente. Rechazado porque con el paso del tiempo el prompt crece sin límite.

**Alternativa también considerada:** Una tool separada `isAlreadySeen(id)` que el agente llama candidato por candidato. Rechazada porque añade turnos del agente sin ganar nada — el agente no tiene ningún razonamiento útil que hacer sobre IDs ya procesados; son ruido puro que debe desaparecer antes de que llegue al contexto.

**Riesgo aceptado:** Si en fase 2 queremos "reevaluar ofertas ya vistas cuando el perfil cambia", habrá que añadir un parámetro opcional `includeSeen` a la misma tool. Cambio compatible.

### 4. Límite de 5 candidatos por ejecución

**Decisión:** El Scout procesa como máximo 5 candidatos distintos vía `fetchJobDetail` antes de rendirse con `noMatch`. Valor en config (`SCOUT_MAX_CANDIDATES`), comentado para explicar el porqué.

**Razonamiento:**

- LinkedIn muestra ~25 tarjetas por página; 5 es el 20% — suficiente para cubrir las mejores según su orden de relevancia, insuficiente para convertirse en un barrido exhaustivo.
- Cada `fetchJobDetail` incluye una llamada a un LLM ligero (llama-3.1-8b-instant o similar) para resumir el detalle. A precios actuales son céntimos por ejecución aunque agote el límite.
- Si empíricamente resulta corto (muchos `noMatch` con razón "revisé 5, ninguna cumple"), subir el valor es trivial y no requiere rediseño.

### 5. `agent-browser` como subprocess con `--json`

**Decisión:** La integración con `agent-browser` se hace invocándolo como subprocess (`child_process.execFile` o equivalente) pasando siempre `--json`, y parseando la respuesta JSON. No se usa la API programática `BrowserManager` en el MVP.

**Alternativa considerada:** Usar directamente `BrowserManager` de la API TypeScript de agent-browser.

**Por qué se descarta (para el MVP):** La documentación pública de `agent-browser` vende explícitamente el modo "agent-first output format" basado en CLI con `--json`. Es la superficie más documentada, más estable y más fácil de depurar (los mismos comandos se pueden ejecutar a mano en un terminal para reproducir un fallo). `BrowserManager` parece orientado a casos de streaming e inyección de eventos, fuera de nuestro alcance. Migrar a la API programática es una optimización trivial si en algún momento el overhead del subprocess resulta medible.

### 6. Los refs del árbol de accesibilidad no cruzan navegaciones — identidad = URL canónica

**Decisión:** Los refs de agent-browser (`@e1`, `@e2`…) se usan **solo dentro de una misma página**. Entre páginas, la identidad estable de cada oferta es su **URL canónica de LinkedIn** (`/jobs/view/<id>` o equivalente), que se extrae en `listVisibleJobs` y se usa como input de `fetchJobDetail`.

**Por qué importa:** La documentación de agent-browser es explícita en que los refs se invalidan al navegar. Si el Scout pudiera "volver a la página de resultados para probar otra candidata" dependiendo de refs viejos, se rompería. En lugar de eso, el Scout navega directamente a la URL del siguiente candidato — nunca usa botones "atrás", y nunca asume que un ref sobrevive una navegación.

### 7. `fetchJobDetail` lleva un LLM ligero interno para resumen denso

**Decisión:** La tool `fetchJobDetail(url)` internamente (a) navega a `url`, (b) usa `agent-browser get text` para traer el texto de la descripción de la oferta, (c) llama a un modelo ligero (llama-3.1-8b-instant) con un prompt de resumen apretado, y (d) devuelve al agente un `JobSummary` con 6-10 bullets en markdown más metadatos (título, empresa, ubicación, URL, longitud del texto original).

**Por qué:** El agente Scout juzga sobre señal densa, no sobre descripciones crudas de 3000 palabras que inflan su contexto y diluyen el juicio. El resumen actúa como un filtro semántico barato antes del juicio propiamente dicho. Además, si el resumen falla estructuralmente (p. ej. el detalle no cargó), la tool devuelve un error claro y el Scout pasa al siguiente candidato sin consumir un turno de razonamiento envenenado.

### 8. Writer con plantilla React-PDF fija y adaptación de redacción acotada por el perfil

**Decisión:** El Writer recibe una oferta persistida y el `profile.md` actual, y produce dos PDFs (CV + carta) rellenando una plantilla React-PDF fija. El LLM elige qué bullets del perfil incluir, en qué orden, y **puede reescribir su redacción** (tono, verbos, keywords, énfasis) para adaptar el CV al puesto concreto. Lo que el LLM NO puede hacer bajo ninguna circunstancia es introducir hechos ausentes del perfil: tecnologías, títulos, empresas, duraciones o logros que no aparezcan en `profile.md`. La carta de presentación sigue el mismo principio — redacción libre, pero apoyada exclusivamente en hechos presentes en el perfil y la descripción de la oferta. La estructura de la plantilla (secciones, layout, tipografía, orden de secciones) permanece fija y NO es controlada por el LLM.

**Alternativa considerada:** Literalidad estricta — el LLM solo selecciona y reordena bullets sin reescribir texto, preservando la forma literal del perfil.

**Por qué se descarta:** Demasiado rígido. Un mismo bullet del perfil describe experiencia genérica que rinde poco ante filtros ATS y ante recruiters sin adaptación al puesto concreto (verbos, keywords específicos, orden de conceptos dentro del propio bullet). Obligar a literalidad deja al Writer como una herramienta de formato y selección, no de adaptación real — y entonces no merece el nombre de "Writer". El riesgo que justificaba la literalidad (embellecimiento: que el LLM invente tecnologías, exagere duraciones, atribuya logros) se ataca directamente con una restricción dura en las `instructions` del Writer ("apóyate exclusivamente en hechos presentes en el perfil y la descripción de la oferta; no inventes tecnologías, logros, títulos, duraciones ni empresas"), replicada como invariante en los tests de integración del Writer y, como última salvaguarda, reforzada por la revisión humana del PDF antes de enviar la candidatura.

**Consecuencia:** el `feedbackComment` del loop human-in-the-loop gana peso como mecanismo de corrección barato cuando el usuario detecta una redacción que no le encaja. La iteración sustituye a la literalidad como válvula frente a una primera toma floja.

### 9. `profile_hash` como SHA-1 del `profile.md` en el momento de generar

**Decisión:** Cada registro en `generations` guarda el SHA-1 del contenido de `profile.md` usado para producir esos PDFs. El dashboard compara ese hash contra el hash actual de `profile.md` y muestra un badge "perfil cambió — regenerar" cuando difieren.

**Por qué SHA-1 y no timestamps:** Timestamps son frágiles (se editó sin cambiar contenido, `git checkout` resetea mtime, etc.). SHA-1 del contenido es semántico: si el contenido es bit-a-bit idéntico, no hay cambio. SHA-1 es más que suficiente para integridad no-criptográfica, y el valor se usa solo como identificador de equivalencia.

### 10. Disparo del Scout on-demand vía API route de Next.js (MVP)

**Decisión:** El dashboard tiene un botón "buscar nueva oferta" que llama a `POST /api/scout/run`. El handler de esa route ejecuta el orquestador del Scout de forma síncrona y devuelve el resultado (`match` con el job creado, o `no_match` con razón). Mientras corre, el dashboard muestra un indicador de progreso.

**Alternativa considerada:** Job queue asíncrona (BullMQ, incluso una cola in-memory) con polling del estado desde el dashboard.

**Por qué se descarta (para el MVP):** Una ejecución típica del Scout dura pocos segundos — un par de navegaciones, una lista, 1-5 resúmenes con llama-3.1-8b-instant, una decisión, una escritura a SQLite. Es perfectamente tolerable como llamada síncrona. Introducir una cola añade complejidad (worker, estado, reconexión, UI de progreso real) a cambio de capacidades que el MVP no necesita. Si en fase 2 el scheduler automático entra en juego, ahí sí puede tener sentido una cola, pero se introduce cuando se necesita.

### 11. Feedback human-in-the-loop: emitir feedback = crear una rama nueva

**Decisión:** El dashboard permite al usuario emitir, sobre cualquier generación existente, un feedback compuesto por un `rating` en escala `1..5` y un `comment` libre opcional. **Emitir feedback es crear una nueva rama hija** — no son dos actos separados. La emisión dispara una ejecución del Writer sobre la misma oferta que produce una nueva fila en `generations` cuyo `parent_generation_id` apunta a la generación sobre la que se emitió el feedback, y cuyos campos `feedback_rating` / `feedback_comment` registran el feedback que motivó esa iteración. El feedback es **inmutable**: una vez emitido, no se edita. Emitir feedback "otra vez" sobre la misma generación padre crea simplemente otra rama hermana, con su propio feedback. No existe tope de iteraciones: el usuario puede iterar tantas veces como quiera. La bifurcación puede partir de cualquier generación previa de la oferta, no solo de la más reciente — el historial es un árbol, no una lista.

**Forma concreta del flujo:** La capa de orquestación del Writer (TypeScript determinista, sin LLM) recibe como input `{ jobId, parentGenerationId?, feedbackRating?, feedbackComment? }`. Cuando `parentGenerationId` está presente, la orquestación carga de SQLite la fila de la generación padre (bullets seleccionados, cuerpo de la carta previo), la inyecta en el prompt junto con la oferta, el perfil y el feedback recibido como parámetro, e invoca `agent.generate({ prompt })`. Al terminar el bucle del agente, la orquestación inserta la nueva fila en `generations` con `parent_generation_id`, `feedback_rating` y `feedback_comment` poblados. El system prompt del Writer incluye una instrucción condicional para el modo iteración: "recibes la generación anterior y el feedback del usuario; tu objetivo es producir una versión mejorada que responda al feedback, manteniendo la restricción dura de no introducir hechos ausentes del perfil y sin alterar la estructura fija de la plantilla; la redacción de los bullets puede y debe cambiar si el feedback lo justifica".

**Alternativa considerada (1):** Separar "emitir feedback" en un `PATCH /api/generations/[id]/feedback` previo a "disparar iteración" con `POST /api/writer/generate`, persistiendo el feedback en la fila padre como metadata editable.

**Por qué se descarta:** Añade un paso intermedio que el MVP no necesita, introduce una operación de edición de feedback que el usuario no ha pedido, y obliga a resolver dónde vive el feedback cuando del mismo padre cuelgan múltiples ramas (necesitaría una tabla `feedback` aparte o sobrescribir). Colapsar ambos actos en uno — "emitir feedback crea la rama" — elimina todas esas preguntas: el feedback es inmutable, vive en la hija que lo consumió como input, y múltiples feedbacks sobre el mismo padre producen múltiples hermanas cada una con su propio feedback. Coherente con el tono MVP del resto del diseño.

**Alternativa considerada (2):** Dar al Writer una nueva tool `getPreviousGeneration(generationId)` que internamente lea de SQLite y devuelva el contenido de la generación padre al LLM bajo demanda.

**Por qué se descarta:** Es sobreingeniería. La orquestación **ya sabe** qué generación es la padre — viene como parámetro explícito del endpoint. No hay ninguna decisión que delegar al LLM sobre "qué generación consultar". Añadir una tool introduce: (a) un turno extra de tool-call innecesario, (b) superficie para que el LLM invoque la tool con el ID equivocado o no la invoque, (c) una ruta de acceso a datos desde el bucle del agente que contradice la decisión 1 (el LLM no toma decisiones de sistema, y leer filas de SQLite para alimentar el propio prompt es precisamente una decisión de sistema). Consistente con el principio: "la orquestación carga datos; el prompt los entrega; el LLM juzga".

**Bifurcación desde cualquier nodo:** `parent_generation_id` es un puntero a la generación de partida elegida por el usuario, no necesariamente la última. El dashboard expone el árbol de iteraciones por oferta, y desde cualquier nodo se puede emitir feedback que — como hemos dicho — es el mismo acto que crear una nueva rama hija. Esto permite al usuario explorar caminos alternativos si una iteración empeoró el resultado, volver a un nodo anterior más prometedor y continuar desde ahí. A nivel de datos, esto "cae gratis" con un único campo nullable — no requiere lógica especial; la identidad de cada nodo es su `id` y la relación es puramente de grafo.

**Sin tope de iteraciones:** no se codifica ningún `MAX_ITERATIONS`. La señal natural de parada es el usuario decidiendo que el resultado le vale (y cambiando el status de la oferta a `applied`) o descartando la oferta. El coste marginal de cada iteración es una llamada al LLM del Writer y un par de PDFs en disco — nada que justifique un tope artificial.

**Consecuencia para el esquema:** la tabla `generations` gana tres columnas: `parent_generation_id TEXT NULL` (FK a `generations.id`), `feedback_rating INTEGER NULL CHECK (feedback_rating BETWEEN 1 AND 5)`, `feedback_comment TEXT NULL`. Estos campos viven en la fila de **la hija** (no en el padre), porque semánticamente representan el input que motivó *esta* iteración. La generación raíz de cada oferta (la primera, sin padre) tiene los tres campos a NULL. Invariante: `parent_generation_id IS NULL ⇔ feedback_rating IS NULL` — si una fila tiene padre, necesariamente tiene feedback; si no tiene padre, no tiene feedback.

### 12. Logging con `console.log` y puntos de instrumentación exhaustivos

**Decisión:** La observabilidad del MVP se construye con `console.log` / `console.warn` / `console.error` sobre stdout/stderr del proceso Next.js, sin Pino, Winston, OpenTelemetry ni logger estructurado de ningún tipo. Para garantizar un formato consistente, se introduce un wrapper trivial `src/lib/log.ts` que expone `log.info(module, event, payload?)`, `log.warn(...)`, `log.error(...)` y produce líneas con formato `[<ISO timestamp>] [<module>] <event> <JSON payload>`. El `module` es un string corto (p. ej. `scout/orchestrator`, `writer/agent`, `db`, `agent-browser`, `api/scout/run`) que permite filtrar con `grep` al revisar ejecuciones. En MVP **preferimos pecar de exceso**: cada transición relevante se logea, aunque eso produzca bastante ruido; es trivial silenciar módulos después si hace falta, y mucho más doloroso añadir logs a posteriori al investigar un incidente.

**Alternativa considerada:** Integrar un logger estructurado (Pino, Winston) desde el principio.

**Por qué se descarta:** Añade una dependencia, una curva de configuración y una capa de indirección para un beneficio que en MVP local no cobra: no hay ingest, no hay dashboards, no hay correlación multi-servicio. `console.log` se lee a ojo en la terminal del servidor de dev y se redirecciona trivialmente a un fichero si hace falta. La estructura que realmente aporta valor (módulo + evento + payload) la da el wrapper de 20 líneas. Migrar a Pino es mecánico el día que duela.

**Qué se logea — puntos de instrumentación obligatorios:**

Por capa, cada punto SHALL producir al menos una línea de log. Los logs de error SHALL incluir el stack si aplica.

- **Inicio del servidor (`instrumentation.ts`, `src/lib/db/migrate.ts`)**
  - `db: migrate begin/end`, tablas creadas o verificadas
  - `fs: generated-pdfs dir ensured` (path)
  - `profile: detected` / `profile: missing` (path)

- **API routes (`src/app/api/**/route.ts`)**
  - Entrada: `<route> begin` con método, params y un resumen del body (sin secretos)
  - Rechazo por validación: `<route> rejected: validation` con el detalle de zod
  - Rechazo por mutex (scout en curso): `scout/run rejected: already running`
  - Salida de éxito: `<route> end` con duración en ms y `kind` del resultado
  - Excepción no capturada: `<route> error` con el stack

- **Orchestrator del Scout (`src/lib/agents/scout/orchestrator.ts`)**
  - `scout/orchestrator profile loaded` (hash + longitud)
  - `scout/orchestrator agent invoke begin` (query derivada)
  - `scout/orchestrator agent result` (kind, duración, número de steps)
  - `scout/orchestrator persist` (jobId insertado o razón de no_match)

- **Tools del Scout (cada una en `src/lib/agents/scout/tools/*.ts`)**
  - Cada invocación: `scout/tool <nombre> begin` con args relevantes
  - Cada resultado: `scout/tool <nombre> end` con un summary (número de cards, longitud del resumen, `external_id` seleccionado, etc.) y duración
  - Cada error: `scout/tool <nombre> error` con el stack
  - `fetchJobDetail` además SHALL logear la llamada al LLM ligero (modelo, duración)
  - Enforcement del tope: `scout/runtime max-candidates reached` cuando el runner intercepta una invocación adicional

- **Orchestrator del Writer (`src/lib/agents/writer/orchestrator.ts`)**
  - `writer/orchestrator profile loaded` (hash)
  - `writer/orchestrator parent loaded` cuando hay `parentGenerationId` (id + si tenía feedback)
  - `writer/orchestrator agent invoke begin` (modo: `initial` vs `iteration`)
  - `writer/orchestrator agent result` (número de bullets seleccionados, longitud de la carta, duración, steps)
  - `writer/orchestrator pdf rendered` (paths + tamaños en bytes)
  - `writer/orchestrator persist` (nuevo generationId, parent si aplica)

- **Tools del Writer**
  - `writer/tool selectBullets` con número e IDs seleccionados
  - `writer/tool composeCoverLetter` con número de párrafos y longitud total
  - `writer/tool finalizeGeneration`

- **Capa de agent-browser (`src/lib/agent-browser/exec.ts`)**
  - Cada invocación: `agent-browser exec begin` con los args pasados (sin URLs sensibles recortadas — las URLs públicas de LinkedIn son OK)
  - Cada salida: `agent-browser exec end` con exit code, duración
  - Cada fallo: `agent-browser exec error` con stderr capturado

- **Capa de datos (`src/lib/db/*.ts`)**
  - Cada mutación: `db <tabla> <op>` (`insertJob`, `updateJobStatus`, `insertGeneration`) con los campos clave (id, status, parentId, etc.)
  - Errores de constraint: `db constraint violation` con nombre de la constraint y una línea del error
  - Las SELECT rutinarias NO se logean (demasiado ruido); solo los SELECT que devuelven 0 resultados cuando se esperaba al menos uno (p. ej. `getJobById` con id inexistente) SHALL logearse como `warn`

- **Llamadas al LLM (centralizadas si es posible, o repetidas en cada agente)**
  - Cada llamada: `llm call` con modelo, tokens in/out (si los expone el SDK), duración
  - Error del proveedor: `llm error` con status y mensaje

**Qué NO se logea:**

- Contenido completo de `profile.md` (puede contener datos sensibles del usuario). Solo el hash SHA-1 y la longitud en caracteres.
- API keys del proveedor de LLM (bajo ninguna circunstancia; incluido accidentalmente vía un payload que se imprima crudo).
- Contenido completo de la descripción de una oferta (típicamente miles de caracteres). Solo título, empresa, URL, longitud, y los 6-10 bullets del resumen ya producido por `fetchJobDetail`.
- El cuerpo completo del PDF generado. Solo los paths y tamaños.

**Niveles:** `info` para flujo nominal, `warn` para condiciones inesperadas recuperables (no_match, 0 resultados, mutex ocupado), `error` para excepciones y fallos. En MVP no se configura filtrado por nivel — todos van a la terminal.

**Consecuencia para la orquestación vs el bucle del agente:** los puntos de log de la capa de sistema son **obligatorios** y se instrumentan directamente en TypeScript. Los puntos de log dentro del bucle del `ToolLoopAgent` se obtienen instrumentando cada implementación de tool (que es código TypeScript plano que ejecutamos nosotros) y, donde el Vercel AI SDK lo ofrezca, suscribiéndose a sus callbacks de step (`onStepFinish` o equivalente — **confirmar con Context7 al implementar**) para emitir una línea por step con el nombre de la tool invocada y la duración.

## Risks / Trade-offs

- **[LinkedIn endurece el acceso público]** → Mitigación: `--session-name` de agent-browser queda documentado como escape hatch. Requiere crear una cuenta auxiliar y hacer un login headful manual una sola vez. El diseño de las tools no asume autenticación, por lo que añadirla es aditivo (no rediseño).
- **[Cambios en el DOM de LinkedIn rompen `listVisibleJobs`]** → Mitigación: la tool centraliza la extracción en un único lugar y usa selectores del árbol de accesibilidad, que son más estables que selectores CSS. Cuando rompa, el error será claro (`listVisibleJobs` devuelve 0 tarjetas o falla al parsear) y el arreglo es localizado.
- **[El agente elige un match que resulta decepcionante al leer descripción completa]** → Mitigación aceptada en el MVP: se guarda igual y el usuario descarta en el dashboard. Los descartes sirven como señal para afinar el prompt del juicio. Re-juicio post-extracción queda reservado para fase 2 si el ratio de descartes es alto.
- **[La llamada síncrona del dashboard al Scout excede un timeout razonable]** → Mitigación: límite de 5 candidatos por ejecución, `wait --load networkidle` con timeout, y cancelación explícita si el subprocess de agent-browser se cuelga. Si pasa a ser un problema recurrente, migrar a ejecución en background es mecánico.
- **[El Writer omite bullets importantes porque el LLM no los consideró relevantes]** → Mitigación: el usuario puede editar `profile.md` para enfatizar, reordenar o etiquetar bullets, y regenerar. El `profile_hash` hace visible la obsolescencia. Como refuerzo adicional, el loop human-in-the-loop (feedback + iteración) permite pedir explícitamente la inclusión de un bullet omitido en la siguiente rama sin tener que tocar el perfil.
- **[El LLM inventa hechos al adaptar la redacción del CV al puesto — tecnologías, duraciones, logros, títulos ausentes del perfil]** → Mitigación en tres capas: (a) restricción dura y explícita en las `instructions` del Writer prohibiendo la invención; (b) un test de integración que verifique, sobre un `profile.md` fixture y una oferta con requisitos deliberadamente ajenos al perfil, que ninguna entidad factual del PDF es ajena al perfil; (c) la revisión humana del PDF antes de enviar la candidatura como última salvaguarda. Este riesgo es el precio de permitir adaptación de redacción y se acepta deliberadamente tras rechazar la literalidad estricta (ver decisión 8).
- **[`profile.md` se trata como un único bloque y hasheamos todo el fichero]** → Trade-off aceptado: cambios triviales (typos, reformateos) invalidan todas las generaciones previas. Consecuencia aceptable a cambio de una regla de equivalencia simple. Fase 2 podría hashear secciones independientes si el coste de regeneración se vuelve molesto.
- **[`better-sqlite3` es síncrono y bloquea el event loop en queries largas]** → Mitigación: las queries de este sistema son triviales (SELECT por índice único, INSERT con UNIQUE, SELECT ordenado con filtros simples). El tamaño de la tabla `jobs` es del orden de cientos, no millones. Es un trade-off deliberado: la API síncrona elimina clases enteras de bugs de concurrencia.
- **[Acumulación de PDFs en `generated-pdfs/` por iteraciones sin tope]** → Trade-off aceptado: cada iteración del Writer escribe dos PDFs nuevos y no se borra nada automáticamente. A escala local (una sola persona, pocas ofertas activas) el crecimiento es despreciable; la política de limpieza queda fuera del MVP y puede añadirse como un barrido manual o una job de housekeeping en fase 2 si se vuelve molesto.
- **[El usuario bifurca desde un nodo intermedio y pierde de vista qué rama está "viva"]** → Mitigación: el dashboard muestra el árbol de iteraciones por oferta y marca explícitamente cuál es la generación "actual" (la última seleccionada / descargada). La ramificación es una capacidad deliberada, no un accidente; el coste cognitivo de entender "hay varias versiones" se paga a cambio de poder volver atrás sin perder trabajo previo.

## Convenciones de implementación (vinculantes en `/opsx:apply`)

Estas tres reglas están detalladas en el preámbulo de `tasks.md` y son obligatorias durante la fase de implementación. Se listan aquí para que cualquier lectura del design las descubra:

1. **Inicialización**: `npx create-next-app@latest . --yes` ejecutado en la raíz del repo. Sin plantillas alternativas, sin scaffolding manual.
2. **Instalación de dependencias**: siempre vía `npm install ${name}` (o `-D` para dev), sin fijar versiones. Prohibido editar `package.json` a mano para añadir dependencias.
3. **Documentación de librerías**: antes de escribir código contra cualquier librería externa, consultar Context7 (`mcp__context7__resolve-library-id` + `mcp__context7__query-docs`) para asegurar el uso de APIs actuales. Aplica también a librerías "conocidas" — el knowledge cutoff puede dejar fuera cambios recientes.

## Migration Plan

No aplica — proyecto greenfield sin datos preexistentes ni usuarios en producción. El "despliegue" es `npx create-next-app@latest . --yes` + las instalaciones individuales de las dependencias listadas en `tasks.md`, más la primera edición manual de `profile.md`.

## Open Questions

- **Modelo concreto para el resumen dentro de `fetchJobDetail`**: llama-3.1-8b-instant 4.5 es la asunción razonable (barato, rápido, suficiente para comprimir una descripción). Se confirmará al implementar.
- **Modelo concreto para el agente Scout y para el Writer**: probablemente Sonnet 4.6 para ambos (calidad de juicio y de generación). Se confirmará al implementar en función de coste real observado tras algunas ejecuciones.
- **Parámetros exactos de la URL de búsqueda de LinkedIn**: qué filtros (ubicación, remoto, nivel) se codifican en la URL y cuáles se dejan al LLM. Decisión que se cerrará escribiendo `profile.md` e iterando contra el comportamiento observado.
- **Formato de la plantilla React-PDF**: estructura concreta del CV y de la carta (secciones, tipografía, orden). Decisión de diseño visual que no afecta a la arquitectura y se resolverá durante la implementación del Writer.
