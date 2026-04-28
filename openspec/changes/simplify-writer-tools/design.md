## Context

El Writer agent actual expone 5 tools al LLM (`selectBullets`, `selectSkills`, `composeCoverLetter`, `composeRationale`, `finalizeGeneration`). En la práctica el modelo las invoca siempre en el mismo orden lineal: el loop existe pero nunca retrocede. Cada tool es un setter en `WriterRunContext`; la validación (IDs de bullet válidos, skills del catálogo) es la única lógica real. El orquestador construye catálogos explícitos (`<bullet_catalog>`, `<skills_catalog>`) que el modelo usa como referencia para seleccionar por ID, y después enriquece los bullets con metadata de trabajo (company, role, period) usando `jobBulletMap`.

La información personal estática del candidato (nombre, email, teléfono, localización) se extrae del cuerpo de `profile.md` con regex ad hoc (`extractPersonalInfo`), lo que es frágil ante cambios de formato.

## Goals / Non-Goals

**Goals:**
- Reducir el toolset del Writer de 5 a 3 tools: `composeCV`, `composeCoverLetter`, `finalizeGeneration`.
- Eliminar la indirección de IDs de bullet (`b0`, `b1`, …) dando libertad total al agente para componer la experiencia estructurada directamente.
- Mover los datos personales estáticos al frontmatter de `profile.md` para eliminar el parsing regex frágil.
- Simplificar el orquestador eliminando las funciones `extract*` y la construcción de catálogos en el prompt.

**Non-Goals:**
- Cambiar el modelo LLM, las instrucciones de calidad editorial del CV ni las reglas de la carta de presentación.
- Modificar los templates React-PDF de CV o carta de presentación.
- Cambiar el esquema de la base de datos `generations`.
- Alterar el flujo de feedback/iteración (sigue funcionando igual, solo cambia qué datos guarda el ctx).

## Decisions

### D1 — `composeCV` como tool única para la sección dinámica del CV

El agente recibe el perfil completo en `<candidate_profile>` y construye directamente el output estructurado. El input de `composeCV`:

```typescript
{
  experience: Array<{
    company: string;
    role: string;
    period: string;
    bullets: string[];   // texto renderizado libre, sin IDs
  }>;
  skills: string[];       // lista plana ordenada por relevancia
  education: Array<{
    institution: string;
    degree: string;
    period: string;
  }>;
}
```

**Alternativa descartada**: mantener `selectBullets` con IDs y añadir `composeCV` que los reciba. Descartada porque los IDs solo servían para validación, y la validación del contenido final la hace el usuario (human-in-the-loop con feedback), no el sistema.

### D2 — Education entra en `composeCV`, no la provee el orquestador

Aunque education es normalmente estática, hay casos donde el agente podría decidir omitirla o reordenarla según el contexto de la oferta. Incluirla en `composeCV` da esa flexibilidad sin coste adicional.

**Alternativa descartada**: leer education del frontmatter en el orquestador y pasarla directamente al renderer. Descartada porque obliga a añadir otro campo a `profile.profile` frontmatter y crea una asimetría (skills y experiencia los elige el agente, education no).

### D3 — `finalizeGeneration` absorbe el rationale

`finalizeGeneration` es una señal de parada con validación; añadir el rationale como campo obligatorio aprovecha esa llamada y elimina una tool sin sacrificar estructura.

```typescript
finalizeGeneration({
  rationale: {
    priorityRequirements: string[];  // 3-5 señales extraídas de la oferta
    text: string;                    // justificación en español
  }
})
```

**Alternativa descartada**: fusionar rationale en `composeCoverLetter`. Semánticamente es incorrecto — el rationale es meta-contenido para el dashboard, no parte de la carta.

### D4 — Sección `profile` en frontmatter de `profile.md`

```yaml
---
search:
  queries: [...]
  location: España
  remote: true
profile:
  name: Javier Mota Diaz
  role: Frontend Architect
  email: javimota83@gmail.com
  phone: "+34 623 136 549"
  location: Seville, Spain
  linkedinUrl: https://www.linkedin.com/in/javier-mota/
  website: null           # opcional
---
```

`parseProfile()` extiende `ParsedProfile` con un campo `profile` tipado. `linkedinProfile` (campo legacy al nivel raíz del frontmatter) se migra a `profile.linkedinUrl` y el campo viejo se elimina.

### D5 — El prompt al agente se simplifica a dos bloques

```
<job_offer>...</job_offer>
<candidate_profile>...</candidate_profile>
```

Desaparecen `<bullet_catalog>` y `<skills_catalog>`. El agente lee skills, bullets y education directamente del markdown del perfil. Las instrucciones del sistema ya guían al agente con las reglas de calidad editorial.

### D6 — `WriterRunContext` refleja la nueva estructura

```typescript
interface WriterRunContext {
  experience: ExperienceEntry[] | null;
  skills: string[] | null;
  education: EducationEntry[] | null;
  coverParagraphs: string[] | null;
  rationale: Rationale | null;
  finalized: boolean;
}
```

Desaparecen `availableBulletIds`, `availableSkills` (ya no hay validación de catálogos). El campo `bullets` se renombra a `experience` para reflejar la nueva estructura agrupada.

## Risks / Trade-offs

**Sin validación de facts inventados** → El agente tiene libertad total para escribir bullets. Mitigation: las instrucciones del sistema mantienen la regla hard de no inventar hechos; la validación queda en el ciclo de feedback humano.

**Education ahora es responsabilidad del agente** → Si el agente omite educación relevante, no hay fallback automático. Mitigation: las instrucciones del sistema especifican que education debe incluirse; es un riesgo bajo dado el comportamiento observado del modelo.

**Migración de `linkedinProfile` → `profile.linkedinUrl`** → Los usuarios que tengan `linkedinProfile` al nivel raíz del frontmatter verán un error de validación si `parseProfile` deja de leerlo. Mitigation: `parseProfile` puede leer ambos durante un periodo transitorio, con warning si se usa el campo legacy.

**Historial de iteraciones en DB guarda `bullets_json` con el formato antiguo** → Generaciones previas tienen `bullets_json` como `[{bulletId, renderedText}]`; las nuevas tendrán `[{company, role, period, bullets}]`. Mitigation: el campo es opaco para el orquestador más allá de ser reinyectado al prompt en iteraciones; el cambio de schema no rompe queries existentes.

## Migration Plan

1. Actualizar `profile.md` añadiendo la sección `profile:` al frontmatter (manual).
2. Extender `parseProfile()` para leer `profile` y emitir warning si detecta `linkedinProfile` legacy.
3. Reemplazar las 5 tools por las 3 nuevas.
4. Actualizar `WriterRunContext` y el orquestador.
5. Actualizar `BASE_INSTRUCTIONS` en `agent.ts` (workflow, herramientas disponibles).
6. Actualizar tests.

No hay rollback de datos (schema DB no cambia). Si hay un fallo en producción, revertir el código es suficiente.

## Open Questions

- ¿El rationale en `finalizeGeneration` debería seguir siendo un objeto estructurado `{ priorityRequirements, text }` o simplificarse a un único `string`? (Actualmente el dashboard muestra cada campo por separado; si el dashboard ya no distingue los campos, puede colapsarse.)
