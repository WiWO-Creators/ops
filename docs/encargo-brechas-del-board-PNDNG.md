# Encargo: cerrar las brechas del board en Ops

Inventario de lo que el board (`board.wiwo.me`, Perfex) hace y `ops-v2` todavía no, ya priorizado por
el usuario, con la evidencia de dónde sale cada línea. Es el punto de partida de un agente con
contexto limpio que va a repartir el trabajo en subagentes.

**Nadie escribe código hasta que la propuesta de su tanda esté aprobada.** El primer entregable de
cada subagente es una propuesta visual en un artefacto, no un commit. La sección
[El artefacto de propuesta](#el-artefacto-de-propuesta) fija el formato.

## De dónde sale la lista

Relevamiento del 02/09/2026 sobre tres fuentes:

- el código del board en `/home/wiwo/ops.wiwo/wiwo-board/`,
- la base del contenedor `board-db` (dump de producción del 19/08/2026), y
- el código de `ops-v2` en su estado de hoy.

El usuario marcó línea por línea en un artefacto: **22 "lo necesito", 2 "después", 3 "no va"**.
Prospectos y Facturas quedaron fuera del relevamiento porque ya se decidieron ocultas del inicio
(commit `0282b16`).

Los volúmenes se reproducen sin abrir el dump:

```bash
podman exec board-db mariadb -uroot -pboard wiwo_board -N -e "SELECT COUNT(*) FROM tbltask_comments;"
```

En la base local hay filas de prueba en facturas, cotizaciones, gastos y tickets. En producción esos
cuatro están en cero.

## Reglas del encargo

1. **Una propuesta aprobada antes de una línea de código.** El artefacto de propuesta es el
   entregable de la primera vuelta.
2. **`/ui-skills` es obligatorio antes de proponer.** Cada subagente lo invoca para llegar a una idea
   moderna y coherente con la visual nueva de Ops, y dice en su propuesta qué skill usó y qué tomó de
   ahí. Una propuesta sin ese paso se rechaza sin leerla.
3. **Todo lo que agrega algo se construye con la skill `feature-aislada`**: worktree propio, rama
   propia, pausa para revisión y merge. Nada de trabajar sobre el clon principal.
4. **El glosario es intocable** (`docs/glosario.md`): Proceso, Espacio, Hito. Ningún componente
   escribe esos nombres a mano; salen de `src/dominio/glosario.ts`.
5. **El sistema de diseño manda** (`docs/sistema-de-diseno.md`): tokens de `neo.css`, Outfit para
   titulares y Plus Jakarta Sans para interfaz, `#4242FF` como acento y `#3BFF00` sólo como relleno,
   nunca como texto.
6. **El contrato manda sobre las fichas** (`docs/contrato-api.md`). Si un ítem necesita un endpoint
   que no existe, se agrega primero en `wiwo-board/modules/api/` y se documenta en el contrato; recién
   después se escribe la pantalla.
7. **Los efectos externos se mergean apagados.** `Nucleo\EfectosExternos` está desactivado en
   `V1::__construct()`: ninguna escritura de la API manda correo ni webhooks. Lo que los encienda
   entra con interruptor propio, apagado por defecto.
8. **Cada pantalla nueva lleva "Abrir en el panel clásico"** apuntando a la misma entidad en
   `board.wiwo.me`, mientras el módulo no esté completo.

## Correcciones al material viejo

- **Los documentos que describían el fork de Huly se borraron.** El censo medido del board en
  producción vive ahora en [`referencia/censo-del-board.md`](referencia/censo-del-board.md): ése es
  el dato de volúmenes, no los papeles de la migración.
- **`src/componentes/proyecto/PanelArchivos.tsx:12-14` sigue diciendo que la API no expone la
  descarga de adjuntos internos, y es falso.** `GET /files/{tipo}/{id}/download` existe y cubre los
  tipos `project` y `task` (`modules/api/Recursos/Descargas.php`). **Pendiente real**: nadie corrigió
  ni el comentario ni la columna que esconde el botón de descarga. La subida, que en su momento
  tampoco existía, hoy sí (`POST /tasks/{id}/files`, `POST /projects/{id}/files`).

## Las tandas

Cinco tandas, pensadas para que dos subagentes no se pisen el mismo archivo. La T1 concentra la
mayor parte del valor: es la ficha que la gente abre todo el día.

| Tanda | Qué agrupa | Ítems |
|---|---|---|
| **T1 — Ficha del Proceso** | Todo lo que falta dentro de una tarea | editar, comentarios, checklist, adjuntos, seguidores, campos personalizados, recurrencia, recordatorios, tarea de cliente |
| **T2 — Administración** | Lo que hoy obliga a volver al panel viejo | roles y permisos, catálogos, grupos de clientes, perfil propio, ajustes |
| **T3 — Avisos** | El silencio de la API: la infraestructura está, nadie la llama | notificaciones y correo |
| **T4 — Cara al cliente** | Lo que ve alguien de afuera | ~~contratos~~ (cancelado), ~~portal del cliente~~ (hecho), formularios web |
| **T5 — Panel** | Transversales de navegación y salida | búsqueda global, actividad global, tareas personales, PDF y exportaciones |

## El inventario

Cada fila dice qué se pide, de dónde viene en el board, cómo está hoy en Ops y qué falta del lado de
la API. "API lista" significa que el endpoint existe y está verificado: la brecha es sólo de pantalla.

**Revisado el 04/09/2026 contra `wiwo-board/modules/api/`: la columna API cambió casi entera.** De
los diecisiete ítems del inventario, catorce ya tienen endpoint y esperan sólo la pantalla. Lo que
sigue sin existir en la API es el PDF y las exportaciones, y los formularios web a prospectos.

### T1 — Ficha del Proceso

| Ítem | De dónde viene en el board | Estado en Ops | API |
|---|---|---|---|
| **Editar una tarea** — renombrar, mover fechas, cambiar descripción, sacar un asignado o una etiqueta | `Tasks_model::update()` (`application/models/Tasks_model.php:673`); 2.941 tareas | Sólo alta (`AltaRapidaProceso.tsx`, `FormularioTarea.tsx`), cambio de estado y acciones masivas (`componentes/proyecto/tareas.ts:86-92`) | **Lista**: `PATCH /tasks/{id}` |
| **Comentarios de tarea** | `tbltask_comments`, 253 filas | Sólo el contador (`DetalleTarea.tsx:140`) | **Lista**: `POST /tasks/{id}/comments` y `PATCH\|DELETE /tasks/{id}/comments/{cid}` (`V1.php:1549`, `Escritura/ComentarioProceso.php`) |
| **Checklist** | `Tasks_model::add_checklist_item()` (`:857`) y `update_checklist_order()` (`:887`); 418 ítems | Sólo el contador | **Lista**: `POST /tasks/{id}/checklist`, `PUT` para reordenar y `PATCH\|DELETE` sobre un ítem (`V1.php:1582`) |
| **Adjuntos** | `tblfiles`, 219 en tareas de 253 totales | `PanelArchivos.tsx` lista los del Espacio; no sube ni ofrece descarga | **Lista, subida incluida**: `POST /tasks/{id}/files` y `POST /projects/{id}/files` con su `DELETE` (`V1.php:2469`, `Escritura/Adjunto.php`), y la descarga en `Recursos/Descargas.php`. La brecha es entera de pantalla |
| **Seguidores** | `Tasks_model::add_task_followers()` (`:1029`); 6.353 filas | Se muestran (`Cronometros.tsx:243`), no se editan | **Lista**: `PATCH /tasks/{id}` acepta `followers`, y un id inexistente falla con 422 |
| **Campos personalizados editables** — ahí viven Área de empresa y el link de Drive | `tblcustomfields` (29) y `tblcustomfieldsvalues` (4.367) | Sólo lectura (`PanelDescripcion.tsx:149`, `proyecto/tareas.ts:59`) | **Lista**: `PATCH /custom-fields/values` escribe los valores, y `GET\|POST /custom-fields` más `GET\|PATCH\|DELETE /custom-fields/{id}` administran el catálogo (`V1.php:4066`) |
| **Tareas recurrentes** | `tbltasks.recurring`, 70 tareas, más el cron de Perfex | Nada | **Lista, detrás de interruptor**: `PATCH /tasks/{id}` acepta `recurring`, `repeat_every`, `recurring_type` y `cycles` sólo si `wiwo_procesos_recurrentes` vale `'1'` (migración `0010`), porque la copia la hace el cron de Perfex, que sí notifica. Apagado, es un 422 y no un silencio |
| **Recordatorios** | `tblreminders`, 5 filas | Nada | **Lista**: `GET\|POST /tasks/{id}/reminders` y `GET\|PATCH\|DELETE /tasks/{id}/reminders/{rid}` (`V1.php:3806`, `Escritura/Recordatorio.php`) |
| **Tarea colgada de un cliente o prospecto** | `tbltasks.rel_type`: 149 `customer`, 76 `lead`, 300 sin relación | `dominio/alta-rapida.ts:193` sólo manda `project` o `null` | **Lista**: `Escritura/CrearProceso.php:65-67` acepta `project`, `customer` y `lead` |

### T2 — Administración

| Ítem | De dónde viene en el board | Estado en Ops | API |
|---|---|---|---|
| **Crear roles y editar permisos** | `controllers/admin/Roles.php`; `tblroles` (5) y `tblstaff_permissions` (5.714) | Asigna un rol que ya existe (`componentes/equipo/campos.ts:45`); los permisos individuales sí se editan (`DialogoPermisos.tsx`) | **Lista**: `GET\|POST /roles`, `GET\|PATCH\|DELETE /roles/{id}` y `GET /roles/catalogo` (`V1.php:3564`, `Escritura/Rol.php`). Falta la pantalla de administración de roles |
| **Administrar catálogos** — etiquetas, campos personalizados, estados y tipos de tarea | `tbltags` (327), `controllers/admin/Custom_fields.php` | Se leen por `GET /lookups`; no se escriben | **Lista para los dos catálogos que son tablas**: `GET\|POST /tags` y `GET\|PATCH\|DELETE /tags/{id}` (`V1.php:4147`), más el CRUD de `custom-fields` (`V1.php:4066`). Los estados y tipos de tarea de Perfex son constantes, no filas: no hay nada que administrar |
| **Grupos de clientes** | `tblcustomer_groups`, 95 grupos | Ausentes: `componentes/cliente/campos.ts:31` todavía dice que la API no los escribe, y ya no es cierto | **Lista**: `GET\|POST /customer-groups`, `GET\|PATCH\|DELETE /customer-groups/{id}` y `GET\|PUT /customer-groups/clients/{id}` (`V1.php:4190`). La asignación cuelga de acá y no de `PATCH /clients/{id}`, a propósito |
| **Perfil propio** — contraseña, foto, firma de correo, preferencias de aviso | `controllers/admin/Staff.php`; 184 personas | `GET /me` sin edición; `/equipo/mi-area` existe | **Lista**: `GET\|PATCH /me/perfil`, `PUT /me/password` (exige la actual), `POST /me/foto` y `GET /me/mi-area` (`V1.php:3629`). Falta sólo la pantalla de perfil |
| **Ajustes** | `controllers/admin/Settings.php` más 27 archivos de `views/admin/settings/includes/` | **Construido**: `/administracion/acceso` y `/administracion/correo` lo consumen (`src/datos/ajustes.ts`) | **Lista**: `GET /settings`, `PATCH /settings` y `GET\|POST /settings/google-jwks` (`V1.php:3844`), con 17 opciones editables y 6 de sólo lectura. Ni SMTP ni credenciales entran |

### T3 — Avisos

| Ítem | De dónde viene en el board | Estado en Ops | API |
|---|---|---|---|
| **Notificaciones y correo** | `tblnotifications` (17.809) y `tblmail_queue` (855) | Sólo administración: `/administracion/correo` lee `GET /notifications/settings` y `/notifications/mail-queue`. No hay campana | **Infraestructura lista, sin usar**: `Escritura/Aviso.php` escribe la campana y encola correo, y `/notifications` sirve la lista, el contador, marcar leído, las preferencias por persona, el interruptor global, el visor de la cola y un aviso de prueba (`V1.php:3427`). **Faltan dos cosas**: que las escrituras la llamen (siguen mudas por `Nucleo\EfectosExternos`, regla 7) y la campana en el front |

### T4 — Cara al cliente

| Ítem | De dónde viene en el board | Estado en Ops | API |
|---|---|---|---|
| **Contratos, como sección propia** | `controllers/admin/Contracts.php`; 33 contratos y 7 renovaciones | Nada: `PanelContratos.tsx` se borró del front | **El recurso ya no existe.** `RecursoContratos.php` y `Escritura/ParcheContrato.php` se borraron en `b854567`: `GET /contracts` responde `404`. Los datos siguen en `tblcontracts` y el portal del cliente los lee. Retomar esto es reabrir F3, con lo que eso cuesta ([`fases/F3-ventas-CANCELADA.md`](fases/F3-ventas-CANCELADA.md)) |
| ~~**Portal del cliente**~~ | Portal de contactos de Perfex; 17 contactos y 78 permisos | **Hecho.** Construido y desplegado, doce pantallas bajo `/portal/` | Lista (`Recursos/RecursoPortal.php`). El acceso se resolvió con el enlace de un solo uso: `POST /contacts/{id}/access-link` |
| **Formularios web → prospectos** | `tblweb_to_lead` (2 activos), `modules/form_sync` | Nada | Falta. Alimenta Prospectos, que hoy está oculto: coordinar antes de construir la pantalla |

### T5 — Panel

| Ítem | De dónde viene en el board | Estado en Ops | API |
|---|---|---|---|
| **Búsqueda global** | Buscador de `controllers/admin/Misc.php` | Cada listado busca lo suyo con `q`; nada cruzado | **Lista**: `GET /search` cruza Procesos, Espacios, Clientes y Personas con un solo término (`V1.php:3892`, `Recursos/RecursoBusqueda.php`). Falta el ⌘K, que además es criterio de F1 |
| **Registro de actividad global** | `tblactivity_log`, 4.757 entradas, `controllers/admin/Utilities.php` | Actividad por Espacio (`PanelActividad.tsx`) y por persona | **Lista**: `GET /audit` y `GET /audit/filters` leen `tblactivity_log` entera, sólo para administración (`V1.php:3925`, `Recursos/RecursoAuditoria.php`). Falta la pantalla |
| **Tareas personales (To-do)** | `controllers/admin/Todo.php`, `tbltodos`, 64 ítems | Nada | **Lista**: `GET\|POST /todos`, `POST /todos/reorder` y `GET\|PATCH\|DELETE /todos/{id}` (`V1.php:3959`, `Escritura/Todo.php`) |
| **PDF, envío por correo y exportaciones** | PDF y envío de facturas, cotizaciones y propuestas; `modules/exports` | Exporta CSV (`componentes/datos/csv.ts`) | **404 a propósito**, declarado en `docs/contrato-api.md`. Antes de construir hay que revertir esa decisión explícitamente |

## Lo que no entra en esta vuelta

Marcado **"después"** — se releva, no se construye todavía:

- **Calendario de eventos** (`tblevents`, 10 filas). Ojo: la agenda de Salas ya existe en Ops y no es
  lo mismo.
- **Base de conocimiento (4), Suscripciones (2), Chat interno (19 mensajes), Departamentos (1)** —
  juntos porque casi no se usan.

Marcado **"no va"** — no se propone ni se estima:

- **Informes** (`controllers/admin/Reports.php`).
- **Tickets**: el soporte vive en wiwo.center.
- **Cotizaciones, Propuestas, Pagos y Gastos**: producción no tiene una sola fila. Las dos primeras
  ya no existen en la API —se borraron con F3 (`b854567`)—; Pagos y Gastos siguen construidos y sin
  pantalla.

## El artefacto de propuesta

Cada subagente entrega **un artefacto por tanda** con una propuesta por ítem, y el usuario decide ahí
mismo. Formato fijo, para que las cinco tandas se lean igual.

**Contenido de cada propuesta** (una tarjeta por ítem del inventario):

- Qué se ve y dónde vive en la navegación de Ops.
- Qué endpoints consume, y cuáles hay que agregar antes en `modules/api/`.
- Qué skill de `/ui-skills` se usó y qué se tomó de ahí.
- Esfuerzo (S / M / L) y el riesgo principal.

**Controles, por propuesta:**

- **Veredicto**, tres opciones excluyentes: `Va` · `Cambiar` · `No va`. Volver a tocar la opción
  activa la desmarca.
- **Comentarios**: un campo de texto libre, guardado con *debounce* de ~600 ms.

**Cómo se guarda:**

- `capabilities: {db: {}}`; la página resuelve el almacén con `await claude.use('db')` y sigue
  funcionando si devuelve `null`.
- Un documento por tanda: `propuestas/<tanda>`, con la forma
  `{items: {<id>: {veredicto: 'va' | 'cambiar' | 'no', comentario: string, actualizado: <ISO>}}}`.
- Respaldo en `localStorage` con la misma clave, para que una caída del almacén no borre lo marcado.
- **El objeto que devuelve el almacén viene congelado.** Hay que mutar una copia
  (`const siguiente = {...estado}`) y reasignar: mutarlo en el lugar no falla, no hace nada, y la
  marca se pierde en silencio. Este bug ya se pagó una vez.

**Presentación:** tema claro y oscuro por tokens en `:root`, Outfit y Plus Jakarta Sans desde Google
Fonts con su pila de respaldo, título corto y propio, y un contador arriba de cuántas propuestas
quedan sin decidir.

## Cuando la propuesta vuelva aprobada

Recién ahí se construye, y con `feature-aislada`: una rama por ítem o por grupo chico de ítems, la
verificación que corresponda, y merge sin dejar worktrees ni ramas huérfanas. Lo que toque la API se
mergea primero, con el contrato actualizado en el mismo commit.
