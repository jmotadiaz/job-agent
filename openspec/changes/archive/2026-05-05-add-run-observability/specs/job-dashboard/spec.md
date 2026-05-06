## ADDED Requirements

### Requirement: Sección `/log` en el dashboard

El dashboard SHALL exponer una sección dedicada bajo la ruta `/log` con un índice de todos los runs persistidos en `log/` y un detalle por `runId`, accesible desde la navegación principal del dashboard.

#### Scenario: Index de runs

- **WHEN** el usuario navega a `/log`
- **THEN** la página SHALL listar todos los runs presentes en `log/` ordenados por `startedAt` descendente
- **AND** cada entrada SHALL mostrar al menos `runId`, `kind`, `startedAt`, `outcome` (si está disponible) y un indicador de si ya tiene `review.md`
- **AND** cada entrada SHALL ser un enlace a `/log/<runId>`

#### Scenario: Detalle de run

- **WHEN** el usuario navega a `/log/<runId>`
- **THEN** la página SHALL renderizar tres bloques: (1) la información de `meta.json`, (2) el `timeline.jsonl` como tabla con columnas `ts`, `level`, `module`, `event`, `payload`, (3) el `agent-trace.jsonl` como lista expandible de steps, y (4) el listado de archivos en `artifacts/` con enlaces de descarga
- **AND** la tabla del timeline SHALL ofrecer al menos un filtro por `level` y otro por `module`

#### Scenario: Run inexistente

- **WHEN** el usuario navega a `/log/<runId>` con un `runId` que no corresponde a ninguna carpeta
- **THEN** la página SHALL mostrar un mensaje de "run no encontrado" y un enlace de vuelta a `/log`

### Requirement: Control de limpieza global y por run

El dashboard SHALL exponer dos controles para eliminar runs persistidos: uno global en la página index `/log` y uno por run en la página de detalle `/log/<runId>`.

#### Scenario: Botón "Limpiar todos los logs" en la index

- **WHEN** el usuario hace clic en "Limpiar todos los logs" en `/log` y confirma la acción en el diálogo de confirmación
- **THEN** el dashboard SHALL invocar `DELETE /api/log` y eliminar todas las carpetas de runs
- **AND** la lista SHALL refrescarse y quedar vacía

#### Scenario: Botón "Eliminar este log" en el detalle

- **WHEN** el usuario hace clic en "Eliminar este log" en `/log/<runId>` y confirma
- **THEN** el dashboard SHALL invocar `DELETE /api/log/<runId>`
- **AND** SHALL redirigir al usuario a `/log`
- **AND** la lista en `/log` SHALL ya no contener ese `runId`

#### Scenario: Confirmación obligatoria

- **WHEN** el usuario activa cualquiera de los dos controles de limpieza
- **THEN** la acción SHALL requerir una confirmación explícita antes de invocar la API
- **AND** SHALL ser cancelable sin efecto

### Requirement: Control "Pedir revisión" y visualización del informe

El dashboard SHALL exponer en la página de detalle de un run un control para invocar al agente revisor sobre ese run, y SHALL renderizar el informe markdown resultante de forma legible.

#### Scenario: Run sin revisión previa

- **WHEN** el usuario navega a `/log/<runId>` y el run no tiene aún un `review.md`
- **THEN** la página SHALL mostrar un botón "Pedir revisión"
- **AND** al hacer clic, SHALL invocar `POST /api/log/<runId>/review`, mostrar un indicador de progreso, y al recibir respuesta SHALL renderizar el markdown del informe en un bloque dedicado

#### Scenario: Run ya revisado

- **WHEN** el usuario navega a `/log/<runId>` y el run tiene `review.md`
- **THEN** la página SHALL renderizar el informe directamente al cargar
- **AND** SHALL ofrecer un botón "Re-revisar" que repite la operación y sobrescribe el informe

#### Scenario: Renderizado markdown

- **WHEN** se renderiza el contenido de `review.md`
- **THEN** SHALL parsearse como markdown y mostrarse con tipografía y espaciado consistentes con el resto del dashboard
- **AND** los enlaces y bloques de código SHALL formatearse correctamente

### Requirement: Tema visual consistente con el dashboard principal

Las páginas `/log` y `/log/<runId>` SHALL usar el mismo tema oscuro que la página principal del dashboard (`src/app/Dashboard.tsx`), incluyendo las variables CSS `--bg`, `--surface`, `--border`, `--text-primary`, `--text-secondary`, `--text-muted`, y los estilos de `backdrop-blur`, bordes y fondos translúcidos.

#### Scenario: Fondo y superficies oscuras

- **WHEN** el usuario navega a `/log` o `/log/<runId>` en cualquier viewport
- **THEN** el fondo de la página SHALL usar `var(--bg)` (o equivalente oscuro)
- **AND** las tarjetas, tablas y paneles SHALL usar `var(--surface)` con bordes `var(--border)`
- **AND** los botones, badges y texto SHALL seguir la paleta del dashboard principal

#### Scenario: Cabecera consistente

- **WHEN** la página se renderiza
- **THEN** la cabecera SHALL usar el mismo estilo `sticky top-0` con `backdrop-blur-[12px]` y fondo translúcido que el dashboard principal
- **AND** el enlace de vuelta y los controles SHALL usar los mismos estilos de botón (`btn`, `btn-ghost`)

### Requirement: Diseño responsive con scroll horizontal en tablas

Las tablas de timeline y agent-trace SHALL ser legibles y navegables en viewports pequeños (móvil y tablet) sin que el contenido quede oculto o cortado.

#### Scenario: Tabla de timeline con scroll horizontal

- **WHEN** la tabla del timeline se renderiza en un viewport menor a 768px de ancho
- **THEN** la tabla SHALL envolverse en un contenedor con `overflow-x: auto` que permita scroll horizontal
- **AND** las columnas SHALL tener un ancho mínimo que garantice legibilidad (no colapsar a 0px)
- **AND** la columna `payload` SHALL truncarse con ellipsis en lugar de forzar el ancho completo del contenido JSON

#### Scenario: Detalle de agente expandible sin desbordamiento

- **WHEN** los steps del agent-trace se expanden en un viewport móvil
- **THEN** el contenido expandido SHALL respetar los límites del contenedor padre
- **AND** los bloques de código y argumentos de tools SHALL usar `overflow-x: auto` o `word-break: break-word` para evitar desbordamiento horizontal

#### Scenario: Cabecera de tabla fija en scroll

- **WHEN** el usuario hace scroll vertical en la tabla del timeline
- **THEN** la cabecera de la tabla SHALL permanecer visible (`position: sticky; top: 0`) para mantener el contexto de las columnas

#### Scenario: Controles de filtro accesibles en móvil

- **WHEN** los filtros de `level` y `module` se renderizan en un viewport menor a 640px
- **THEN** los selects SHALL ocupar el ancho disponible y apilarse verticalmente si es necesario
- **AND** SHALL ser fácilmente tocables con un tamaño mínimo de 44×44px (recomendación WCAG)

#### Scenario: Grid de meta-adaptable

- **WHEN** la tarjeta de `meta.json` se renderiza en un viewport móvil
- **THEN** el grid de 4 columnas SHALL colapsar a 2 columnas en tablets y 1 columna en móviles
- **AND** los valores largos (como `runId`) SHALL truncarse con ellipsis para evitar desbordamiento
