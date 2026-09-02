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

Dos cosas que un agente con contexto limpio va a leer mal si nadie se las avisa:

- **`docs/funciones-board-en-ops.md` y `docs/migracion/` describen el fork de Huly**, no `ops-v2`.
  Sirven como historia de la migración de datos; **no** como estado del frontend actual.
- **`src/componentes/proyecto/PanelArchivos.tsx` dice que la API no expone la descarga de adjuntos
  internos. Es falso hoy**: `GET /files/{tipo}/{id}/download` existe y cubre los tipos `project` y
  `task` (`modules/api/Recursos/Descargas.php`). Lo que no existe es la **subida**.

## Las tandas

Cinco tandas, pensadas para que dos subagentes no se pisen el mismo archivo. La T1 concentra la
mayor parte del valor: es la ficha que la gente abre todo el día.

| Tanda | Qué agrupa | Ítems |
|---|---|---|
| **T1 — Ficha del Proceso** | Todo lo que falta dentro de una tarea | editar, comentarios, checklist, adjuntos, seguidores, campos personalizados, recurrencia, recordatorios, tarea de cliente |
| **T2 — Administración** | Lo que hoy obliga a volver al panel viejo | roles y permisos, catálogos, grupos de clientes, perfil propio, ajustes |
| **T3 — Avisos** | El silencio de la API | notificaciones y correo |
| **T4 — Cara al cliente** | Lo que ve alguien de afuera | contratos, portal del cliente, formularios web |
| **T5 — Panel** | Transversales de navegación y salida | búsqueda global, actividad global, tareas personales, PDF y exportaciones |

## El inventario

Cada fila dice qué se pide, de dónde viene en el board, cómo está hoy en Ops y qué falta del lado de
la API. "API lista" significa que el endpoint existe y está verificado: la brecha es sólo de pantalla.

### T1 — Ficha del Proceso

| Ítem | De dónde viene en el board | Estado en Ops | API |
|---|---|---|---|
| **Editar una tarea** — renombrar, mover fechas, cambiar descripción, sacar un asignado o una etiqueta | `Tasks_model::update()` (`application/models/Tasks_model.php:673`); 2.941 tareas | Sólo alta (`AltaRapidaProceso.tsx`, `FormularioTarea.tsx`), cambio de estado y acciones masivas (`componentes/proyecto/tareas.ts:86-92`) | **Lista**: `PATCH /tasks/{id}` |
| **Comentarios de tarea** | `tbltask_comments`, 253 filas | Sólo el contador (`DetalleTarea.tsx:140`) | Falta escritura: `GET /tasks/{id}/comments` es de lectura (`controllers/V1.php:1293`) |
| **Checklist** | `Tasks_model::add_checklist_item()` (`:857`) y `update_checklist_order()` (`:887`); 418 ítems | Sólo el contador | Falta escritura (`V1.php:1297`) |
| **Adjuntos** | `tblfiles`, 219 en tareas de 253 totales | `PanelArchivos.tsx` lista los del Espacio; no sube ni ofrece descarga | Descarga **lista** (`Recursos/Descargas.php`). **Falta la subida**: sería el único endpoint que escribe en disco — whitelist de extensiones, tope de cantidad, `unique_filename`, 413 propio, multipart aparte |
| **Seguidores** | `Tasks_model::add_task_followers()` (`:1029`); 6.353 filas | Se muestran (`Cronometros.tsx:243`), no se editan | **Lista**: `PATCH /tasks/{id}` acepta `followers`, y un id inexistente falla con 422 |
| **Campos personalizados editables** — ahí viven Área de empresa y el link de Drive | `tblcustomfields` (29) y `tblcustomfieldsvalues` (4.367) | Sólo lectura (`PanelDescripcion.tsx:149`, `proyecto/tareas.ts:59`) | Falta escritura: `Recursos/CamposPersonalizados.php` sólo lee |
| **Tareas recurrentes** | `tbltasks.recurring`, 70 tareas, más el cron de Perfex | Nada | Falta: `Escritura/CrearProceso.php:172` declara que `recurring` y `cycles` no se escriben |
| **Recordatorios** | `tblreminders`, 5 filas | Nada | Falta entero: no hay ruta |
| **Tarea colgada de un cliente o prospecto** | `tbltasks.rel_type`: 149 `customer`, 76 `lead`, 300 sin relación | `dominio/alta-rapida.ts:193` sólo manda `project` o `null` | **Lista**: `Escritura/CrearProceso.php:65-67` acepta `project`, `customer` y `lead` |

### T2 — Administración

| Ítem | De dónde viene en el board | Estado en Ops | API |
|---|---|---|---|
| **Crear roles y editar permisos** | `controllers/admin/Roles.php`; `tblroles` (5) y `tblstaff_permissions` (5.714) | Asigna un rol que ya existe (`componentes/equipo/campos.ts:45`) | Falta: no hay CRUD de roles |
| **Administrar catálogos** — etiquetas, campos personalizados, estados y tipos de tarea | `tbltags` (327), `controllers/admin/Custom_fields.php` | Se leen por `GET /lookups`; no se escriben | Falta escritura |
| **Grupos de clientes** | `tblcustomer_groups`, 95 grupos | Ausentes a propósito: `componentes/cliente/campos.ts:31` deja dicho que la API no los escribe | Falta |
| **Perfil propio** — contraseña, foto, firma de correo, preferencias de aviso | `controllers/admin/Staff.php`; 184 personas | `GET /me` sin edición | La API ya escribe staff (`Escritura/Staff.php`, usada por Equipo). Falta la pantalla propia y decidir si el cambio de contraseña propio pasa por ese mismo endpoint |
| **Ajustes** | `controllers/admin/Settings.php` más 27 archivos de `views/admin/settings/includes/` | Declarado **fuera de alcance** en `docs/README.md` | Sin API. El usuario lo marcó como necesario: **la primera tarea acá es reabrir la decisión y acotar qué ajustes**, no portar los 27 |

### T3 — Avisos

| Ítem | De dónde viene en el board | Estado en Ops | API |
|---|---|---|---|
| **Notificaciones y correo** | `tblnotifications` (17.809) y `tblmail_queue` (855) | Nada: ni campana ni mail | La API **no avisa a nadie en ninguna escritura**, por diseño (`Nucleo\EfectosExternos`, apagado en `V1::__construct()`). Encenderlo es la regla 7: interruptor propio, apagado al mergear |

### T4 — Cara al cliente

| Ítem | De dónde viene en el board | Estado en Ops | API |
|---|---|---|---|
| **Contratos, como sección propia** | `controllers/admin/Contracts.php`; 33 contratos y 7 renovaciones — es el único módulo de este bloque con datos reales | Paneles de lectura dentro del Espacio y del Cliente (`PanelContratos.tsx`); sin sección | Lectura y parche listos (`Recursos/RecursoContratos.php`, `Escritura/ParcheContrato.php`). Faltan alta, borrado y adjuntos (`docs/modulos/12-contratos.md`) |
| **Portal del cliente** | Portal de contactos de Perfex; 17 contactos y 78 permisos | **Construido** en `src/app/portal/`, sin desplegar | Lista (`Recursos/RecursoPortal.php`). Falta la decisión de despliegue y el acceso de los contactos |
| **Formularios web → prospectos** | `tblweb_to_lead` (2 activos), `modules/form_sync` | Nada | Falta. Alimenta Prospectos, que hoy está oculto: coordinar antes de construir la pantalla |

### T5 — Panel

| Ítem | De dónde viene en el board | Estado en Ops | API |
|---|---|---|---|
| **Búsqueda global** | Buscador de `controllers/admin/Misc.php` | Cada listado busca lo suyo con `q`; nada cruzado | Falta: no hay ruta de búsqueda |
| **Registro de actividad global** | `tblactivity_log`, 4.757 entradas, `controllers/admin/Utilities.php` | Actividad por Espacio (`PanelActividad.tsx`) | El endpoint `activity` cuelga del Espacio (`V1.php:760`). Falta la global |
| **Tareas personales (To-do)** | `controllers/admin/Todo.php`, `tbltodos`, 64 ítems | Nada | Falta entero |
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
- **Cotizaciones, Propuestas, Pagos y Gastos**: la API está construida y verificada, pero producción
  no tiene una sola fila.

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
