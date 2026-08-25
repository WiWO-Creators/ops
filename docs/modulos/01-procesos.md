# Procesos

> `tasks` en Perfex. El módulo más usado del sistema: si Procesos no sirve, el proyecto no sirve.

## Qué resuelve

La unidad de trabajo del equipo. Ver qué hay que hacer, moverlo por el tablero, comentarlo, marcar
avances y registrar tiempo.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/procesos` | Tabla genérica: filtros, orden, paginación, selector de columnas |
| Tablero | `/procesos/tablero` | Kanban con arrastre; columnas desde `lookups` |
| Detalle | `/procesos/[id]` | Panel lateral o página: datos, comentarios, lista de verificación, tiempo, adjuntos |
| Creación rápida | superposición | Solo lo obligatorio, de 5 a 8 campos |

## Endpoints que consume

| Método | Ruta | Devuelve |
|---|---|---|
| `GET` | `/tasks` | Colección paginada |
| `GET` | `/tasks?vista=tablero` | Columnas del kanban — **forma distinta**, ver abajo |
| `GET` | `/tasks/{id}` | Item, con `description` |
| `GET` | `/tasks/{id}/comments` | Array plano |
| `GET` | `/tasks/{id}/checklist` | Array plano |
| `GET` | `/tasks/{id}/timers` | Array plano |
| `GET` | `/tasks/{id}/files` | Array plano |
| `PATCH` | `/tasks/{id}` | El proceso actualizado |
| `POST` | `/tasks/{id}/actions/mark-complete` | El proceso actualizado |
| `POST` | `/tasks/{id}/actions/reopen` | El proceso actualizado. Body opcional `{status}` |
| `POST` | `/tasks/{id}/mover` | El proceso actualizado |
| `POST` | `/tasks/{id}/timer` | `201` con el cronómetro abierto |
| `DELETE` | `/tasks/{id}/timer` | `204` |

Y `GET /lookups`, que trae `task_statuses` y `task_priorities`.

### Consulta

| Capacidad | Valores admitidos |
|---|---|
| `filter[]` | `status`, `priority`, `project_id`, `milestone_id`, `billable`, `date_from`, `date_to` (los dos sobre `duedate`) |
| `sort` | `name`, `due_date`, `start_date`, `date_added`, `priority`, `status`. Prefijo `-` para descendente. Por defecto `due_date` |
| `q` | Busca en `name` |
| `include` | `custom_fields`, `description` |
| Sueltos | `assignee=<staffId>`, `follower=<staffId>`, `tag=<tagId>`, `vista=tablero` |

Una lista separada por comas en un `filter[]` se traduce a `IN (...)`: `filter[status]=1,2` trae los
dos estados. Cualquier nombre fuera de esas listas devuelve `422`.

### La vista tablero tiene otra forma

`GET /tasks?vista=tablero` **no** devuelve un array de procesos. Devuelve un array de columnas, y
cada una pagina por su cuenta:

```jsonc
{"data": [
  {"columna": {"id": 1, "name": "…", "color": "#…", "order": 1, "filter_default": …},
   "tarjetas": [ /* procesos */ ],
   "pagination": {"page": 1, "per_page": 25, "total": 87, "total_pages": 4}}
]}
```

`page` y `per_page` aplican **a cada columna**, no al conjunto. Cargar más en una columna no toca las
otras.

## Campos

```jsonc
{
  "id": 512, "name": "…", "status": 2, "priority": 3,
  "start_date": "2026-08-01", "due_date": "2026-08-30",
  "date_added": "2026-08-01T14:03:00Z", "date_finished": null,
  "added_from": 7,
  "rel_type": "project", "rel_id": 44,
  "project": {"id": 44, "name": "…"},        // solo si rel_type === "project"
  "milestone": {"id": 3, "name": "…"},
  "billable": true, "billed": false, "hourly_rate": 0,
  "is_public": false, "visible_to_client": false, "recurring": false,
  "kanban_order": 4,
  "assignees": [{"id": 7, "full_name": "…", "profile_image_url": null}],
  "followers": [ /* misma forma */ ],
  "tags": [{"id": 2, "name": "…"}],
  "counts": {"comments": 3, "checklist": 5, "checklist_done": 2, "attachments": 1},
  "timer_activo": {"id": 91, "staff_id": 7, "start_time": "2026-08-25T12:00:00Z"}
}
```

`description` llega solo en el detalle o con `include=description` — no viaja en los listados, a
propósito. `custom_fields` llega con `include=custom_fields`.

Subrecursos:

| Subrecurso | Campos |
|---|---|
| `comments` | `id, task_id, content, staff:{id,full_name}, date_added` |
| `checklist` | `id, task_id, description, finished, order, assigned` |
| `timers` | `id, task_id, staff_id, start_time, end_time, segundos, note` |
| `files` | `id, file_name, filetype, rel_type, rel_id, staff_id, date_added, visible_to_customer, external, url, thumbnail_url` |

## Acciones y escrituras

**`PATCH /tasks/{id}` admite exactamente:** `name`, `description`, `start_date`, `due_date`,
`priority` (1 a 4), `billable`, `milestone`. Cualquier otra clave devuelve
`422 {"campo":["no_editable"]}`. Un `PATCH` con cuerpo vacío o sin cambios devuelve `200` con el item
y no escribe.

**`status` no está en esa lista.** Cambiar de estado es una acción, no un campo:

| Acción | Endpoint |
|---|---|
| Completar | `POST /tasks/{id}/actions/mark-complete` |
| Reabrir | `POST /tasks/{id}/actions/reopen`, body opcional `{status}` |
| Mover en el tablero | `POST /tasks/{id}/mover` |
| Arrancar cronómetro | `POST /tasks/{id}/timer`, body opcional `{note}` |
| Detener cronómetro | `DELETE /tasks/{id}/timer`, body opcional `{note}` |

Fuera de la whitelist con motivo, y no por olvido: `billed` e `invoice_id` (un `billed = 1` falso saca
el proceso de la facturación para siempre), el bloque de recurrencia (lo maneja el cron), `is_public`
(puentea la visibilidad entera: es escalada de privilegio, no un campo) y `dateadded` / `addedfrom`
(inmutables).

## Permisos

Feature `tasks`, capacidades `view`, `view_own`, `create`, `edit`, `delete`. Llegan en
`permissions.tasks` de `GET /me` y sirven para ocultar controles. La visibilidad por fila la resuelve
el backend: un proceso no visible devuelve `404`, no `403`.

## Reglas del panel que hay que replicar

Estas no son detalles de presentación. Omitirlas deja la interfaz mintiendo:

- **Mover una tarjeta son dos operaciones**, no una: el cambio de estado con toda su cascada, y
  después el reordenamiento, que toca la **columna entera**. El cuerpo es
  `{columna: int, posicion: int, columna_completa: int[]}` — hay que enviar los ids de la columna tal
  como los tiene el cliente. Las tarjetas que el cliente no cargó por paginación **se empujan al
  fondo**: es el comportamiento del panel, y la interfaz debería evitar el arrastre en una columna
  paginada a medias, o avisar.
- **Arrancar un cronómetro cierra los demás de esa persona**, en cualquier proceso, y según la opción
  `timer_started_change_status_in_progress` puede además pasar el proceso a "En progreso". Las dos
  opciones se leen del servidor en cada llamada. Tras arrancar un cronómetro **hay que refrescar más
  que el proceso tocado**.
- **Completar cierra los cronómetros abiertos del proceso. Reabrir no los reabre.** Es una asimetría
  real del panel, replicada tal cual.
- **Cambiar el estado de un proceso ya completo** no pasa por `mark_as`: limpia `datefinished`.
- **`task_statuses` de `lookups` viene ordenado por `order`, no por `id`.** El orden real es
  1, 4, 3, 2, 5. Ordenar las columnas del tablero por id da un tablero equivocado.
- `409 conflict` en tres casos concretos: ya hay un cronómetro abierto, el proceso está facturado, la
  columna no existe.
- Detener un cronómetro **valida dueño** (el panel no lo hace). Un staff no administrador solo detiene
  los suyos.

Fuente de columnas, joins y permisos: `wiwo-board/application/views/admin/tables/tasks.php`.
Cascadas: `Tasks_model.php`.

## Estado de la API

✅ Existe y está completo, con una salvedad: los archivos devuelven
`url: "/api/v1/files/task/{id}/download"`, pero **ese endpoint no está enrutado** — responde `404
Recurso desconocido: "files"`. Hasta que se implemente, el botón de descarga debe apuntar al panel
clásico.

## Criterios de aceptación

1. Arrastrar una tarjeta entre columnas deja, en el panel viejo, el mismo estado **y el mismo orden de
   la columna completa**.
2. Arrancar un cronómetro cierra el que estaba abierto en otro proceso, y la interfaz lo refleja sin
   recargar.
3. Completar un proceso cierra sus cronómetros abiertos; reabrirlo no los reabre.
4. Un `PATCH` con una clave fuera de la whitelist se muestra como error **de ese campo**, no como
   fallo genérico.
5. Las columnas del tablero salen en el orden 1, 4, 3, 2, 5.
6. `filter[status]=1,2` trae los dos estados; `filter[inventado]=1` muestra un error entendible.
7. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
