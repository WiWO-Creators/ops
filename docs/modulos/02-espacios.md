# Espacios

> `projects` en Perfex. Ojo con el glosario: **Espacio** es el contenedor grande; "Proyecto" en la
> interfaz apunta a otra cosa (`Component`).

## Qué resuelve

El contenedor de trabajo de un cliente: sus Procesos, sus Hitos, su gente y sus archivos.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/espacios` | Tabla genérica |
| Detalle | `/espacios/[id]` | Identificador copiable, resumen, avance, cliente, fechas, miembros |
| Procesos del espacio | `/espacios/[id]/procesos` | La misma tabla y el mismo tablero del módulo Procesos, con el filtro fijo |
| Hitos | `/espacios/[id]/hitos` | Tablero de hitos |
| Archivos | `/espacios/[id]/archivos` | Lista de adjuntos |

## Endpoints que consume

| Método | Ruta | Devuelve |
|---|---|---|
| `GET` | `/projects` | Colección paginada |
| `GET` | `/projects/{id}` | Item |
| `GET` | `/projects/{id}/tasks` | Colección paginada — inyecta `filter[project_id]` |
| `GET` | `/projects/{id}/milestones` | Array plano |
| `GET` | `/projects/{id}/members` | Array plano de staff |
| `GET` | `/projects/{id}/files` | Array plano |
| `PATCH` | `/projects/{id}` | El espacio actualizado |

### Consulta

| Capacidad | Valores admitidos |
|---|---|
| `filter[]` | `status`, `clientid`, `date_from`, `date_to` (los dos sobre `start_date`) |
| `sort` | `name`, `start_date`, `deadline`, `progress`. Por defecto `name` |
| `q` | Busca en `name` |
| `include` | `custom_fields`, `members` |
| Sueltos | `member=<staffId>` |

## Campos

```jsonc
{
  "id": 44, "name": "…", "description": null,
  "status": 2,
  "client": {"id": 12, "company": "…"},
  "billing_type": 1,
  "start_date": "2026-01-15", "deadline": null,
  "date_finished": null,
  "progress": 62,                       // calculado, no la columna de la base
  "progress_from_tasks": true,
  "project_cost": null, "project_rate_per_hour": null, "estimated_hours": 120,
  "added_from": 7,
  "project_created": "2026-01-10",
  "tags": [{"id": 2, "name": "…"}],
  "counts": {"tasks": 40, "tasks_open": 15, "milestones": 4}
}
```

`progress` **es derivado**: no se edita ni se muestra como campo editable.

Hitos: `id, name, description, start_date, due_date, project_id, color, order, counts:{tasks, tasks_done}`.

## Acciones y escrituras

**`PATCH /projects/{id}` admite:** `name`, `description`, `start_date`, `deadline`,
`estimated_hours`, `status`. Nada más.

La lista es corta porque casi toda `tblprojects` está acoplada a algo: `progress` es derivada, y
`billing_type` / `project_cost` / `project_rate_per_hour` se condicionan entre sí — editarlos por
separado deja el espacio en un estado que el panel no habría producido.

**Cambiar `status` arrastra `date_finished`** y escribe una entrada en el feed del proyecto. Eso lo
hace el backend; el frontend solo tiene que refrescar el item después.

### Salir del equipo — `POST /projects/{id}/actions/leave` → `204`

Ítem "Salir del Espacio" al final del menú "Más", en tono peligroso, con diálogo de confirmación.
Sólo saca la fila de quien lo pide; el equipo del resto no se toca (para eso está "Editar equipo",
que sigue siendo `PUT /projects/{id}/members` y sigue pidiendo `projects.edit`).

**El ítem se muestra sin mirar capacidades.** La única condición es figurar en el equipo
(`esMiembro`, que la página calcula con `members` y `yo`). `projects.edit` protege reescribir el
equipo ajeno; quien se queda pegado a un Espacio en el que ya no trabaja es justamente quien no lo
tiene, y esconderle la acción la volvería inútil.

**Guard de tareas abiertas.** Si le quedan Procesos abiertos asignados en ese Espacio, la API
responde `422 open_tasks` con el número adentro del mensaje, y **ese mensaje se muestra tal cual**.
No es una regla decorativa: cualquier escritura posterior sobre esas tareas (alta, edición o acción
masiva) re-agrega al asignado al Espacio, así que dejarlo salir sería una acción que se deshace sola
y sin avisar. Tareas ya completadas no cuentan — con lo cual editar una tarea cerrada vieja sí puede
volver a meter a la persona; es un techo conocido y aceptado del backend.

**Pérdida de visibilidad, que hay que advertir antes de confirmar.** Quien no tenga `projects.view`
global deja de ver el Espacio en cuanto sale, **incluido uno que creó él**: por eso la API devuelve
`204` y no la ficha, y por eso al salir se vuelve a `/espacios` en lugar de refrescar (quedarse daría
un `404`). El texto del diálogo lo dice explícitamente.

Se puede salir aunque el Espacio quede sin nadie, y al creador no se lo protege: no existe un campo
"responsable" que quede huérfano. En `/licitaciones/{id}`, que monta la misma cabecera, la prop no
viaja y el ítem no se pinta.

## Permisos

Feature `projects`, en `permissions.projects` de `GET /me`. La visibilidad por fila la resuelve el
backend.

Además, cada espacio trae su propio bloque `settings` en Perfex (`view_task_comments`,
`view_finance_overview`, `view_gantt`, `view_timesheets`, …) que controla qué ve **el contacto del
cliente** en el portal. No aplica al staff en `ops-v2`, pero si en algún momento se abre un portal de
clientes, es de ahí que sale la lógica.

## Reglas del panel que hay que replicar

- `progress` se calcula, no se lee de la columna. Si `progress_from_tasks` está activo, sale de los
  procesos completos sobre el total.
- Los archivos del espacio traen dos campos que los del proceso no: `original_file_name` y `subject`.

Fuente: `application/views/admin/tables/projects.php` y `Projects_model.php`.

## Estado de la API

✅ Existe.

## Criterios de aceptación

1. La lista pagina, ordena y filtra por cliente y estado sin un `422`.
2. El detalle muestra el mismo avance que el panel viejo para el mismo espacio.
3. Cambiar el estado a Terminado deja `date_finished` con la misma fecha que produce el panel.
4. Los Procesos del espacio usan el motor del módulo Procesos, sin código nuevo de tabla ni tablero.
5. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
