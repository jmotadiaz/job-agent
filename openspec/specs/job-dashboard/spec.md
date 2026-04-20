## ADDED Requirements

### Requirement: Listado de ofertas con filtros por estado

El dashboard SHALL renderizar una lista de todas las ofertas presentes en la tabla `jobs` con filtros por `status` (`new`, `shortlisted`, `applied`, `discarded`) y ordenación por `fetched_at` descendente por defecto.

#### Scenario: Filtrado por estado

- **WHEN** el usuario selecciona el filtro `shortlisted`
- **THEN** la lista SHALL mostrar únicamente ofertas cuyo `status` es exactamente `shortlisted`
- **AND** SHALL reflejar los cambios de estado inmediatamente al aplicar acciones CRUD sin requerir recarga completa de página

#### Scenario: Visualización por oferta

- **WHEN** la lista se renderiza
- **THEN** cada oferta SHALL mostrar al menos `title`, `company`, `location`, `match_score`, un extracto de `match_reason`, y el estado actual
- **AND** SHALL proporcionar un enlace a la URL original de la oferta

### Requirement: Botón global "buscar nueva oferta"

El dashboard SHALL exponer un botón "buscar nueva oferta" que invoque `POST /api/scout/run` de forma síncrona, muestre un indicador de progreso mientras la ejecución está en curso, y muestre al usuario el resultado de forma explícita.

#### Scenario: Match persistido

- **WHEN** la invocación devuelve `{ kind: "match", job }`
- **THEN** el dashboard SHALL refrescar la lista para incluir la nueva oferta en la parte superior
- **AND** SHALL mostrar una notificación breve indicando que se ha encontrado un match

#### Scenario: Sin match

- **WHEN** la invocación devuelve `{ kind: "no_match", reason }`
- **THEN** el dashboard SHALL mostrar una notificación con la razón devuelta
- **AND** la lista SHALL permanecer sin cambios

#### Scenario: Error de navegación

- **WHEN** la invocación devuelve un error (HTTP 502)
- **THEN** el dashboard SHALL mostrar el mensaje de error de forma legible
- **AND** SHALL permitir al usuario reintentar sin recargar la página

### Requirement: Acción "generar" por oferta

Cada oferta listada SHALL ofrecer una acción "generar" que invoque `POST /api/writer/generate` con el `jobId` correspondiente y muestre al usuario el resultado cuando termine.

#### Scenario: Generación exitosa

- **WHEN** la generación termina con éxito
- **THEN** la fila de la oferta SHALL exponer dos enlaces de descarga: uno para el CV y otro para la carta
- **AND** los enlaces SHALL seguir disponibles en visitas posteriores al dashboard mientras los ficheros existan en disco

### Requirement: Descarga de PDFs generados

El dashboard SHALL permitir al usuario descargar los ficheros PDF producidos por el Writer a través de URLs servidas por el propio servidor Next.js local.

#### Scenario: Descarga de CV

- **WHEN** el usuario pulsa el enlace de descarga del CV para una generación existente
- **THEN** el navegador SHALL recibir el fichero PDF correspondiente como attachment o inline según la configuración del servidor

#### Scenario: Fichero ausente

- **WHEN** el fichero referenciado por `cv_path` o `cover_path` ya no existe en disco
- **THEN** el endpoint de descarga SHALL responder con HTTP 404
- **AND** el dashboard SHALL ofrecer la opción de regenerar

### Requirement: CRUD mínimo de estado — aplicado y descartado

El dashboard SHALL permitir al usuario cambiar el estado de una oferta entre `shortlisted`, `applied` y `discarded` mediante acciones explícitas.

#### Scenario: Marcar como aplicado

- **WHEN** el usuario pulsa "marcar como aplicado" en una oferta con status `shortlisted`
- **THEN** el sistema SHALL actualizar la fila correspondiente a `status = 'applied'`
- **AND** la lista SHALL reflejar el cambio inmediatamente

#### Scenario: Marcar como descartado

- **WHEN** el usuario pulsa "descartar" en una oferta con status `shortlisted` o `new`
- **THEN** el sistema SHALL actualizar la fila correspondiente a `status = 'discarded'`
- **AND** la oferta SHALL dejar de aparecer por defecto en la vista principal salvo que el filtro `discarded` esté seleccionado

#### Scenario: Las transiciones no borran datos

- **WHEN** una oferta cambia de estado por cualquier acción CRUD
- **THEN** el sistema SHALL conservar todos los demás campos (`title`, `company`, `match_score`, `match_reason`, etc.) sin modificación

### Requirement: Bifurcación vía feedback humano sobre una generación

El dashboard SHALL ofrecer, sobre cualquier generación existente, una UI que permita al usuario emitir un `rating` en la escala `1..5` y un `comment` libre opcional. La confirmación de ese feedback SHALL disparar inmediatamente `POST /api/writer/generate` con el payload `{ jobId, parentGenerationId, feedbackRating, feedbackComment? }`, creando una nueva rama hija en el árbol de generaciones de la oferta. Emitir feedback y crear la nueva rama SHALL ser un único acto desde el punto de vista del usuario — no existe un paso intermedio "persistir feedback sin iterar", ni una operación de edición de feedback previamente emitido.

#### Scenario: Emisión de feedback e iteración exitosa

- **WHEN** el usuario emite un `rating` entre 1 y 5 (con o sin `comment`) sobre una generación existente y confirma
- **THEN** el dashboard SHALL mostrar un indicador de progreso mientras el Writer se ejecuta
- **AND** al terminar, SHALL renderizar la nueva generación como hija de la elegida y exponer sus enlaces de descarga de CV y carta

#### Scenario: Rating inválido

- **WHEN** el usuario intenta confirmar con un `rating` fuera del rango `1..5` o un valor no entero
- **THEN** la UI SHALL rechazar la confirmación antes de llamar al endpoint y mostrar un mensaje claro
- **AND** el sistema SHALL NO disparar al Writer

#### Scenario: Feedback inmutable

- **WHEN** se inspecciona una generación hija ya creada
- **THEN** su `feedback_rating` y `feedback_comment` SHALL aparecer como información de solo lectura
- **AND** el dashboard SHALL NO ofrecer ninguna acción para editarlos

### Requirement: Visualización del árbol de iteraciones por oferta

El dashboard SHALL mostrar, para cada oferta con generaciones asociadas, el conjunto completo de generaciones organizadas según su relación `parent_generation_id`, de forma que sea posible identificar visualmente cadenas e hijos hermanos (bifurcaciones). El usuario SHALL poder emitir feedback (y así crear una nueva rama) desde **cualquier** nodo del árbol, no exclusivamente desde el más reciente.

#### Scenario: Cadena lineal

- **WHEN** una oferta tiene tres generaciones `A → B → C` donde cada una es hija de la anterior
- **THEN** el dashboard SHALL renderizarlas como una cadena lineal en orden cronológico respecto a `created_at`
- **AND** cada nodo hijo (no la raíz) SHALL mostrar su `feedback_rating` y un indicador de si tiene `feedback_comment`

#### Scenario: Bifurcación

- **WHEN** una oferta tiene generaciones `A`, `B` (hija de `A`), y `B'` (también hija de `A`, creada después de `B`)
- **THEN** el dashboard SHALL renderizar el árbol mostrando `B` y `B'` como hijos hermanos de `A`
- **AND** cada una SHALL mostrar su propio feedback
- **AND** SHALL quedar claro visualmente que ambas parten del mismo padre

#### Scenario: Bifurcación desde un nodo intermedio

- **WHEN** el usuario selecciona un nodo intermedio `B` de una cadena `A → B → C`, emite feedback sobre `B` y confirma
- **THEN** el sistema SHALL crear una nueva generación `B'` con `parent_generation_id = B.id`
- **AND** el árbol renderizado SHALL reflejar que `B'` coexiste con `C` como hijos hermanos de `B`
- **AND** la rama `A → B → C` SHALL permanecer intacta y visible

### Requirement: Indicador de obsolescencia por `profile_hash`

Para cada oferta con una o más generaciones asociadas, el dashboard SHALL comparar el `profile_hash` más reciente de esas generaciones contra el hash actual del `profile.md` y mostrar un indicador visual cuando difieran.

#### Scenario: Perfil sin cambios

- **WHEN** el `profile_hash` de la última generación coincide con el SHA-1 actual de `profile.md`
- **THEN** el dashboard SHALL NO mostrar ningún indicador de obsolescencia

#### Scenario: Perfil modificado tras generación

- **WHEN** el `profile_hash` de la última generación NO coincide con el SHA-1 actual de `profile.md`
- **THEN** el dashboard SHALL mostrar un indicador visual (badge) junto a la oferta con texto equivalente a "perfil cambió — regenerar"
- **AND** SHALL permitir al usuario disparar una nueva generación para actualizar los PDFs
