## Why

El agente Writer usa cinco tools secuenciales (`selectBullets`, `selectSkills`, `composeCoverLetter`, `composeRationale`, `finalizeGeneration`) que en la práctica el LLM llama siempre en el mismo orden lineal sin retroceder, actuando como simples setters en un `RunContext`. Además, el orquestador extrae información personal del cuerpo de `profile.md` mediante expresiones regulares frágiles, cuando esa información es estática y debería vivir en el frontmatter estructurado.

## What Changes

- **BREAKING** — Se elimina la tool `selectBullets` (con su catálogo de IDs `b0`, `b1`, …); el agente compone la sección de experiencia directamente como objetos estructurados `{ company, role, period, bullets }`.
- **BREAKING** — Se elimina la tool `selectSkills`; la selección de skills pasa a ser un campo de la nueva tool `composeCV`.
- **BREAKING** — Se elimina la tool `composeRationale`; el rationale pasa a ser un parámetro obligatorio de `finalizeGeneration`.
- Se introduce la tool `composeCV({ experience, skills, education })` que reemplaza `selectBullets` + `selectSkills` y añade la sección de educación como decisión del agente.
- `composeCoverLetter` se mantiene sin cambios.
- `finalizeGeneration` absorbe el rationale como input `{ rationale: { priorityRequirements, text } }`.
- Se añade la sección `profile` al frontmatter de `profile.md` con los campos estáticos: `name`, `role`, `email`, `phone`, `location`, `linkedinUrl`, `website`.
- Se elimina `extractPersonalInfo()` del orquestador (regex sobre el cuerpo markdown); se sustituye por lectura directa del frontmatter vía `parseProfile()`.
- Se eliminan `extractBulletCatalog()`, `extractJobBulletMap()`, `extractSkills()`, `extractEducation()` del orquestador.
- Se eliminan los bloques `<bullet_catalog>` y `<skills_catalog>` del prompt al agente; el agente lee toda la información directamente de `<candidate_profile>`.
- El paso de enriquecimiento de bullets (añadir `company/role/period` post-agente) desaparece; el agente provee la estructura completa.

## Capabilities

### New Capabilities

- `profile-frontmatter-info`: Sección `profile` estructurada en el frontmatter de `profile.md` con los datos personales estáticos del candidato (nombre, email, teléfono, localización, rol, URLs).

### Modified Capabilities

- `job-writer`: El conjunto de tools del Writer cambia (de 5 a 3) y la estructura de salida del agente pasa de una lista plana de bullet IDs a objetos de experiencia agrupados por empresa/rol. Los requisitos de comportamiento (no inventar hechos, una página A4, carta de presentación factual) se mantienen intactos.

## Impact

- `src/lib/agents/writer/tools.ts` — reemplaza las 5 tools por 3 nuevas.
- `src/lib/agents/writer/tools/` — se añade `composeCV.ts`; se eliminan `selectBullets.ts`, `selectSkills.ts`, `composeRationale.ts`; se modifica `finalizeGeneration.ts`.
- `src/lib/agents/writer/types.ts` — `WriterRunContext` se adapta a los nuevos campos.
- `src/lib/agents/writer/agent.ts` — se actualiza el workflow en `BASE_INSTRUCTIONS` para reflejar las 3 tools.
- `src/lib/agents/writer/orchestrator.ts` — se eliminan las funciones `extract*`, se simplifica la construcción del prompt y el enriquecimiento post-agente.
- `src/lib/profile/parse.ts` — `ParsedProfile` incorpora el campo `profile` leído del frontmatter.
- `profile.md` — se añade la sección `profile:` al frontmatter.
- Tests en `src/lib/agents/writer/__tests__/` — deben actualizarse para los nuevos schemas de tools.
