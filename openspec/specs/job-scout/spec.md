## MODIFIED Requirements

### Requirement: Tool `openSearch`

El agente Scout SHALL disponer de una tool `openSearch(query: string)` que navegue a la página pública de resultados de búsqueda de empleo de LinkedIn correspondiente a la query dada, sin requerir autenticación, espere a que la página esté lista para ser inspeccionada, e intente cerrar de forma transparente cualquier overlay bloqueante (login wall, banner de cookies) presente, delegando esa tarea a un helper compartido `dismissBlockingOverlays()` ubicado en la capa `agent-browser`.

#### Scenario: Navegación exitosa a resultados

- **WHEN** la tool se invoca con una query válida
- **THEN** el sistema SHALL ejecutar `agent-browser open <url>` seguido de `agent-browser wait --load networkidle`
- **AND** la tool SHALL invocar `dismissBlockingOverlays()` antes de devolver
- **AND** la tool SHALL resolver con `{ ok: true, url }` cuando la página esté lista

#### Scenario: La lógica de cierre no vive en la tool

- **WHEN** se inspecciona el código fuente de `openSearch.ts`
- **THEN** SHALL NO contener listas de regex de patrones de botón ("Dismiss", "Descartar", "Accept", etc.)
- **AND** SHALL invocar exclusivamente `dismissBlockingOverlays()` para cubrir esa responsabilidad

### Requirement: Tool `fetchJobDetail`

El agente Scout SHALL disponer de una tool `fetchJobDetail(url: string)` que navegue a la página de detalle de una oferta concreta, cierre overlays bloqueantes mediante `dismissBlockingOverlays()`, extraiga el texto descriptivo, y devuelva un `JobSummary` estructurado producido por una llamada al LLM extractor.

#### Scenario: Cierre de overlays delegado

- **WHEN** la tool se invoca para una URL de detalle
- **THEN** después de `agent-browser open` y `wait --load networkidle`, SHALL invocar `dismissBlockingOverlays(session)` con el identificador de sesión del tab
- **AND** SHALL NO contener listas inline de patrones de botón

#### Scenario: Comportamiento extractor preservado

- **WHEN** la tool obtiene el texto descriptivo
- **THEN** SHALL invocar el LLM extractor con `JobDetailsSchema` y devolver `JobSummary` exactamente como antes del refactor
- **AND** SHALL guardar `lastSummary` y `lastRawText` en `ScoutRunContext` con la misma semántica

### Requirement: Helper compartido `dismissBlockingOverlays`

El sistema SHALL exponer en la capa `agent-browser` (`src/lib/agent-browser/exec.ts`) un helper único `dismissBlockingOverlays(session?: string): Promise<void>` que centraliza la lógica de detección y cierre de login walls y banners de cookies para LinkedIn, y SHALL ser invocado por todas las tools del Scout y del extractor manual que cargan páginas susceptibles de mostrar estos overlays.

#### Scenario: Patrones definidos en un único sitio

- **WHEN** se inspecciona el código fuente
- **THEN** SHALL existir exactamente un archivo donde se enumeran los patrones de botón ("Dismiss", "Descartar", "Cerrar", "Close" y los equivalentes para cookies)
- **AND** ese archivo SHALL ser `src/lib/agent-browser/exec.ts`

#### Scenario: Comportamiento ante login wall conocida

- **WHEN** la página activa contiene un botón cuyo aria-label coincide con uno de los patrones de dismiss
- **THEN** el helper SHALL clicarlo y esperar 1500 ms
- **AND** SHALL emitir un evento `dismiss-hit` en el log con el patrón que matcheó y el `ref` del botón

#### Scenario: Comportamiento ante banner de cookies conocido

- **WHEN** la página activa contiene un botón cuyo aria-label coincide con uno de los patrones de aceptar cookies
- **THEN** el helper SHALL clicarlo y esperar 1500 ms
- **AND** SHALL emitir un evento `dismiss-hit` con `kind: "cookie-banner"`

#### Scenario: Detección de overlay desconocido

- **WHEN** el snapshot contiene en sus primeras 30 líneas algún `- button "..."` que no coincide con ningún patrón conocido y la heurística juzga que probablemente es un overlay bloqueante
- **THEN** el helper SHALL emitir un evento `dismiss-miss` en el log con la referencia al artefacto producido
- **AND** SHALL volcar el snapshot pre como artefacto `<NN>_dismiss_miss.snapshot.json` en la carpeta del run para inspección posterior

#### Scenario: Página limpia, sin overlays

- **WHEN** el snapshot no contiene ni un patrón conocido ni un botón sospechoso
- **THEN** el helper SHALL emitir únicamente `dismiss-attempt` y SHALL devolver sin tomar otras acciones
- **AND** SHALL NO volcar artefactos
