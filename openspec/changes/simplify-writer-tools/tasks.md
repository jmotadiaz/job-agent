## 1. Frontmatter de profile.md

- [x] 1.1 Añadir la sección `profile:` al frontmatter de `profile.md` con los campos `name`, `role`, `email`, `phone`, `location`, `linkedinUrl` y opcionalmente `website`
- [x] 1.2 Extender `ParsedProfile` en `src/lib/profile/parse.ts` con el tipo `ProfileInfo` y el campo `profile`
- [x] 1.3 Implementar la lectura de `profile` en `parseProfile()`: lanzar error si la sección está ausente; emitir warning si detecta el campo legacy `linkedinProfile` al nivel raíz

## 2. Nuevas tools del Writer

- [x] 2.1 Crear `src/lib/agents/writer/tools/composeCV.ts` con el schema `{ experience: Array<{company, role, period, bullets}>, skills: string[], education: Array<{institution, degree, period}> }` y la lógica de ejecución que guarda en `ctx`
- [x] 2.2 Modificar `src/lib/agents/writer/tools/finalizeGeneration.ts` para aceptar `{ rationale: { priorityRequirements: string[], text: string } }` como input obligatorio, guardarlo en `ctx.rationale`, y validar que `ctx.experience`, `ctx.skills`, `ctx.education` y `ctx.coverParagraphs` estén presentes
- [x] 2.3 Eliminar `src/lib/agents/writer/tools/selectBullets.ts`
- [x] 2.4 Eliminar `src/lib/agents/writer/tools/selectSkills.ts`
- [x] 2.5 Eliminar `src/lib/agents/writer/tools/composeRationale.ts`

## 3. WriterRunContext y types

- [x] 3.1 Actualizar `src/lib/agents/writer/types.ts`: renombrar `bullets` a `experience` con tipo `ExperienceEntry[] | null`; cambiar `skillItems` a `skills`; añadir `education: EducationEntry[] | null`; eliminar `availableBulletIds` y `availableSkills`; definir los tipos `ExperienceEntry` y `EducationEntry`

## 4. Registro de tools y agent

- [x] 4.1 Actualizar `src/lib/agents/writer/tools.ts` para exportar solo `composeCV`, `composeCoverLetter` y `finalizeGeneration`
- [x] 4.2 Actualizar `BASE_INSTRUCTIONS` en `src/lib/agents/writer/agent.ts`: reescribir la sección `<workflow>` para reflejar las 3 tools (composeCV → composeCoverLetter → finalizeGeneration) y eliminar las referencias a selectBullets, selectSkills y composeRationale

## 5. Orquestador

- [x] 5.1 Eliminar las funciones `extractBulletCatalog`, `extractPersonalInfo`, `extractJobBulletMap`, `extractSkills` y `extractEducation` de `src/lib/agents/writer/orchestrator.ts`
- [x] 5.2 Sustituir el uso de `extractPersonalInfo` por `parseProfile(profileContent).profile` para obtener los datos del candidato
- [x] 5.3 Simplificar la construcción del prompt: eliminar los bloques `<bullet_catalog>` y `<skills_catalog>`; mantener solo `<job_offer>` y `<candidate_profile>`
- [x] 5.4 Eliminar el paso de enriquecimiento de bullets post-agente (`enrichedBullets`) y pasar `ctx.experience` directamente al renderer del CV
- [x] 5.5 Actualizar la llamada a `insertGeneration` para serializar `ctx.experience` en `bullets_json` (mantiene compatibilidad de columna) y leer `ctx.rationale` desde `ctx.rationale` (ya sin el campo separado de composeRationale)
- [x] 5.6 Inicializar `WriterRunContext` sin `availableBulletIds` ni `availableSkills`

## 6. Renderer del CV

- [x] 6.1 Actualizar la llamada a `CvTemplate` en el orquestador para usar la nueva estructura: pasar `bullets` como la lista plana aplanada desde `ctx.experience` (cada entry genera `BulletItem[]` con `company`, `role`, `period`, `renderedText`) o bien actualizar `CvTemplate` para aceptar directamente `ctx.experience`
- [x] 6.2 Verificar que `groupBulletsByJob` en `cv.tsx` sigue funcionando correctamente con los datos provenientes de `ctx.experience`

## 7. Tests

- [x] 7.1 Actualizar `src/lib/agents/writer/__tests__/integration.test.ts` para reflejar los nuevos schemas de tools (composeCV, finalizeGeneration con rationale) y eliminar referencias a selectBullets, selectSkills y composeRationale
- [x] 7.2 Actualizar `src/lib/agents/writer/__tests__/feedback-iteration.test.ts` para el nuevo formato de ctx (experience, skills, education)
- [x] 7.3 Añadir tests para `parseProfile()` cubriendo: sección `profile` completa, `website` ausente, sección `profile` ausente (error), campo legacy `linkedinProfile` (warning + error)
