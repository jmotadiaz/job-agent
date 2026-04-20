## ADDED Requirements

### Requirement: Generación bajo demanda de CV y carta de presentación

El sistema SHALL exponer un endpoint local `POST /api/writer/generate` que, dado un `jobId` existente en la tabla `jobs` y opcionalmente un `parentGenerationId` existente en la tabla `generations`, produzca un PDF de CV y un PDF de carta de presentación adaptados a esa oferta usando el contenido actual de `profile.md`. Cuando `parentGenerationId` se omite, la invocación se considera una generación inicial (o una regeneración desligada del historial de feedback). Cuando se proporciona, la invocación se considera una iteración guiada por el feedback registrado sobre esa generación padre (ver Requirement "Iteración del Writer guiada por feedback humano").

#### Scenario: Generación exitosa sin padre

- **WHEN** el endpoint se invoca con un `jobId` válido, `profile.md` presente y sin `parentGenerationId`
- **THEN** el sistema SHALL producir dos ficheros PDF (CV y carta), los SHALL almacenar en disco bajo un directorio local dedicado, y SHALL insertar una fila en la tabla `generations` con `job_id`, `profile_hash`, `cv_path`, `cover_path`, `created_at` y `parent_generation_id = NULL`
- **AND** el endpoint SHALL responder con `{ generationId, cvUrl, coverUrl }`

#### Scenario: `jobId` inexistente

- **WHEN** el endpoint se invoca con un `jobId` que no existe en `jobs`
- **THEN** el endpoint SHALL responder con código HTTP 404 y un mensaje claro
- **AND** el sistema SHALL NO crear ficheros ni filas

#### Scenario: `profile.md` ausente

- **WHEN** el endpoint se invoca y `profile.md` no existe en la ubicación esperada
- **THEN** el endpoint SHALL responder con código HTTP 400 y un mensaje indicando que el perfil es requerido
- **AND** el sistema SHALL NO crear ficheros ni filas

### Requirement: Plantilla React-PDF fija

El Writer SHALL usar una plantilla React-PDF fija definida en el código del proyecto, sin plantillas dinámicas por oferta ni personalización de layout controlada por el LLM. La estructura de secciones del CV y el layout de la carta SHALL ser constantes entre generaciones.

#### Scenario: Determinismo estructural

- **WHEN** se generan dos PDFs para dos ofertas distintas usando el mismo `profile.md`
- **THEN** la estructura de secciones, tipografía y layout del CV SHALL ser idéntica entre ambas generaciones
- **AND** las diferencias SHALL residir únicamente en el contenido textual dentro de secciones

### Requirement: Writer implementado como `ToolLoopAgent` del Vercel AI SDK

El agente Writer SHALL implementarse con `ToolLoopAgent` del Vercel AI SDK, instanciado con `model`, `instructions`, el conjunto de `tools` propio del Writer y una condición `stopWhen`, y ejecutado vía `agent.generate({ prompt })`. El Writer SHALL NOT implementarse como llamadas sueltas a `generateText` ni como código ad-hoc fuera del framework de agentes.

#### Scenario: Invocación del agente Writer

- **WHEN** la capa de orquestación del Writer dispara una generación
- **THEN** el sistema SHALL instanciar (o reutilizar) un `ToolLoopAgent` con las tools del Writer registradas
- **AND** SHALL invocar `agent.generate({ prompt })` con un prompt que referencia la oferta y el perfil
- **AND** SHALL recibir el resultado del bucle y proceder con la renderización de PDFs en la capa de sistema

### Requirement: Selección, reordenación y adaptación de redacción de bullets

El LLM del Writer SHALL decidir qué bullets del `profile.md` incluir y en qué orden, y PUEDE adaptar la redacción de cada bullet (tono, verbos, keywords, énfasis) para encajar con la oferta concreta. Todo bullet renderizado en el PDF SHALL apoyarse exclusivamente en hechos presentes en `profile.md`: el LLM SHALL NOT introducir tecnologías, títulos, empresas, duraciones ni logros que no aparezcan en el perfil, aunque la redacción del bullet difiera literalmente respecto a su forma original en `profile.md`. La estructura de la plantilla (secciones, layout, tipografía) permanece fuera del control del LLM.

#### Scenario: Adaptación de redacción permitida

- **WHEN** se compara el texto de un bullet renderizado en el PDF contra su forma en `profile.md`
- **THEN** el texto PUEDE diferir a nivel de cadena (reformulación, cambio de verbos, distinto orden de frases, ajuste de keywords)
- **AND** toda la información factual expresada (entidades, logros cuantitativos, periodos, empresas, tecnologías) SHALL estar contenida en el bullet original o en el perfil como un todo

#### Scenario: Sin invención de hechos

- **WHEN** se inspecciona cada bullet del PDF generado
- **THEN** cada entidad factual mencionada (nombre de empresa, tecnología, título, duración, logro cuantitativo) SHALL poder rastrearse a una aparición literal o parafraseable en `profile.md`
- **AND** en ningún caso un bullet SHALL introducir entidades factuales ausentes del perfil aunque la oferta las mencione como deseables

#### Scenario: Selección y redacción dependientes de la oferta

- **WHEN** se generan CVs para dos ofertas con requisitos distintos usando el mismo `profile.md`
- **THEN** los subconjuntos de bullets incluidos en cada CV PUEDEN diferir
- **AND** la redacción de un mismo bullet PUEDE también diferir entre las dos salidas, reflejando la adaptación al puesto respectivo
- **AND** ninguno de los dos PDFs SHALL contener afirmaciones ausentes del perfil

### Requirement: Carta de presentación ajustada a hechos del perfil

La carta de presentación generada SHALL apoyarse exclusivamente en hechos presentes en `profile.md` y en la descripción de la oferta. El LLM SHALL NO inventar experiencia, tecnologías, logros, duraciones, nombres de empresas ni títulos que no figuren en una de esas dos fuentes.

#### Scenario: Sin hechos inventados

- **WHEN** se inspecciona la carta generada
- **THEN** cada afirmación factual sobre la trayectoria del candidato SHALL poder rastrearse a una frase o bullet específico de `profile.md`
- **AND** cada referencia a requisitos o al puesto SHALL poder rastrearse a la descripción de la oferta persistida

### Requirement: Registro de generación con `profile_hash`

El sistema SHALL calcular el SHA-1 del contenido de `profile.md` en el momento exacto de generar, y SHALL almacenar ese hash en la columna `profile_hash` de la fila correspondiente en `generations`.

#### Scenario: Hash estable para contenido idéntico

- **WHEN** se generan dos CVs distintos contra el mismo `profile.md` sin modificarlo entre invocaciones
- **THEN** las dos filas en `generations` SHALL compartir el mismo `profile_hash`

#### Scenario: Hash distinto tras modificación del perfil

- **WHEN** `profile.md` se modifica entre dos generaciones
- **THEN** las dos filas en `generations` SHALL tener `profile_hash` distintos

### Requirement: Esquema de la tabla `generations`

El sistema SHALL mantener una tabla `generations` en SQLite con los campos `id` (TEXT PK), `job_id` (TEXT FK → `jobs.id`), `profile_hash` (TEXT), `cv_path` (TEXT), `cover_path` (TEXT), `created_at` (INTEGER), `parent_generation_id` (TEXT NULL, FK → `generations.id`), `feedback_rating` (INTEGER NULL, con CHECK constraint BETWEEN 1 AND 5), `feedback_comment` (TEXT NULL).

#### Scenario: Integridad referencial del job

- **WHEN** se intenta insertar una fila con un `job_id` que no existe en `jobs`
- **THEN** la inserción SHALL fallar por violación de foreign key

#### Scenario: Integridad referencial de la generación padre

- **WHEN** se intenta insertar una fila con un `parent_generation_id` no nulo que no existe en `generations`
- **THEN** la inserción SHALL fallar por violación de foreign key

#### Scenario: Rating fuera de rango

- **WHEN** se intenta persistir un `feedback_rating` fuera del rango `1..5`
- **THEN** la operación SHALL fallar por violación de CHECK constraint
- **AND** el sistema SHALL NO aceptar valores `0`, negativos, mayores de `5`, ni no enteros

#### Scenario: Invariante padre ⇔ feedback

- **WHEN** se inserta una fila con `parent_generation_id IS NULL`
- **THEN** la fila SHALL tener también `feedback_rating IS NULL` y `feedback_comment IS NULL`
- **AND** análogamente, una fila con `parent_generation_id` no nulo SHALL tener `feedback_rating` no nulo (el `feedback_comment` permanece opcional)

### Requirement: Iteración del Writer guiada por feedback humano

El sistema SHALL permitir ejecuciones iterativas del Writer sobre la misma oferta, donde cada iteración parte de una generación previa (el padre) e incluye en el propio payload del disparo el feedback humano que la motiva. Emitir feedback y crear la nueva rama SHALL ser el mismo acto — no existen endpoints separados para persistir feedback antes de iterar. El feedback es inmutable: una vez que una rama hija se ha creado con cierto feedback, ese feedback queda registrado en la fila de esa hija y no admite edición posterior. El Writer SHALL seguir sujeto a las mismas restricciones duras en modo iteración que en modo primera generación: sin invención de hechos ausentes del perfil, y estructura de plantilla fija. La redacción adaptada de bullets sigue permitida y es de hecho el principal grado de libertad que el feedback puede reconducir.

#### Scenario: Disparo de una iteración con feedback en el payload

- **WHEN** `POST /api/writer/generate` recibe `{ jobId, parentGenerationId, feedbackRating, feedbackComment? }` con `parentGenerationId` no nulo y `feedbackRating` en el rango `1..5`
- **THEN** la capa de orquestación SHALL cargar de SQLite la fila de la generación padre (incluyendo la selección de bullets previa y el cuerpo de la carta previa)
- **AND** SHALL construir el prompt del Writer inyectando esa información junto con la oferta, `profile.md` y el `feedbackRating` / `feedbackComment` recibidos en el payload
- **AND** SHALL invocar `agent.generate({ prompt })` contra el mismo `ToolLoopAgent` del Writer sin tools adicionales respecto al modo primera generación
- **AND** SHALL insertar la nueva fila en `generations` con `parent_generation_id` apuntando al padre y con `feedback_rating` / `feedback_comment` iguales a los recibidos en el payload

#### Scenario: Iteración sin `feedbackRating`

- **WHEN** el endpoint recibe `parentGenerationId` no nulo pero no recibe `feedbackRating`, o lo recibe fuera del rango `1..5`
- **THEN** el endpoint SHALL responder con HTTP 400 y un mensaje claro
- **AND** el sistema SHALL NO crear una nueva fila en `generations`

#### Scenario: Lectura del pasado vive en la orquestación, no en el agente

- **WHEN** el Writer se ejecuta en modo iteración
- **THEN** el conjunto de tools registradas en el `ToolLoopAgent` SHALL ser idéntico al del modo primera generación
- **AND** NO SHALL existir ninguna tool que permita al LLM consultar otras filas de `generations` bajo demanda
- **AND** toda la información de la generación padre SHALL llegar al LLM exclusivamente como parte del prompt construido por la capa de orquestación

#### Scenario: Sin tope de iteraciones

- **WHEN** se encadenan múltiples iteraciones (generación 1 → 2 → 3 → ... → N) sobre la misma oferta
- **THEN** el sistema SHALL NO rechazar ninguna iteración por haber alcanzado un tope de profundidad
- **AND** cada iteración SHALL producir sus propios PDFs y su propia fila en `generations`

#### Scenario: Bifurcación desde una generación intermedia

- **WHEN** existe una cadena `A → B → C` y el usuario dispara una iteración desde `B` con su propio feedback
- **THEN** el sistema SHALL crear una nueva generación `B'` con `parent_generation_id = B.id` y con el `feedback_rating` / `feedback_comment` recibidos en el disparo
- **AND** `B'` SHALL coexistir con `C` como hijos hermanos de `B`
- **AND** ninguna rama preexistente SHALL ser modificada, reescrita o borrada

#### Scenario: Múltiples feedbacks sobre el mismo padre

- **WHEN** el usuario dispara dos iteraciones sucesivas desde la misma generación `A` con feedbacks distintos
- **THEN** el sistema SHALL crear dos generaciones hijas `A'` y `A''`, ambas con `parent_generation_id = A.id`
- **AND** cada una SHALL almacenar su propio `feedback_rating` / `feedback_comment`
- **AND** el feedback registrado sobre `A'` al crearla SHALL permanecer inmutable independientemente de iteraciones posteriores
