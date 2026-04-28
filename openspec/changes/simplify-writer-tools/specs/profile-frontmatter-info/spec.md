## ADDED Requirements

### Requirement: Datos personales del candidato en frontmatter estructurado

`profile.md` SHALL contener una sección `profile` en su frontmatter YAML con los campos estáticos del candidato. El sistema SHALL leer esos campos a través de `parseProfile()` y exponerlos como un objeto tipado `ProfileInfo` en `ParsedProfile`. Ningún componente del sistema SHALL extraer el nombre, email, teléfono, localización, rol ni URLs del cuerpo markdown de `profile.md`.

#### Scenario: Frontmatter profile completo

- **WHEN** `profile.md` contiene una sección `profile:` con `name`, `role`, `email`, `phone`, `location` y `linkedinUrl` en el frontmatter
- **THEN** `parseProfile()` SHALL retornar un `ParsedProfile` cuyo campo `profile` contiene todos esos valores tipados
- **AND** el orquestador del Writer SHALL usar `parsedProfile.profile` directamente para renderizar los PDFs sin invocar ninguna función de extracción regex

#### Scenario: Campo `website` opcional ausente

- **WHEN** la sección `profile:` no incluye el campo `website`
- **THEN** `parseProfile()` SHALL retornar `profile.website` como `undefined`
- **AND** el sistema SHALL NO lanzar error ni advertencia por la ausencia de este campo

#### Scenario: Sección `profile` ausente del frontmatter

- **WHEN** `profile.md` no contiene la sección `profile:` en el frontmatter
- **THEN** `parseProfile()` SHALL lanzar un error descriptivo indicando que la sección `profile` es requerida
- **AND** el sistema SHALL NOT proceder con la generación de PDFs

#### Scenario: Migración desde campo legacy `linkedinProfile`

- **WHEN** `profile.md` contiene el campo `linkedinProfile` al nivel raíz del frontmatter (formato anterior) pero NO contiene la sección `profile:`
- **THEN** `parseProfile()` SHALL emitir un warning en consola indicando que `linkedinProfile` es un campo obsoleto
- **AND** SHALL NO usar ese valor como sustituto de `profile.linkedinUrl`
- **AND** SHALL lanzar el mismo error que el escenario de sección `profile` ausente
