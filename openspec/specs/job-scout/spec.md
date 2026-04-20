## ADDED Requirements

### Requirement: Disparo on-demand de una ejecución del Scout

El sistema SHALL exponer un endpoint local `POST /api/scout/run` que, al ser invocado, ejecute una única ronda del agente Scout de forma síncrona y devuelva al cliente un resultado estructurado indicando si se ha persistido una oferta nueva o no, con la razón correspondiente.

#### Scenario: Se persiste una oferta nueva

- **WHEN** el usuario pulsa "buscar nueva oferta" en el dashboard y la ejecución del Scout termina con un match
- **THEN** el sistema SHALL insertar una fila en `jobs` con status `shortlisted`, un `external_id` no visto previamente, y los campos `title`, `company`, `location`, `url`, `description_md`, `match_score` y `match_reason` rellenados
- **AND** el endpoint SHALL responder con `{ kind: "match", job: <objeto Job> }` y código HTTP 200

#### Scenario: Ninguna oferta supera el criterio

- **WHEN** el agente revisa candidatos hasta el límite configurado sin encontrar un match aceptable
- **THEN** el sistema SHALL NO insertar ninguna fila en `jobs`
- **AND** el endpoint SHALL responder con `{ kind: "no_match", reason: <string> }` y código HTTP 200

#### Scenario: Fallo de navegación durante la ejecución

- **WHEN** `agent-browser` falla al cargar la página de resultados o la descripción del detalle
- **THEN** el endpoint SHALL responder con `{ kind: "error", stage: <string>, message: <string> }` y código HTTP 502
- **AND** el sistema SHALL NO dejar filas parciales en `jobs`

### Requirement: Separación entre orquestación de sistema y bucle del agente

El sistema SHALL separar nítidamente dos capas en la ejecución del Scout: (1) una capa de orquestación a nivel de sistema en TypeScript plano, sin llamadas a LLM, responsable de la API route, carga del perfil, invocación del runner del agente, persistencia del resultado y respuesta HTTP; y (2) el agente Scout implementado con `ToolLoopAgent` del Vercel AI SDK (`new ToolLoopAgent({ model, instructions, tools, stopWhen })` ejecutado vía `agent.generate({ prompt })`), en cuyo reasoning-and-acting loop el LLM decide en cada step qué tool invocar hasta emitir una respuesta terminal o cumplirse la condición de parada.

#### Scenario: Secuencia esperada por ejecución

- **WHEN** se dispara una ejecución del Scout
- **THEN** la capa de orquestación de sistema SHALL ejecutar, en orden: (1) cargar `profile.md`, (2) instanciar el runner del agente Scout con las tools registradas, (3) invocar el bucle del agente, (4) recibir el `ScoutResult` estructurado al terminar, (5) persistirlo según corresponda y devolver la respuesta HTTP
- **AND** la capa de orquestación de sistema SHALL NO consultar a ningún LLM para decidir códigos de respuesta, estrategia de persistencia, manejo de errores de I/O o reintentos

#### Scenario: El LLM conduce el bucle del agente, no la orquestación de sistema

- **WHEN** el bucle del agente está en curso
- **THEN** el LLM SHALL decidir en cada step qué tool invocar entre las registradas (`openSearch`, `listVisibleJobs`, `fetchJobDetail`, `saveCurrentJob`, `noMatch`)
- **AND** el LLM SHALL NO tener acceso a capacidades fuera del conjunto explícito de tools del Scout (ni ejecución de SQL, ni escritura a disco arbitraria, ni invocación directa de APIs externas más allá de lo encapsulado por las tools)

#### Scenario: Tope de candidatos aplicado como invariante de sistema

- **WHEN** el LLM intenta invocar `fetchJobDetail` una vez que ya se ha ejecutado `SCOUT_MAX_CANDIDATES` veces en el bucle actual
- **THEN** la invocación SHALL ser bloqueada por la capa de sistema (condición de parada del bucle o rechazo explícito de la tool call)
- **AND** el tope SHALL NO depender de que el LLM "decida rendirse por sí mismo" — es un invariante del runner, no una heurística del prompt

### Requirement: Límite de candidatos por ejecución

El agente Scout SHALL procesar como máximo `SCOUT_MAX_CANDIDATES` candidatos distintos vía `fetchJobDetail` en una única ejecución, con un valor por defecto de 5.

#### Scenario: Se alcanza el límite sin match

- **WHEN** el agente ha invocado `fetchJobDetail` exactamente `SCOUT_MAX_CANDIDATES` veces sin encontrar un match aceptable
- **THEN** el agente SHALL invocar `noMatch` con una razón que indique "revisados N candidatos, ninguno cumple"
- **AND** el sistema SHALL NO permitir al agente invocar `fetchJobDetail` una vez excedido el límite

### Requirement: Tool `openSearch`

El agente Scout SHALL disponer de una tool `openSearch(query: string)` que navegue a la página pública de resultados de búsqueda de empleo de LinkedIn correspondiente a la query dada, sin requerir autenticación, y espere a que la página esté lista para ser inspeccionada.

#### Scenario: Navegación exitosa a resultados

- **WHEN** la tool se invoca con una query válida
- **THEN** el sistema SHALL ejecutar `agent-browser open <url>` seguido de `agent-browser wait --load networkidle`
- **AND** la tool SHALL resolver sin valor de retorno cuando la página esté lista

### Requirement: Tool `listVisibleJobs` con filtrado interno de ofertas ya vistas

El agente Scout SHALL disponer de una tool `listVisibleJobs()` que devuelva una lista estructurada de las ofertas visibles en la página de resultados actual, excluyendo internamente aquellas cuyo `external_id` ya existe en la tabla `jobs`. Cada entrada SHALL contener `external_id`, `url`, `title`, `company`, `location` y `snippet`.

#### Scenario: Filtrado de ya vistas

- **WHEN** la tool se invoca y la página contiene 25 tarjetas, de las cuales 7 tienen `external_id` ya presente en `jobs`
- **THEN** la tool SHALL devolver exactamente 18 entradas, ninguna de ellas con un `external_id` presente en `jobs`
- **AND** el agente SHALL NO recibir en ningún momento los `external_id` ya vistos

#### Scenario: LLM no recibe HTML crudo

- **WHEN** la tool se invoca
- **THEN** el valor devuelto al agente SHALL consistir únicamente en los campos estructurados listados, sin markup HTML en ningún campo
- **AND** la extracción interna SHALL apoyarse en el árbol de accesibilidad de `agent-browser` (`snapshot -i -u --json`), no en HTML crudo

### Requirement: Tool `fetchJobDetail` con resumen generado por LLM ligero

El agente Scout SHALL disponer de una tool `fetchJobDetail(url: string)` que navegue a la URL dada, extraiga el texto de la descripción de la oferta mediante `agent-browser`, invoque un LLM ligero para producir un resumen denso en markdown de entre 6 y 10 bullets, y devuelva al agente un objeto `JobSummary` con `url`, `external_id`, `title`, `company`, `location`, `summary_md` y `raw_len`.

#### Scenario: Resumen generado correctamente

- **WHEN** la tool se invoca con una URL válida
- **THEN** el sistema SHALL navegar a la URL, extraer el texto de la descripción, invocar al modelo ligero configurado, y devolver el `JobSummary` con `summary_md` entre 6 y 10 bullets en markdown
- **AND** `raw_len` SHALL reflejar la longitud en caracteres del texto extraído antes de resumir

#### Scenario: El detalle no carga

- **WHEN** la página de detalle no carga en un tiempo razonable o el selector de descripción no encuentra contenido
- **THEN** la tool SHALL devolver un error estructurado que el agente pueda interpretar como "este candidato no es procesable"
- **AND** esta invocación SHALL contar contra el `SCOUT_MAX_CANDIDATES` de la ejecución

### Requirement: Tool `saveCurrentJob`

El agente Scout SHALL disponer de una tool `saveCurrentJob({ score: number, reason: string })` que, tras una decisión de match, persista en la tabla `jobs` la oferta correspondiente al último `fetchJobDetail` exitoso de la ejecución, con status `shortlisted` y los campos de puntuación y razón rellenados.

#### Scenario: Persistencia idempotente

- **WHEN** la tool se invoca con un `external_id` ya presente en `jobs`
- **THEN** el sistema SHALL respetar la constraint `UNIQUE(source, external_id)` y NO crear un duplicado
- **AND** la tool SHALL señalar este caso al orquestador como condición inesperada, dado que `listVisibleJobs` debería haberla filtrado

#### Scenario: Terminación de la ejecución

- **WHEN** la tool se invoca con éxito
- **THEN** la ejecución del agente SHALL terminar sin permitir más invocaciones de tools en esa ronda

### Requirement: Tool `noMatch`

El agente Scout SHALL disponer de una tool `noMatch(reason: string)` que finalice la ejecución sin persistir ninguna oferta, registrando la razón indicada por el agente.

#### Scenario: Terminación limpia sin match

- **WHEN** el agente invoca la tool con una razón
- **THEN** el sistema SHALL NO insertar ninguna fila en `jobs`
- **AND** el orquestador SHALL devolver `{ kind: "no_match", reason }` al endpoint disparador

### Requirement: Esquema de la tabla `jobs` con dedupe idempotente

El sistema SHALL mantener una tabla `jobs` en SQLite con los campos `id` (TEXT PK), `source` (TEXT), `external_id` (TEXT), `url` (TEXT), `title` (TEXT), `company` (TEXT), `location` (TEXT), `description_md` (TEXT), `raw_snapshot` (TEXT NULL), `match_score` (REAL), `match_reason` (TEXT), `status` (TEXT con valores `new`, `shortlisted`, `applied`, `discarded`), `fetched_at` (INTEGER). SHALL existir una constraint `UNIQUE(source, external_id)`.

#### Scenario: Inserción con external_id duplicado

- **WHEN** el sistema intenta insertar una fila con un `(source, external_id)` ya existente
- **THEN** la inserción SHALL fallar a nivel de base de datos con violación de constraint única
- **AND** el error SHALL propagarse al orquestador sin corrompr el estado

#### Scenario: Estados válidos

- **WHEN** el sistema inserta o actualiza una fila
- **THEN** `status` SHALL ser exactamente uno de `new`, `shortlisted`, `applied`, `discarded`

### Requirement: LLM nunca ve HTML crudo

En todas las rutas de código donde el agente Scout o el LLM ligero de `fetchJobDetail` reciben información extraída de páginas web, esa información SHALL haber pasado previamente por `agent-browser` (árbol de accesibilidad o `get text`) y SHALL estar libre de markup HTML.

#### Scenario: Auditoría de las tool responses

- **WHEN** se revisa cualquier valor devuelto al agente por las tools `listVisibleJobs` o `fetchJobDetail`
- **THEN** ninguno de los campos SHALL contener elementos HTML, atributos ni selectores CSS crudos
