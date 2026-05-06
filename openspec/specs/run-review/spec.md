## ADDED Requirements

### Requirement: Endpoint para solicitar revisión de un run

El sistema SHALL exponer el endpoint local `POST /api/log/<runId>/review` que ejecuta una revisión LLM sobre el contenido de la carpeta `log/<runId>/` y devuelve el informe resultante en markdown.

#### Scenario: Run existente con datos completos

- **WHEN** el usuario invoca `POST /api/log/<runId>/review` para un `runId` cuya carpeta contiene `meta.json`, `timeline.jsonl` y `agent-trace.jsonl`
- **THEN** el endpoint SHALL responder con `{ review: <markdown-string> }` y código HTTP 200
- **AND** el informe SHALL persistirse adicionalmente en `log/<runId>/review.md`

#### Scenario: Run inexistente

- **WHEN** se invoca el endpoint con un `runId` que no corresponde a ninguna carpeta en `log/`
- **THEN** el endpoint SHALL responder con código HTTP 404
- **AND** SHALL NO crear archivos

#### Scenario: Re-revisión sobreescribe el informe anterior

- **WHEN** se invoca el endpoint para un run cuyo `review.md` ya existe
- **THEN** el archivo SHALL sobrescribirse con el nuevo informe
- **AND** la respuesta SHALL contener el informe nuevo

### Requirement: Bundle del run como contexto del revisor

El sistema SHALL construir, antes de invocar al LLM revisor, un bundle markdown único que sintetiza el contenido del run y que cabe en el contexto del modelo sin truncamiento.

#### Scenario: Estructura del bundle

- **WHEN** se construye el bundle de un run
- **THEN** SHALL contener al menos cuatro secciones en este orden: `## Meta` (metadatos del run), `## Timeline` (eventos JSONL aplanados a una tabla cronológica), `## Agent trace` (steps del modelo con sus tool calls y resultados), `## Artifacts (resumen)` (lista de archivos en `artifacts/` con nombre, tamaño y etiqueta)
- **AND** los artefactos SHALL listarse por nombre y tamaño únicamente, sin volcar su contenido íntegro al bundle

#### Scenario: Contenido completo de timeline y trace

- **WHEN** el run tiene un `timeline.jsonl` con N eventos y un `agent-trace.jsonl` con M steps
- **THEN** el bundle SHALL contener los N eventos y los M steps en su totalidad
- **AND** el orden cronológico de eventos y steps SHALL preservarse

### Requirement: Rol y output del agente revisor

El agente revisor SHALL invocarse mediante una llamada `generateText` (sin loop de tools) con un prompt de sistema que define su rol como analista del run y exige un output markdown estructurado con observaciones y propuestas concretas de mejora.

#### Scenario: Output estructurado

- **WHEN** se completa una revisión exitosa
- **THEN** el `review.md` resultante SHALL ser markdown válido
- **AND** SHALL contener al menos las secciones `## Resumen`, `## Observaciones` y `## Propuestas de mejora`
- **AND** las propuestas SHALL referirse a artefactos concretos del proyecto (prompts del agente, herramientas registradas, lógica del orquestador) cuando aplique, no a recomendaciones genéricas

#### Scenario: Sin tools y sin estado mutable

- **WHEN** el revisor se ejecuta
- **THEN** SHALL invocarse mediante `generateText` (no `ToolLoopAgent`)
- **AND** SHALL NO disponer de tools
- **AND** SHALL NO mutar el estado del run revisado más allá de escribir `review.md`

### Requirement: Persistencia y exposición del informe

El sistema SHALL persistir el informe de revisión como `log/<runId>/review.md` y SHALL exponerlo a través del API y la UI del log.

#### Scenario: Informe presente al recargar el detalle

- **WHEN** existe `log/<runId>/review.md`
- **THEN** la respuesta de `GET /api/log/<runId>` SHALL incluir el contenido del informe en un campo `review` del objeto devuelto
- **AND** la página `/log/<runId>` SHALL renderizarlo directamente sin requerir solicitarla de nuevo

#### Scenario: Informe ausente

- **WHEN** un run no ha sido revisado todavía
- **THEN** `GET /api/log/<runId>` SHALL devolver `review: null` o el campo ausente
- **AND** la UI SHALL mostrar el botón "Pedir revisión" en su lugar
