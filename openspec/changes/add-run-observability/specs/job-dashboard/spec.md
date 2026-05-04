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
