# Espacios

> `projects` en Perfex. Ojo con el glosario: **Espacio** es el contenedor grande; "Proyecto" en la
> interfaz apunta a otra cosa (`Component`).

## Qué resuelve

El contenedor de trabajo de un cliente: sus Procesos, sus Hitos, su gente y sus archivos.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/espacios` | Tabla genérica |
| Detalle | `/espacios/[id]` | Resumen, avance, cliente, fechas, miembros |
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
