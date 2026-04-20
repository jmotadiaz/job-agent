## Why

Revisar manualmente LinkedIn buscando ofertas relevantes y luego adaptar un CV y una carta de presentación para cada una es un trabajo de alta fricción que desincentiva las candidaturas de calidad. Un agente local y de solo lectura puede sacar a la superficie una oferta bien ajustada por ejecución contra un perfil privado y, bajo demanda, producir un CV y una carta listos para enviar, dejando al usuario concentrarse en revisar los matches y decidir dónde aplicar.

## What Changes

- Nueva aplicación Next.js local (UI + API routes) ejecutándose en la máquina del usuario, respaldada por una base de datos SQLite en fichero.
- Nuevo agente Scout disparado **bajo demanda desde el dashboard** que realiza una búsqueda en LinkedIn, juzga a los candidatos contra el perfil del usuario y persiste como máximo una oferta nueva por ejecución (o registra un resultado de `no_match`).
- Nuevo agente Writer disparado bajo demanda desde el dashboard que produce un PDF de CV y carta de presentación para una oferta seleccionada, usando una plantilla React-PDF con estructura fija cuyo contenido el LLM rellena seleccionando, reordenando y adaptando la redacción de bullets del perfil al puesto concreto, bajo la restricción dura de apoyarse exclusivamente en hechos presentes en `profile.md` (sin inventar experiencia, tecnologías, logros, duraciones, títulos ni empresas).
- Nueva UI de dashboard que lista las ofertas descubiertas con filtros por estado, un botón global "buscar nueva oferta" que dispara al Scout, una acción "generar" por oferta que dispara al Writer, descargas en PDF, acciones CRUD para marcar ofertas como `applied` o `discarded`, y un mecanismo human-in-the-loop de feedback por generación (rating + comentario libre) que **re-dispara al Writer** sobre la misma oferta, inyectando el feedback previo y el PDF anterior como contexto para producir una nueva iteración mejorada del CV y la carta.
- Nuevo `profile.md` gitignored en la raíz del repo como única fuente de verdad para la experiencia del usuario y sus preferencias de búsqueda.
- Nueva arquitectura en dos capas: (1) una capa de orquestación a nivel de sistema escrita en TypeScript plano, sin LLM, que posee el flujo de la API route, la carga del perfil, la invocación del agente y la persistencia; y (2) los agentes Scout y Writer implementados ambos con `ToolLoopAgent` del Vercel AI SDK (instanciado con `model`, `instructions` y el conjunto de `tools` registrado, ejecutado vía `agent.generate({ prompt })`), en los que el LLM decide en cada step del reasoning-and-acting loop qué tool invocar hasta emitir una respuesta terminal o cumplirse la condición `stopWhen`.
- Nueva dependencia `agent-browser` (invocada como subprocess con `--json`) para la navegación web basada en árbol de accesibilidad, garantizando que el LLM nunca vea HTML crudo.
- Nuevo esquema SQLite con `jobs` (UNIQUE sobre `(source, external_id)` para dedupe idempotente) y `generations` (foreign key a `jobs`, `profile_hash` para detección de staleness, `parent_generation_id` nullable para enlazar iteraciones formando un árbol, y campos `feedback_rating` / `feedback_comment` en la propia fila que registran el feedback humano que motivó esa iteración — nulos en la generación raíz, inmutables una vez escritos).
- Nueva capa de logging mínima basada en `console.log` / `console.warn` / `console.error` sobre stdout/stderr del servidor Next.js, con un prefijo por módulo (`[scout/orchestrator]`, `[writer/agent]`, `[db]`, `[agent-browser]`, etc.) y payloads en JSON o texto breve, instrumentando todos los puntos relevantes del flujo para que una ejecución sea auditable línea a línea sin infraestructura adicional (en MVP preferimos sobre-instrumentar; migrar a Pino o similar queda como trabajo de fase 2 si la señal se vuelve ruidosa).

## Capabilities

### New Capabilities

- `job-scout`: Descubrimiento bajo demanda de nuevas ofertas de LinkedIn que encajan con el perfil del usuario, con orquestación determinista, un único agente Scout dirigido por LLM por ejecución acotado por un límite de candidatos configurable, herramientas basadas en agent-browser para la navegación, y persistencia idempotente en SQLite.
- `job-writer`: Generación bajo demanda de un PDF con CV y carta de presentación adaptados para una oferta seleccionada, usando una plantilla React-PDF de estructura fija cuyo contenido el LLM rellena seleccionando, reordenando y adaptando la redacción de bullets del perfil al puesto concreto, bajo la restricción dura de apoyarse solo en hechos presentes en el perfil (sin inventar tecnologías, logros, duraciones, empresas ni títulos); con registros de generación hasheados contra la versión del perfil utilizada; soporta además ejecuciones iterativas que toman como input el feedback humano y la generación previa para producir una versión revisada enlazada a la anterior.
- `job-dashboard`: UI web local para disparar búsquedas del Scout, revisar ofertas descubiertas, disparar la generación del Writer, descargar los PDFs producidos, transicionar las ofertas a través del ciclo de vida `new → shortlisted → applied | discarded`, y capturar feedback humano sobre cada generación que re-dispara al Writer para producir una iteración mejorada enlazada a la anterior, incluyendo un indicador visual cuando una generación queda obsoleta respecto al perfil actual.

### Modified Capabilities

_Ninguna — este es un proyecto greenfield sin specs preexistentes._

## Impact

- **Nuevas dependencias de runtime**: `next`, `react`, `@ai-sdk/*` (Vercel AI SDK), `agent-browser`, `better-sqlite3`, `@react-pdf/renderer`, `zod`.
- **Nuevos ficheros**: `profile.md` (gitignored), fichero de base de datos SQLite (gitignored), directorio `.agent-browser/` de sesiones (gitignored, reservado para fase 2).
- **Nuevo touchpoint externo**: páginas públicas de búsqueda de empleo de LinkedIn, de solo lectura, sin autenticación. En el MVP cada ejecución del Scout la dispara explícitamente el usuario, por lo que la frecuencia de contacto con LinkedIn está naturalmente acotada.
- **Runtime exclusivamente local**: sin despliegue en cloud, sin infraestructura compartida, sin secretos más allá de una API key del proveedor de LLM en `.env.local`.
- **Fuera del alcance del MVP (documentado como fase 2)**: **scheduler automático (cron) para disparar al Scout sin intervención del usuario**, prefiltrado por embeddings, búsquedas multi-query en paralelo, sesiones autenticadas de LinkedIn vía `--session-name`, aprendizaje de búsquedas, reescritura creativa de bullets de CV, fuentes de empleo distintas de LinkedIn.
