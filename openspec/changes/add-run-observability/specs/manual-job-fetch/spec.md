## MODIFIED Requirements

### Requirement: Cierre de overlays en la entrada manual de oferta

El extractor manual (`src/lib/agents/manual/extractor.ts`) SHALL delegar el cierre de login walls y banners de cookies de LinkedIn al helper compartido `dismissBlockingOverlays(session)` ubicado en la capa `agent-browser`, y SHALL NO contener listas inline de patrones de botón.

#### Scenario: Lógica delegada al helper

- **WHEN** `extractJobFromUrl(url)` se invoca y la página objetivo carga con un overlay bloqueante
- **THEN** la función SHALL invocar `dismissBlockingOverlays(session)` después de `openUrl` y `waitLoad`
- **AND** la lógica de detección y clic SHALL ejecutarse íntegramente dentro del helper

#### Scenario: Sin listas de patrones inline

- **WHEN** se inspecciona el código fuente de `extractor.ts`
- **THEN** SHALL NO contener listas de regex de patrones de botón ("Dismiss", "Descartar", "Accept", etc.)
- **AND** SHALL importar y usar `dismissBlockingOverlays` desde `@/lib/agent-browser/exec`

#### Scenario: Comportamiento observable preservado

- **WHEN** se compara el comportamiento de extracción antes y después del refactor para la misma URL
- **THEN** los campos extraídos (`title`, `company`, `location`, `description_md`, `raw_text`) SHALL ser equivalentes
- **AND** los casos donde la extracción fallaba antes (overlay no reconocido) SHALL ahora producir un evento `dismiss-miss` y un artefacto de evidencia, en vez de un fallo silencioso del regex
