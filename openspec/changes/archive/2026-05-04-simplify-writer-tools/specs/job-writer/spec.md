## MODIFIED Requirements

### Requirement: Selección, reordenación y adaptación de redacción de bullets

El LLM del Writer SHALL decidir qué experiencia del `profile.md` incluir y cómo presentarla, y PUEDE adaptar la redacción de cada bullet (tono, verbos, keywords, énfasis) para encajar con la oferta concreta. El agente SHALL producir su selección como una lista de entradas de experiencia estructuradas por empresa y rol, usando la tool `composeCV`. Todo bullet renderizado en el PDF SHALL apoyarse exclusivamente en hechos presentes en `profile.md`: el LLM SHALL NOT introducir tecnologías, títulos, empresas, duraciones ni logros que no aparezcan en el perfil, aunque la redacción del bullet difiera literalmente respecto a su forma original en `profile.md`. La estructura de la plantilla (secciones, layout, tipografía) permanece fuera del control del LLM.

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

#### Scenario: Experiencia agrupada por empresa y rol

- **WHEN** el agente llama a `composeCV`
- **THEN** el campo `experience` SHALL ser una lista de objetos, cada uno con `company`, `role`, `period` y `bullets` (lista de strings de texto renderizado)
- **AND** todos los bullets de una misma entrada de experiencia SHALL corresponder a la misma empresa y rol presentes en `profile.md`
- **AND** el PDF renderizado SHALL mostrar los bullets agrupados bajo el encabezado de empresa y rol correspondiente

### Requirement: Writer implementado como `ToolLoopAgent` del Vercel AI SDK

El agente Writer SHALL implementarse con `ToolLoopAgent` del Vercel AI SDK, instanciado con `model`, `instructions`, el conjunto de `tools` propio del Writer y una condición `stopWhen`, y ejecutado vía `agent.generate({ prompt })`. El Writer SHALL exponer exactamente tres tools al LLM: `composeCV`, `composeCoverLetter` y `finalizeGeneration`. El Writer SHALL NOT implementarse como llamadas sueltas a `generateText` ni como código ad-hoc fuera del framework de agentes.

#### Scenario: Invocación del agente Writer

- **WHEN** la capa de orquestación del Writer dispara una generación
- **THEN** el sistema SHALL instanciar un `ToolLoopAgent` con las tres tools del Writer registradas (`composeCV`, `composeCoverLetter`, `finalizeGeneration`)
- **AND** SHALL invocar `agent.generate({ prompt })` con un prompt que contiene la oferta y el perfil completo
- **AND** SHALL recibir el resultado del bucle y proceder con la renderización de PDFs en la capa de sistema

#### Scenario: Orden de llamadas a tools

- **WHEN** el agente Writer procesa una generación inicial o una iteración
- **THEN** el agente SHALL llamar a `composeCV` antes de `finalizeGeneration`
- **AND** SHALL llamar a `composeCoverLetter` antes de `finalizeGeneration`
- **AND** `finalizeGeneration` SHALL ser la última tool invocada en cualquier ejecución exitosa
- **AND** `finalizeGeneration` SHALL rechazar la llamada si `composeCV` o `composeCoverLetter` no han sido invocadas previamente en la misma ejecución

## ADDED Requirements

### Requirement: Rationale de generación como parte de `finalizeGeneration`

El LLM del Writer SHALL proveer un rationale en español como parámetro obligatorio de la tool `finalizeGeneration`. El rationale SHALL incluir una lista de 3-5 requisitos prioritarios extraídos de la oferta y un texto de justificación que explique las decisiones de selección y adaptación tomadas. Este rationale es meta-contenido para el dashboard y SHALL NOT aparecer en los PDFs generados.

#### Scenario: Rationale incluido en la llamada a finalizeGeneration

- **WHEN** el agente invoca `finalizeGeneration`
- **THEN** el parámetro `rationale` SHALL estar presente y contener `priorityRequirements` (array de strings, mínimo 1) y `text` (string no vacío en español)
- **AND** el sistema SHALL persistir el rationale en la columna `rationale_json` de la tabla `generations`

#### Scenario: finalizeGeneration rechazada sin rationale

- **WHEN** el agente invoca `finalizeGeneration` sin el campo `rationale` o con `rationale.text` vacío
- **THEN** la tool SHALL rechazar la llamada con un error descriptivo
- **AND** el agente SHALL NOT dar por finalizada la generación

## REMOVED Requirements

### Requirement: Selección de skills mediante catálogo explícito

**Reason**: Eliminado al suprimir la tool `selectSkills` y el bloque `<skills_catalog>` del prompt. La selección de skills pasa a ser responsabilidad de `composeCV`, donde el agente elige libremente de entre las skills presentes en `<candidate_profile>` sin validación contra un catálogo. La validación de calidad queda en el ciclo de feedback humano.

**Migration**: No hay migración de datos. Los consumidores del campo `skills_json` en la tabla `generations` siguen leyendo un array de strings; el formato no cambia.
