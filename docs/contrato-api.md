# Contrato de la API v1

Fuente de verdad compartida entre `wiwo-board/modules/api/` y `ops-v2`. **Se congela al cerrar F0.**
Cambiarlo después se puede, pero se anuncia y se actualizan documento y mock en el mismo commit.

**Este documento es la única copia del contrato.** `modules/api/README.md` apunta acá en vez de
repetirlo: dos copias de un contrato divergen, y cuando divergen nadie sabe cuál manda.

Base: `https://board.wiwo.me/api/v1/`

> Los nombres de campo salen del esquema real de Perfex, verificado contra el dump. No se inventan
> ni se traducen al español: la traducción ocurre una sola vez, al presentar (ver
> [glosario.md](glosario.md)).

## Reglas generales

- **JSON siempre.** Ni una respuesta con HTML, ni un `redirect`, ni un `echo` suelto. Si el panel
  responde 302 a HTML sin sesión, la API responde **401 con cuerpo JSON**.
- **Fechas ISO-8601 en UTC**, siempre (`2026-08-24T14:03:00Z`). Nunca formateadas según el locale del
  staff: eso lo hace el frontend.
- **Tipos casteados.** CodeIgniter devuelve todo como string; la API no. `id` es número, `active` y
  `billable` son booleanos, `hourly_rate` es número.
- **Nunca 200 con `success: false`.** El código HTTP es la respuesta.
- Los campos `null` **se incluyen**. Un campo ausente significa "no pedido" (ver `fields`), no "vacío".

## Envelope

Éxito con colección:

```json
{
  "data": [ { "id": 1, "…": "…" } ],
  "meta": { "pagination": { "page": 1, "per_page": 25, "total": 143, "total_pages": 6 } }
}
```

Éxito con recurso único:

```json
{ "data": { "id": 1, "…": "…" } }
```

Error:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "El nombre es obligatorio.",
    "details": { "name": ["required"] }
  }
}
```

`details` sólo aparece en `422`. El frontend lo inyecta campo a campo en react-hook-form; el resto va
a un aviso.

### Códigos

| Código | Cuándo |
|---|---|
| `200` | Lectura correcta, o escritura que devuelve el recurso |
| `201` | Recurso creado. Incluye el recurso completo |
| `204` | Borrado, o preflight `OPTIONS` |
| `400` | Petición malformada (JSON inválido, parámetro con tipo imposible) |
| `401` | Sin token, token inválido, expirado o revocado |
| `403` | Autenticado pero sin permiso para esa acción |
| `404` | No existe, o no es visible para este staff |
| `409` | Conflicto (por ejemplo, mover una tarjeta a una columna imposible) |
| `413` | Archivo más grande que `post_max_size` |
| `422` | Validación fallida |
| `500` | Error del servidor. El cuerpo nunca incluye el stack |

### Códigos de error

`unauthenticated` · `token_expired` · `token_revoked` · `forbidden` · `not_found` ·
`validation_failed` · `conflict` · `payload_too_large` · `rate_limited` · `server_error`

## Autenticación

Token opaco emitido y guardado en `tbl_api_tokens`. **No es JWT**: sin estado no se puede revocar, y
la revocación importa más que ahorrarse una consulta.

Todas las peticiones autenticadas llevan el token en **cualquiera de estas dos cabeceras**:

```
Authorization: Bearer <access_token>
X-Api-Key: <access_token>
```

Se aceptan las dos por una razón concreta, verificada en el código: detrás de cPanel, PHP corre como
CGI/FastCGI, y **Apache no propaga `Authorization` por defecto** — es una medida anti-filtración de
credenciales. Ya hay rastro de esa pelea en el repositorio: `form_sync` lee sus cabeceras probando
varias combinaciones de mayúsculas.

Aceptar ambas cuesta tres líneas y evita descubrir el problema en producción. `GET /health` informa
cuál llegó.

### `POST /auth/login`

```json
{ "email": "alguien@wiwo.me", "password": "…" }
```

`201` sin 2FA:

```json
{ "data": {
  "access_token": "…", "expires_in": 3600,
  "refresh_token": "…", "refresh_expires_in": 2592000,
  "staff": { "…": "ver recurso staff" }
} }
```

`200` con 2FA pendiente:

```json
{ "data": { "two_factor_required": true, "challenge_token": "…", "method": "email" } }
```

`method` es `email` o `app`. El `challenge_token` vive 5 minutos.

Credenciales inválidas → `401` **genérico**. Nunca distinguir "el email no existe" de "la contraseña
está mal". Staff inactivo → `403` con código `forbidden`.

**`429 rate_limited`** tras demasiados intentos fallidos: 8 por email o 20 por IP en 15 minutos. Sólo
cuentan los `401` — una cuenta desactivada no es un intento de adivinar la clave, y contarla dejaría
a esa persona frenando a las demás. Un acceso correcto limpia el contador.

El panel **no tiene** ningún freno de intentos: el hook `failed_login_attempt` no tiene un solo
listener. Es la única pieza que la API implementa de más, y va porque `/auth/login` es un límite de
confianza — una puerta nueva con la misma llave.

> Internamente llama a `Authentication_model->login()` tal cual, para conservar los hooks
> (`failed_login_attempt`, `before_staff_login`), el registro de actividad y el control de intentos.

### `POST /auth/2fa`

```json
{ "challenge_token": "…", "code": "123456" }
```

Devuelve lo mismo que un login exitoso. Código inválido o vencido → `401`.

### `POST /auth/refresh`

```json
{ "refresh_token": "…" }
```

**Rotativo**: devuelve un par nuevo y revoca el anterior. Reusar un refresh ya revocado revoca
**todas** las sesiones de ese staff — es la señal de que el token se filtró.

**A diferencia de login y 2fa, la respuesta NO trae el bloque `staff`**: solo los cuatro campos de
tokens. Quien refresca ya sabe de quién es la sesión, así que el cliente conserva el `staff` que
tenía. Verificado contra la API real; leer `staff.id` en la respuesta de refresh lanza, y como el
error ocurre después de que la API ya rotó el token, el síntoma es una sesión que se cierra sola sin
que nada en el servidor parezca fallar.

```json
{ "data": { "access_token": "…", "expires_in": 3600,
            "refresh_token": "…", "refresh_expires_in": 2592000 } }
```

### `POST /auth/logout`

Revoca el token actual. `?all=1` revoca todas las sesiones del staff. → `204`.

### `GET /me`

```json
{ "data": {
  "id": 12, "email": "alguien@wiwo.me",
  "firstname": "…", "lastname": "…", "full_name": "…",
  "profile_image_url": "…", "is_admin": false, "role_id": 3,
  "permissions": { "tasks": ["view","create","edit"], "projects": ["view_own"] },
  "secciones_habilitadas": ["procesos","espacios"],
  "locale": "es", "hourly_rate": 0
} }
```

`permissions` es el mapa que el frontend usa para podar columnas y acciones antes de renderizar.
`secciones_habilitadas` es la bandera por persona que decide qué partes de `ops-v2` están vivas: se
revoca sin desplegar.

**Hoy `secciones_habilitadas` es la lista fija `["procesos","espacios"]`** (`controllers/V1.php:1415`).
Los ocho recursos de ventas, comercial y soporte responden igual, pero la interfaz **no los ofrece**:
es decisión del usuario, no un pendiente técnico. Habilitar una sección es editar esa lista.

`permissions` **no trae una clave `tickets`**: Perfex no tiene una feature de permisos con ese nombre
(ver el recurso `tickets` más abajo).

### `GET /health`

Sin autenticación.

```json
{ "data": {
  "ok": true, "version": "1.0.0",
  "auth_header_visible": true,
  "api_key_visible": true,
  "php": "8.2.33", "sapi": "apache2handler"
} }
```

`auth_header_visible` y `api_key_visible` no son decorativos: dicen cuál de las dos cabeceras llegó
realmente al servidor. **Es lo primero a mirar tras desplegar**, con `curl` contra el VPS: convierte
el riesgo de CGI/FastCGI en un dato del día uno en vez de una sorpresa cuando el frontend no pueda
autenticarse.

## Consultas

| Parámetro | Forma | Nota |
|---|---|---|
| Paginación | `?page=2&per_page=25` | `per_page` máximo 100 |
| Orden | `?sort=-dateadded,name` | `-` es descendente. Whitelist por recurso |
| Filtros | `?filter[status]=4&filter[project_id]=8` | Whitelist por recurso |
| Rango de fechas | `?filter[date_from]=2026-01-01&filter[date_to]=2026-03-31` | |
| Búsqueda | `?q=texto` | Campos definidos por recurso |
| Campos | `?fields=id,name,status` | Se aplica **después** de serializar |
| Relaciones | `?include=customer,custom_fields` | Opt-in, para evitar N+1 |

### Dónde vale `?include=`

La whitelist de relaciones es **por camino**, no por recurso, y donde no hay relaciones opcionales la
lista está vacía a propósito. Un `include` que el camino no declara es **`422`**, nunca un `200` que
lo ignora:

| Camino | Qué acepta |
|---|---|
| Listado y ficha de un recurso (`/invoices`, `/invoices/{id}`, …) | lo que declare ese recurso |
| Listas acotadas (`/projects/{id}/invoices`, `/clients/{id}/contracts`, …) | **nada** |
| Los ocho subrecursos de un Espacio (`milestones`, `timesheets`, `notes`, `activity`, `discussions`, `files`, `members`, `gantt`), más `overview` y `/projects/stats` | **nada** |
| Los cinco subrecursos de un Proceso (`comments`, `checklist`, `timers`, `assignees`, `files`) | **nada** |
| `/clients/{id}/notes` y `/clients/{id}/files` | **nada** |
| `/discussions/*`, `/comments/*`, `/me`, `/lookups`, `/custom-fields` | **nada** |
| Todo `/portal/*` | **nada** |

En el portal la lista vacía es una decisión y no un olvido: sus presentaciones son fijas para que
agregar una relación al panel no la publique sola del lado del cliente.

**Whitelist, siempre.** Ninguna clave de `filter[]` ni de `sort` llega al Query Builder sin estar en
la lista del recurso. Es la diferencia entre un filtro y una inyección.

Una clave fuera de la whitelist devuelve **`422 validation_failed`**, con `details` nombrando el
parámetro ofensor — **nunca se ignora en silencio**. Un filtro ignorado deja a la interfaz mostrando
datos de más sin que nadie se entere; uno que falla se arregla el mismo día.

```json
{ "error": { "code": "validation_failed", "message": "Filtro desconocido: \"inventado\".",
             "details": { "filter[inventado]": ["unknown"] } } }
```

`per_page` es la excepción: pedir 500 se **recorta** a 100 en vez de fallar. Es un cliente optimista,
no un cliente roto.

## Recursos de Fase 1

### `staff`

`GET /staff` · `GET /staff/{id}`

```json
{ "id": 12, "email": "…", "firstname": "…", "lastname": "…", "full_name": "…",
  "profile_image_url": "…", "is_admin": false, "role_id": 3, "active": true,
  "hourly_rate": 0, "last_login": "2026-08-24T09:12:00Z" }
```

Nunca se exponen: `password`, `new_pass_key`, `google_auth_secret`, `two_factor_auth_code`.

Filtros: `active`, `role_id`, `q` (nombre y email). Orden: `firstname`, `lastname`, `last_login`.

### `lookups`

`GET /lookups` — un solo viaje con todos los catálogos que el frontend necesita antes de pintar nada.

```json
{ "data": {
  "task_statuses": [
    { "id": 1, "name": "No iniciado",       "color": "#64748b", "order": 1,   "filter_default": true },
    { "id": 4, "name": "En progreso",       "color": "#3b82f6", "order": 2,   "filter_default": true },
    { "id": 3, "name": "En pruebas",        "color": "#0284c7", "order": 3,   "filter_default": true },
    { "id": 2, "name": "Esperando respuesta","color": "#84cc16","order": 4,   "filter_default": true },
    { "id": 5, "name": "Completado",        "color": "#22c55e", "order": 100, "filter_default": false }
  ],
  "task_priorities": [
    { "id": 1, "name": "Baja",    "color": "#777"    },
    { "id": 2, "name": "Media",   "color": "#03a9f4" },
    { "id": 3, "name": "Alta",    "color": "#ff6f00" },
    { "id": 4, "name": "Urgente", "color": "#fc2d42" }
  ],
  "project_statuses": [ "…" ],
  "tags": [ { "id": 3, "name": "urgente" } ],
  "roles": [ { "id": 3, "name": "…" } ],
  "departments": [ { "id": 1, "name": "…" } ]
} }
```

> **Trampa real**: los `id` de estado de tarea **no siguen el orden de visualización**. `4` (En
> progreso) va segundo y `2` (Esperando respuesta) va cuarto, mientras que `5` (Completado) tiene
> `order: 100`. El frontend **siempre** ordena por `order`, nunca por `id`. Las columnas del tablero
> salen de este array, no de una constante en el código.
>
> Los estados y prioridades pasan por los filtros `before_get_task_statuses` y `tasks_priorities`, así
> que un módulo puede agregar los suyos. Por eso son un endpoint y no una constante duplicada.

### `clients`

`GET /clients` · `GET /clients/{id}`

La clave primaria en la base es `userid`; la API la expone como **`id`**.

```json
{ "id": 42, "company": "…", "vat": "…", "phonenumber": "…",
  "city": "…", "state": "…", "zip": "…", "address": "…", "country_id": 11,
  "website": "…", "active": true, "default_currency": 1, "default_language": "spanish",
  "datecreated": "2025-04-02T00:00:00Z", "lead_id": null,
  "billing": { "street": "…", "city": "…", "state": "…", "zip": "…", "country_id": 11 },
  "shipping": { "…": "…" },
  "tags": [ { "id": 3, "name": "…" } ] }
```

Nunca se expone `stripe_id`.

Filtros: `active`, `country_id`, `q` (empresa). Include: `contacts`, `custom_fields`.

### `projects` → **Espacios** en la interfaz

`GET /projects` · `GET /projects/{id}` · `GET /projects/{id}/tasks` ·
`GET /projects/{id}/milestones` · `GET /projects/{id}/members` · `GET /projects/{id}/files`

```json
{ "id": 8, "name": "…", "description": "…",
  "status": 2, "client": { "id": 42, "company": "…" },
  "billing_type": 1, "start_date": "2026-01-15", "deadline": "2026-06-30",
  "date_finished": null, "progress": 45, "progress_from_tasks": true,
  "project_cost": 12000.00, "project_rate_per_hour": null, "estimated_hours": 320.00,
  "added_from": 12, "project_created": "2026-01-10",
  "tags": [], "counts": { "tasks": 34, "tasks_open": 12, "milestones": 4 } }
```

`start_date`, `deadline` y `project_created` son **fechas sin hora** (`date` en la base): se devuelven
como `YYYY-MM-DD`, no como instante ISO. `date_finished` sí es `datetime` → ISO completo.

**`progress` es calculado, no leído.** La columna `tblprojects.progress` está desactualizada en la
mayoría de las filas: con `progress_from_tasks = 1` —que es el valor por defecto— el panel la ignora
y cuenta las tareas. Y `status = 4` (Finalizado) fuerza 100 sin importar nada más. La API replica ese
cálculo; servir la columna tal cual sería mentir.

`counts` viene siempre: es lo que la lista necesita para no hacer una consulta por fila.

Filtros: `status`, `clientid`, `member` (staff id), `date_from`/`date_to` sobre `start_date`, `q`.
Orden: `name`, `start_date`, `deadline`, `progress`.
Include: `custom_fields`, `members`.

### `tasks` → **Procesos** en la interfaz

`GET /tasks` · `GET /tasks/{id}` · `GET /tasks/{id}/comments` · `GET /tasks/{id}/checklist` ·
`GET /tasks/{id}/timers` · `GET /tasks/{id}/files` · `POST /tasks`

```json
{ "id": 512, "name": "…", "description": "…",
  "status": 4, "priority": 2,
  "start_date": "2026-08-01", "due_date": "2026-08-30",
  "date_added": "2026-07-28T10:15:00Z", "date_finished": null,
  "added_from": 12,
  "rel_type": "project", "rel_id": 8,
  "project": { "id": 8, "name": "…" },
  "milestone": { "id": 3, "name": "…" },
  "billable": true, "billed": false, "hourly_rate": 0,
  "is_public": false, "visible_to_client": false,
  "recurring": false,
  "kanban_order": 4,
  "assignees": [ { "id": 12, "full_name": "…", "profile_image_url": "…" } ],
  "followers": [ { "id": 15, "full_name": "…" } ],
  "tags": [ { "id": 3, "name": "urgente" } ],
  "counts": { "comments": 5, "checklist": 8, "checklist_done": 3, "attachments": 2 },
  "timer_activo": { "id": 88, "staff_id": 12, "start_time": "2026-08-24T13:00:00Z" } }
```

Notas que evitan errores:

- **`rel_type` / `rel_id` son polimórficos.** Una tarea puede colgar de un proyecto, un cliente, una
  factura, un ticket… El bloque `project` sólo aparece cuando `rel_type === "project"`.
- `start_date` y `due_date` son fechas sin hora; `date_added` y `date_finished` son instantes.
- `timer_activo` es `null` si nadie está contando tiempo. Es lo que pinta el cronómetro en la barra
  superior sin una consulta aparte.
- **Los tiempos vienen en ISO**, aunque la base los guarde como timestamps Unix en `varchar`:
  `tbltaskstimers.start_time` y `end_time` no son `DATETIME`. La conversión la hace la API.
- `counts` evita N+1 en las listas: sin él, cada fila de la tabla pide sus comentarios.

Filtros: `status` (admite lista: `filter[status]=1,4`), `priority`, `project_id`, `milestone_id`,
`assignee`, `follower`, `tag`, `billable`, `date_from`/`date_to` sobre `due_date`, `q`.
Orden: `name`, `due_date`, `start_date`, `date_added`, `priority`, `status`.
Include: `custom_fields`, `description` (se omite en listas: son `longtext`).

**Vista de tablero**: `GET /tasks?vista=tablero&filter[project_id]=8` devuelve las tarjetas agrupadas,
con paginación **por columna**. En tareas hay columnas de miles de filas: cargar la columna entera no
es una opción.

### `POST /tasks` — alta de un Proceso

Devuelve `201` con el Proceso serializado igual que `GET /tasks/{id}`.

```json
{ "name": "Grilla Colbún septiembre",
  "description": null,
  "start_date": "2026-09-01", "due_date": "2026-09-30",
  "priority": 3, "billable": true, "milestone": null,
  "rel_type": "project", "rel_id": 8,
  "assignees": [12, 15], "followers": [], "tags": ["urgente"] }
```

**`name` es el único campo obligatorio.** Todo lo demás tiene un valor por defecto, y esa es la
propiedad que hace posible el alta rápida de una línea desde cualquier pantalla.

| Campo | Por defecto |
|---|---|
| `status` | La **primera columna del tablero** por `order` — no se acepta del cliente |
| `priority` | `2` (Media) |
| `billable` | `false` |
| `rel_type` / `rel_id` | `null` — **un Proceso sin Espacio es válido** |
| `added_from` | El staff autenticado |

Lo que evita errores:

- **`rel_type` y `rel_id` pueden quedar vacíos a propósito.** `tbltasks.rel_type` admite `''`, y
  obligar a elegir el Espacio antes de escribir el título es exactamente lo que termina empujando la
  tarea a un chat. El Espacio se asigna después con `PATCH`.
- **`status` no viaja en el alta.** Tiene sus propias acciones porque arrastra cascadas; dejarlo
  entrar acá abriría una segunda puerta a la misma transición.
- **Un id que no existe falla con `422`, no se descarta.** Vale para `rel_id`, `assignees` y
  `followers`: una tarea que se guarda sin el asignado que se eligió es peor que un error.

```json
{ "error": { "code": "validation_failed", "message": "Hay campos que no se pueden guardar.",
             "details": { "name": ["requerido"], "rel_id": ["no_existe"] } } }
```

Requiere `create` sobre `tasks`; sin él, `403`.

### Acciones

| Endpoint | Efecto |
|---|---|
| `POST /tasks/{id}/actions/mark-complete` | `status: 5`, sella `datefinished` y **cierra los cronómetros abiertos** |
| `POST /tasks/{id}/actions/reopen` | Limpia `datefinished`. Sin `status` en el cuerpo, usa la heurística del panel |
| `POST /tasks/{id}/mover` | `{ "columna": 4, "posicion": 2, "columna_completa": [12, 7, 33] }` — arrastre del tablero. `columna_completa` son los ids de la columna destino tal como los tiene el cliente: sin ellos no hay reordenamiento, y las tarjetas que el cliente no cargó por paginación se empujan al fondo |
| `POST /tasks/{id}/timer` | Arranca el cronómetro. Cuerpo opcional: `{ "note": "…" }` |
| `DELETE /tasks/{id}/timer` | Lo detiene |

Las acciones existen en vez de un `PATCH` genérico porque **no son "cambiar un campo": arrastran
cascadas**. Vale conocerlas, porque explican comportamientos que de otro modo parecen bugs:

- **Completar cierra los cronómetros abiertos** de la tarea. **Reabrir no los reabre**: es una
  asimetría del panel, replicada tal cual.
- **Reabrir sin `status`** deja la tarea en "En progreso" si la fecha de inicio ya pasó, y en "Por
  iniciar" si no.
- **Cambiar el estado de una tarea que ya está completa** pasa por la rama de reapertura y limpia
  `datefinished`. Puede dejarla en `status: 5` sin fecha de finalización: es lo que hace el panel.
- **Mover son dos operaciones**: el cambio de estado con toda su cascada, y después el
  reordenamiento — que toca la **columna entera** y empuja al fondo las tarjetas que el cliente no
  cargó por paginación. Si el cliente tiene el orden completo, puede mandarlo en
  `{ "columna_completa": [512, 513, …] }` y se aplica tal cual.
- **Arrancar un cronómetro cierra los demás** de esa persona, en cualquier tarea, y puede pasar la
  tarea a "En progreso". Un cronómetro activo por persona, global.

Respuestas de error propias de las acciones:

| Situación | Código |
|---|---|
| La columna del tablero no existe | `409 conflict` |
| Arrancar un cronómetro sin ser **asignado** de la tarea | `403 forbidden` |
| Arrancar sobre una tarea ya facturada (`billed = 1`) | `409 conflict` |
| Detener un cronómetro que no es tuyo | `404 not_found` |

### `PATCH /tasks/{id}` y `PATCH /projects/{id}`

**Sólo se escriben las claves presentes.** Omitir un campo lo deja como está — el `PATCH` es
realmente parcial. (En el panel no lo es: su formulario pone en `0` lo que no viene.)

Campos editables de un Proceso: `name`, `description`, `start_date`, `due_date`, `priority`,
`billable`, `milestone`.

Campos editables de un Espacio: `name`, `description`, `start_date`, `deadline`, `estimated_hours`,
`status`.

**Cualquier otra clave devuelve `422`**, con `details` nombrándola — no se ignora en silencio, porque
un campo que el cliente cree haber guardado y no se guardó es peor que un error:

```json
{ "error": { "code": "validation_failed", "message": "Hay campos que no se pueden escribir.",
             "details": { "billed": ["no_editable"] } } }
```

Lo que queda fuera, y por qué: `billed` e `invoice_id` son dinero; el bloque de recurrencia lo maneja
el cron; `is_public` puentea la visibilidad entera; `status` de un Proceso tiene su propia acción; y
`progress` de un Espacio es derivado.

`status` de un Espacio **sí** es editable, y arrastra `date_finished` — a `NOW()` al entrar en
Finalizado, a `null` al salir — más una entrada en el feed de actividad del proyecto.

### `files`

`GET /projects/{id}/files` · `GET /tasks/{id}/files`

```json
{ "id": 77, "file_name": "propuesta.pdf", "filetype": "application/pdf",
  "size": 184320, "rel_type": "task", "rel_id": 512,
  "staff_id": 12, "date_added": "2026-08-02T11:00:00Z",
  "visible_to_customer": false,
  "url": "/api/v1/files/task/77/download",
  "thumbnail_url": null }
```

> **La ruta de descarga lleva el tipo de entidad**, no sólo el id: `/api/v1/files/{tipo}/{id}/download`
> (`Recursos/RecursoArchivos.php:171`). Los siete tipos enrutados son `project`, `task`, `customer`,
> `lead`, `ticket`, `expense` y `contract` (`Recursos/Descargas.php:45-90`). **El mock sirve todavía la
> forma vieja `/api/v1/files/{id}/download`** (`mock/datos.js:293`): al integrar contra la API real,
> esa URL cambia.

**Nunca se expone la ruta real de `uploads/`.** Hoy la única protección de esa carpeta es que la URL
no se adivina; publicarla en JSON lo empeoraría.

**Si `external` no es nulo**, el archivo vive en Drive, Dropbox o similar y **no hay archivo local**:
`url` trae el enlace externo tal cual, no una ruta de descarga.

> Dato sucio real de la base: `tblfiles.rel_type` tiene 14 filas con `'tasks'` en plural además de 208
> con `'task'`. La API consulta ambos y normaliza a singular hacia afuera; filtrar sólo por el
> singular pierde 14 adjuntos.

`GET /files/{tipo}/{id}/download` autentica, valida el permiso sobre la entidad dueña y sirve el
binario. Acepta también la sesión de un contacto del portal, con el correo ya verificado.

**`POST /files/{id}/link` no está construido.** El plan era un token de un solo uso para `<img src>` y
`<a download>`, que no mandan el header `Authorization`; hoy `V1::descargaRuta()` sólo acepta `GET`
con `download` como último segmento, y el token sale de `Authorization` o de `X-Api-Key`
(`Nucleo/Peticion.php`), nunca de la query string. Mientras no exista, los binarios se piden desde el
BFF, que sí puede poner la cabecera.

## Recursos de ventas, comercial y soporte

Los ocho recursos que faltaban: `invoices`, `payments`, `estimates`, `proposals`, `expenses`,
`contracts`, `leads` y `tickets`. Están construidos y verificados contra el código del panel
(`modules/api/README.md` tiene el detalle de cada frente y sus divergencias deliberadas).

Tres advertencias que valen para los ocho:

- **Ninguno entra en `secciones_habilitadas` de `GET /me`.** Esa lista sigue siendo
  `['procesos','espacios']` por decisión del usuario (`controllers/V1.php:1415`): la API responde,
  pero `ops-v2` no ofrece la sección. Habilitarlas es editar esa lista, no desplegar código nuevo.
- **`?include=` no se ignora en ningún lado.** Los ocho declaran `includesPermitidos` —vacío donde no
  hay relaciones opcionales, como en `payments`— y llaman a `Consulta::includes()` tanto en el
  listado como en la ficha, así que `?include=lo-que-sea` es **`422`** y no un `200` silencioso. La
  grieta que este documento describía —seis de los ocho ignorando el `include`— está cerrada, y con
  ella la de los subrecursos y la del portal: ver "Dónde vale `?include=`" más arriba.
- **`?fields=` funciona en los ocho** (`Consulta::recortar()`), igual que en los recursos del núcleo.

### `invoices` → **Facturas**

`GET /invoices` · `GET /invoices/{id}` · `GET /invoices/{id}/items` ·
`GET /invoices/{id}/payments` · `POST /invoices` · `PATCH /invoices/{id}` ·
`POST /invoices/{id}/actions/cancel` · `POST /invoices/{id}/actions/uncancel`

Fila de la lista:

```json
{ "id": 9, "number": "INV-000009", "date": "2026-08-01", "duedate": "2026-08-31",
  "status": 1, "subtotal": 100000.00, "total_tax": 19000.00, "total": 119000.00,
  "adjustment": 0.0, "discount_percent": 0.0, "discount_total": 0.0, "discount_type": "",
  "currency": { "id": 1, "symbol": "$", "name": "COP", "is_default": true },
  "client": { "id": 42, "company": "…" },
  "project": { "id": 8, "name": "…" },
  "sale_agent": { "id": 12, "full_name": "…", "profile_image_url": "…" },
  "sent": false, "datesend": null, "recurring": 0 }
```

La ficha agrega:

```json
{ "prefix": "INV-", "number_format": 1, "number": 9,
  "datecreated": "2026-08-01T09:00:00Z",
  "added_by": { "id": 12, "firstname": "…", "…": "…" },
  "clientnote": null, "adminnote": null, "terms": null,
  "show_quantity_as": 1, "allowed_payment_modes": [1, 2],
  "include_shipping": false, "show_shipping_on_invoice": true,
  "billing":  { "street": null, "city": null, "state": null, "zip": null,
                "country": { "id": 11, "name": "Colombia" } },
  "shipping": { "…": "…" },
  "items": [ { "id": 31, "description": "…", "long_description": "", "qty": 1.0,
               "rate": 100000.0, "unit": "", "is_optional": false, "is_selected": true,
               "order": 1,
               "taxes": [ { "name": "IVA", "rate": 19.0, "registered": true } ] } ],
  "totals": { "subtotal": 100000.0, "total_tax": 19000.0, "discount_percent": 0.0,
              "discount_total": 0.0, "discount_type": "", "adjustment": 0.0,
              "total": 119000.0,
              "taxes": [ { "name": "IVA", "rate": 19.0, "total": 19000.0 } ] },
  "payments": [ { "id": 4, "amount": 50000.0, "payment_mode": { "id": "1", "name": "Efectivo" },
                  "paymentmethod": null, "date": "2026-08-10",
                  "daterecorded": "2026-08-10T14:22:00Z", "transactionid": null } ],
  "payments_total": 50000.0, "total_left_to_pay": 69000.0 }
```

**`hash`, `token` y `short_link` no salen nunca.** `tblinvoices.hash` es la llave del enlace público
de pago: quien la tiene ve **y paga** la factura sin autenticarse. No entra en ningún `SELECT` de
`RecursoFacturas`, y `humo.sh` lo comprueba en cada corrida.

**`status` es columna guardada, no derivada.** La escribe `update_invoice_status()`
(`invoices_helper.php:302`). Si el cron de vencimientos no corrió, una factura vencida sigue
diciendo "Sin pagar" en el panel — y la API dice lo mismo. Derivarla acá haría que los dos sistemas
discreparan sobre el mismo documento.

**`total_left_to_pay` no es `total - payments_total`.** El saldo sale de
`get_invoice_total_left_to_pay()` (`invoices_helper.php:49-88`), que descuenta pagos **y créditos
aplicados** con los decimales de la instalación; `payments_total` es la suma cruda de
`tblinvoicepaymentrecords`, el renglón "Pagos" que dibuja el panel.

Filtros: `status`, `clientid`, `project_id`, `sale_agent`, `date_from`/`date_to` sobre `date`,
`year`. Orden: `date`, `duedate`, `total`, `number`, `status`. Búsqueda `q` sobre
`formatted_number`. Sin `include`.

`POST /invoices` exige `clientid`, `date` y al menos una línea. `PATCH /invoices/{id}` acepta
`clientid`, `project_id`, `date`, `duedate`, `currency`, `sale_agent`, `discount_percent`,
`discount_total`, `discount_type`, `adjustment`, `clientnote`, `adminnote`, `terms`, `items`
(`Escritura/Factura.php:60-64`). Todo lo demás es `422`. **`status` no se escribe nunca**: lo decide
`update_invoice_status()`.

**Las líneas del cuerpo llevan las tasas como cadena `"nombre|tasa"`**, no como objeto:

```json
{ "items": [ { "description": "Servicio X", "long_description": null,
               "qty": 1, "rate": 100000, "unit": null, "taxes": ["IVA|19"] } ] }
```

Es la forma que parte `_maybe_insert_post_item_tax()` (`sales_helper.php:694-700`). En
**cotizaciones y propuestas la misma clave viaja como objeto** `{"name":"IVA","rate":19}`
(`Escritura/DocumentoDeVenta.php:472-495`), y **la lectura de los tres devuelve siempre objetos**.
Son tres formas para el mismo dato: se documenta la asimetría en vez de esconderla.

Una tasa que no exista en `tbltaxes` es `422` antes de escribir
(`RecursoItems::exigirTasasRegistradas()`): Perfex guarda el `"nombre|tasa"` que venga y una tasa
inventada queda desnormalizada en `tblitem_tax` para siempre.

**Cuando el `PATCH` trae `items`, el juego de líneas se reemplaza entero.** El contrato manda las
líneas sin `id`; mezclar altas, bajas y ediciones por posición es como se pierde una línea sin que
nadie lo note.

**No existe el descuento por línea.** `tblitemable` no tiene ninguna columna de descuento
(comprobado con `SHOW COLUMNS` en `herramientas/comparar-dinero.php:422`) y Perfex descuenta sólo
por documento, con `discount_type` en `""`, `before_tax` o `after_tax`.

Errores propios:

| Situación | Respuesta |
|---|---|
| Tocar `currency`, `discount_percent`, `discount_total`, `discount_type`, `adjustment` o `items` de una factura con pagos aplicados | `409 conflict`, con el número de pagos en el mensaje |
| Cancelar una factura ya cancelada, o descancelar una que no lo está | `409 conflict` |
| `clientid` o `currency` que no existen | `422`, `{"clientid":["unknown"]}` |
| `discount_type` fuera de `""`/`before_tax`/`after_tax` | `422 {"discount_type":["unknown"]}` |
| `items` vacío en el alta | `422 {"items":["required"]}` |
| Sin `view`, sin `view_own` y con `allow_staff_view_invoices_assigned` en `0` | `403 forbidden` |
| Factura que existe pero este staff no ve | `404 not_found` |

El `409` de la factura con pagos es **más estricto que el panel**: `admin/Invoices.php:333-356` sólo
pide `edit` y dibuja el formulario completo sobre una factura ya cobrada. Lo no monetario —notas,
términos, fechas, cliente, espacio, agente— se sigue editando.

### `payments` → **Pagos**

`GET /payments` · `GET /payments/{id}` · `POST /payments` · `DELETE /payments/{id}`

```json
{ "id": 4,
  "invoice": { "id": 9, "number": "INV-000009", "status": 3 },
  "client": { "id": 42, "company": "…" },
  "amount": 50000.0,
  "currency": { "id": 1, "symbol": "$", "name": "COP", "is_default": true },
  "payment_mode": { "id": "1", "name": "Efectivo" },
  "paymentmethod": null, "date": "2026-08-10",
  "daterecorded": "2026-08-10T14:22:00Z",
  "note": null, "transactionid": null }
```

**`payment_mode.id` es una cadena, no un número.** `tblinvoicepaymentrecords.paymentmode` es
`varchar(40)`: en un pago manual guarda el id de `tblpayment_modes` y en uno por pasarela el
identificador del gateway (`"stripe"`). Castearlo a entero convierte `stripe` en `0`.

**La compuerta de área de pagos mira `view_own` sobre `invoices`, no sobre `payments`.** Son tres
condiciones y la tercera es una opción de la instalación: `view payments` **o** `view_own invoices`
**o** `allow_staff_view_invoices_assigned = 1` (`admin/Payments.php:53`,
`RecursoPagos::puedeListar()`). Es una de las tres reglas de visibilidad distintas que Perfex tiene
para el mismo dinero, y las tres se replican tal cual:

| Superficie | Regla | Fuente |
|---|---|---|
| Lista de facturas | con `view_own`: `addedfrom = yo` (`OR sale_agent = yo` si la opción está encendida). Sin `view_own`: **sólo** `sale_agent = yo`, **sin mirar la opción** | `invoices_helper.php:672` |
| Ficha de una factura | con `view_own`: `addedfrom = yo`. `sale_agent = yo` **sólo si la opción está encendida** | `invoices_helper.php:705` |
| Pagos | feature `payments`, con `view_own invoices` revalidado **dentro del SQL**, y **sin respaldo a `sale_agent` solo** | `views/admin/tables/payments.php:29` |

Consecuencia visible, que es del panel y no de la API: con la opción apagada y sin `view_own`, el
panel **lista** una factura de la que uno es agente y después deniega el acceso al abrirla. La API
hace lo mismo.

Filtros: `invoiceid`, `clientid`, `paymentmode`, `date_from`/`date_to`. Orden: `date`, `amount`,
`id`. Búsqueda `q` sobre `transactionid`. Sin `include`.

`POST /payments` acepta `invoiceid`, `amount`, `paymentmode`, `date`, `transactionid`, `note`
(`Escritura/Pago.php:47`) y exige el permiso `create` sobre `payments` — que **sí existe**
(`staff_helper.php:83-89`). **No hay `PATCH /payments/{id}`**: `Payments_model::update()` sólo mueve
la nota y el modo, y corregir un cobro asentado se hace borrando y volviendo a cargar, que es lo que
ofrece el panel. `DELETE` exige `delete` sobre `payments`.

Registrar un pago **cambia el estado de la factura**: lo decide `update_invoice_status()` dentro de
`Payments_model::add()`. Tras un `POST`, se relee la factura; el frontend no infiere el estado.

Errores propios:

| Situación | Respuesta |
|---|---|
| `invoiceid` ausente o no numérico | `422 {"invoiceid":["required"]}` |
| Factura que este staff no ve | `404 not_found` — y no `403`, que confirmaría que existe |
| `amount` menor o igual a cero | `422 {"amount":["min:0"]}` |
| Modo de pago inactivo, inexistente o marcado `expenses_only` | `422 {"paymentmode":["unknown"]}` |
| `date` que no es `YYYY-MM-DD` o no existe en el calendario | `422 {"date":["date"]}` |
| Pago de otro staff abierto por id | `404 not_found` |

Ese último `404` es **divergencia deliberada**: `admin/Payments.php:77-83` protege la ficha de un
pago sólo con la compuerta de área, así que en el panel cualquiera con `view_own invoices` abre el
pago de otro cambiando el número en la barra de direcciones. Replicar un agujero de acceso no es
replicar el panel.

### `estimates` → **Cotizaciones**

`GET /estimates` · `GET /estimates/{id}` · `GET /estimates/{id}/items` · `POST /estimates` ·
`PATCH /estimates/{id}` · `POST /estimates/{id}/actions/convert-to-invoice`

Fila de la lista:

```json
{ "id": 5, "number": "EST-000005", "number_raw": 5,
  "date": "2026-08-01", "duedate": "2026-08-31", "expirydate": "2026-08-31",
  "status": 1, "subtotal": 100000.0, "total_tax": 19000.0, "total": 119000.0,
  "adjustment": 0.0, "discount_percent": 0.0, "discount_total": 0.0, "discount_type": "",
  "currency": { "id": 1, "symbol": "$", "name": "COP", "is_default": true },
  "client": { "id": 42, "company": "…" },
  "project": null,
  "sale_agent": { "id": 12, "full_name": "…", "profile_image_url": "…" },
  "invoice": null,
  "tags": [ { "id": 3, "name": "urgente" } ] }
```

**`duedate` no es una columna de presupuestos: la columna es `expirydate`.** Se exponen las dos con
el mismo valor y `sort=duedate` traduce, porque el frontend usa la misma tabla genérica para factura
y presupuesto (`RecursoCotizaciones.php:118`).

La ficha agrega `reference_no`, `clientnote`, `adminnote`, `terms`, `datecreated`, `sent`,
`datesend`, `show_quantity_as`, `pipeline_order`, `is_expiry_notified`, `include_shipping`,
`show_shipping_on_estimate`, `billing`, `shipping`, `invoiced_date`, `items`, `totals` y:

```json
{ "acceptance": { "firstname": null, "lastname": null, "email": null,
                  "date": null, "ip": null, "signature": null } }
```

**Ni `hash` ni `short_link` salen nunca.** `hash` (`estimates_helper.php:47`) es la credencial del
enlace público, y `short_link` (`estimates_helper.php:11-40`) es esa misma URL acortada con bit.ly:
el mismo hash con un salto de por medio. Los dos están fuera del `SELECT`.

Estados (`Estimates_model::__construct()`): **1 Borrador, 2 Enviada, 3 Rechazada, 4 Aceptada,
5 Expirada**. Salen también de `GET /lookups` en `estimate_statuses`, con su `order`.

Filtros: `status`, `clientid`, `project_id`, `sale_agent`, `date_from`/`date_to` sobre `date`,
`year`. Orden: `date`, `duedate`, `total`, `number`, `status`. Búsqueda `q` sobre
`formatted_number`. Sin `include`.

`POST /estimates` exige `clientid`, `date` y al menos una línea. `PATCH` acepta 29 claves
(`Escritura/Cotizacion.php:49-79`): `clientid`, `project_id`, `number`, `date`, `expirydate`,
`currency`, `status`, `reference_no`, `sale_agent`, `clientnote`, `adminnote`, `terms`,
`discount_percent`, `discount_total`, `discount_type`, `adjustment`, `show_quantity_as`,
`include_shipping`, `show_shipping_on_estimate`, los cinco `billing_*` y los cinco `shipping_*`, más
`items` y `tags`. Todo lo demás es `422`.

**El dinero nunca viene del cuerpo.** `subtotal`, `total` y `total_tax` son derivados: los calcula
`Escritura/TotalesVenta.php`. Mandarlos es `422`.

**Las líneas de un `PATCH` sí llevan `id`**, al revés que en facturas: una línea con `id` conocido se
edita, una sin `id` se agrega, y las que no aparecen se borran. Un `id` de otro documento es
`422 {"items.N.id":["unknown"]}` — `tblitemable` no tiene clave foránea que lo impida.

Errores propios:

| Situación | Respuesta |
|---|---|
| `convert-to-invoice` sin `create` sobre **`invoices`** (no sobre `estimates`) | `403 forbidden` |
| Acción distinta de `convert-to-invoice` | `404 not_found` |
| `status` fuera de 1–5 | `422` |
| Línea con `id` de otro documento | `422 {"items.N.id":["unknown"]}` |
| Sin `view` ni `view_own` de `estimates` **y** con `allow_staff_view_estimates_assigned` en `0` | `403 forbidden` |

### `proposals` → **Propuestas**

`GET /proposals` · `GET /proposals/{id}` · `GET /proposals/{id}/items` ·
`GET /proposals/{id}/comments` · `POST /proposals` · `PATCH /proposals/{id}` ·
`POST /proposals/{id}/actions/convert-to-invoice`

```json
{ "id": 7, "number": "PRO-0007", "subject": "…", "proposal_to": "…",
  "date": "2026-08-01", "open_till": "2026-08-31", "status": 1,
  "subtotal": 100000.0, "total_tax": 19000.0, "total": 119000.0,
  "adjustment": null, "discount_percent": 0.0, "discount_total": 0.0, "discount_type": "",
  "currency": { "id": 1, "symbol": "$", "name": "COP", "is_default": true },
  "rel_type": "lead", "rel_id": 84,
  "related": { "id": 84, "name": "…" },
  "project": null,
  "assigned": { "id": 12, "full_name": "…", "profile_image_url": "…" },
  "invoice": null, "estimate_id": null,
  "tags": [] }
```

**`number` no es una columna**: se arma con el id y el prefijo configurado, réplica de
`format_proposal_number()` (`RecursoPropuestas.php:302`). Por eso `sort=number` ordena por `id`.

**`related` es el destinatario ya resuelto** según `rel_type` (`lead` o `customer`). El frontend no
tiene que adivinar de qué tabla sacarlo, y `rel_type`/`rel_id` viajan igual por si hace falta.

La ficha agrega `content`, `datecreated`, `show_quantity_as`, `pipeline_order`,
`is_expiry_notified`, `allow_comments`, `address`, `city`, `state`, `zip`, `country`, `email`,
`phone`, `acceptance` (la misma forma que en cotizaciones), `date_converted`, `items`
y `totals`. **Ni `hash` ni `short_link` salen nunca**: `hash` (`proposals_helper.php:48`) es la
credencial del enlace público y `short_link` (`proposals_helper.php:11-40`) es esa misma URL acortada
con bit.ly.

`GET /proposals/{id}/comments` devuelve array plano:

```json
[ { "id": 2, "content": "…", "author": { "id": 12, "full_name": "…" },
    "from_client": false, "dateadded": "2026-08-02T10:00:00Z" } ]
```

`from_client` es `staffid = 0`: así se distingue el comentario del cliente del comentario interno.

**Los estados no siguen el orden de presentación** (`proposals_helper.php:115`):

| `id` | Estado | Posición en la interfaz |
|---|---|---|
| 6 | Borrador | 1 |
| 1 | Abierta | 2 |
| 4 | Enviada | 3 |
| 5 | Revisada | 4 |
| 3 | Aceptada | 5 |
| 2 | Rechazada | 6 |

Es la misma trampa que `task_statuses`: **ordenar por `id` da un embudo equivocado**. `GET /lookups`
publica el mapa correcto en `proposal_statuses`, ya ordenado por `order`.

Filtros: `status`, `rel_type`, `rel_id`, `assigned`, `date_from`/`date_to` sobre `date`. Orden:
`date`, `open_till`, `total`, `number`. Búsqueda `q` sobre `subject` y `proposal_to`. Sin `include`.

**No hay `filter[clientid]`**: una propuesta apunta a un prospecto o a un cliente por `rel_type` /
`rel_id`, así que el filtro del cliente es `filter[rel_type]=customer&filter[rel_id]=42`.

`POST /proposals` exige `subject`, `rel_type`, `rel_id`, `date` y al menos una línea. `PATCH` acepta
`subject`, `rel_type`, `rel_id`, `proposal_to`, `project_id`, `assigned`, `date`, `open_till`,
`currency`, `status`, `discount_percent`, `discount_total`, `discount_type`, `adjustment`,
`show_quantity_as`, `allow_comments`, `address`, `city`, `state`, `zip`, `country`, `email`, `phone`,
más `items` y `tags` (`Escritura/Propuesta.php:69-93`).

**La visibilidad de propuestas no es la de facturas.** `proposals_helper.php:324` mira `assigned`
—no `sale_agent`— y revalida `view_own` con una subconsulta dentro del propio SQL. Una propuesta que
este staff no ve es `404`.

Errores propios:

| Situación | Respuesta |
|---|---|
| `convert-to-invoice` sobre una propuesta con `rel_type: "lead"` | `409 conflict` |
| `convert-to-invoice` sin `create` sobre **`invoices`** | `403 forbidden` |
| `status` fuera de 1–6 | `422` |
| Sin `view` ni `view_own` de `proposals` **y** con `allow_staff_view_proposals_assigned` en `0` | `403 forbidden` |

El `409` del prospecto es explícito: `Proposals_model::convert_to_invoice():1055` devuelve `false`
sin decir por qué, y un `false` mudo llega al frontend como "no pasó nada".

### `expenses` → **Gastos**

`GET /expenses` · `GET /expenses/{id}` · `POST /expenses` · `PATCH /expenses/{id}`

```json
{ "id": 3, "expense_name": "Hosting", "note": "…",
  "category": { "id": 1, "name": "Infraestructura" },
  "amount": 100000.0, "tax": 19.0, "tax2": null,
  "tax_total": 19000.0, "total": 119000.0,
  "currency": { "id": 1, "symbol": "$", "name": "COP", "is_default": true },
  "date": "2026-08-01", "reference_no": null, "billable": true,
  "invoice": null,
  "payment_mode": { "id": 1, "name": "Efectivo" },
  "client": { "id": 42, "company": "…" },
  "project": null,
  "file": { "id": 88, "file_name": "recibo.pdf", "filetype": "application/pdf",
            "url": "/api/v1/files/expense/88/download" },
  "recurring": false, "repeat_every": null, "recurring_type": null, "recurring_from": null,
  "cycles": 0, "total_cycles": 0, "last_recurring_date": null,
  "create_invoice_billable": false, "send_invoice_to_customer": false,
  "added_by": { "id": 12, "full_name": "…", "profile_image_url": "…" },
  "dateadded": "2026-08-01T09:00:00Z" }
```

**`tax` y `tax2` cambian de significado según la dirección, y hay que leerlo dos veces:**

| | Qué es |
|---|---|
| **Al leer** (`GET`) | el **porcentaje ya resuelto** desde `tbltaxes.taxrate`, o `null` si el gasto no lleva esa tasa |
| **Al escribir** (`POST`/`PATCH`) | el **id de la tasa** en `tbltaxes`; `0` es "sin impuesto", igual que la opción vacía del `<select>` del panel |

En la columna `tblexpenses.tax` lo guardado es siempre el **id**
(`Escritura/Gasto.php:56` valida contra `tbltaxes.id`). No son porcentajes ni montos.

**Las dos tasas se aplican sobre el importe base, no en cascada**
(`views/admin/tables/expenses.php:127-138`, que guarda el importe en `$tmpTotal` justamente para
eso):

```
total = amount + amount/100 * taxrate(tax) + amount/100 * taxrate(tax2)
```

`tax_total` y `total` viajan ya calculados. Devolver `amount` pelado haría que la API y el panel
mostraran números distintos para el mismo gasto.

**`file` es la *lectura* del comprobante, y la descarga funciona.** `Recursos/Descargas.php:45-90`
conoce los tipos `project`, `task`, `customer`, `lead`, `ticket`, `expense` y `contract`. Lo que no
existe es la **subida**: ver [Lo que la API no hace](#lo-que-la-api-no-hace).

Filtros: `category`, `billable`, `clientid`, `project_id`, `invoiceid`, `sin_facturar`,
`date_from`/`date_to` sobre `date`. Orden: `date`, `amount`, `name`. Búsqueda `q` sobre
`expense_name`, `note` y `reference_no`. Sin `include`, y **la respuesta no trae `custom_fields` ni
`tags`**: `CamposPersonalizados::PERMITIDAS` ya declara `expenses`, pero `RecursoGastos` todavía no
los pide.

**`filter[sin_facturar]` es el filtro más usado de la pantalla.** No es una columna: es la expresión
`billable = 1 AND invoiceid IS NULL`, el contador `unbilled` de
`Expenses_model::get_expenses_total():258-261`. Sólo acepta `0` o `1`; cualquier otro valor es `422`.
Sin esa validación, `filter[sin_facturar]=si` devolvería en silencio **el conjunto contrario**.

`POST /expenses` exige `category`, `amount` y `date`. Campos escribibles en el alta y en el parche
(`Escritura/Gasto.php:51-64`): `expense_name`, `note`, `category`, `amount`, `tax`, `tax2`,
`currency`, `date`, `reference_no`, `billable`, `clientid`, `project_id`, `paymentmode`.

Fuera de la whitelist, con motivo: **`invoiceid`** (se escribe cuando el gasto se factura; dejar que
un `PATCH` lo invente marcaría un gasto como facturado sin factura) y **todo el bloque de
recurrencia**, que ejecuta el cron y crea gastos hijos — no es un campo, es un comportamiento. Se
devuelven de sólo lectura.

**`note` se guarda pasada por `nl2br()`**, igual que `Expenses_model::add():79`: el panel guarda el
HTML y lo muestra tal cual, así que guardar saltos crudos dejaría la nota en un solo renglón.

Errores propios:

| Situación | Respuesta |
|---|---|
| Sin `view` ni `view_own` de `expenses` | `403 forbidden` |
| Gasto de otro sin `view` global | `404 not_found` |
| `filter[sin_facturar]` con un valor que no es `0` ni `1` | `422` |
| `category`, `tax`, `tax2`, `currency`, `clientid` o `project_id` que no existen | `422 {"campo":["invalid"]}` |
| Falta `category`, `amount` o `date` en el alta | `422` |
| `DELETE /expenses/{id}` | `404 not_found` — el borrado no está expuesto |

### `contracts` → **Contratos**

`GET /contracts` · `GET /contracts/{id}` · `GET /contracts/{id}/comentarios` ·
`GET /contracts/{id}/archivos` · `PATCH /contracts/{id}` ·
`POST /contracts/{id}/acciones/marcar-firmado` · `POST /contracts/{id}/acciones/desmarcar-firmado`

```json
{ "id": 12, "subject": "…", "description": "…",
  "contract_type": { "id": 2, "name": "Servicios" },
  "client": { "id": 42, "company": "…" },
  "project": null,
  "datestart": "2026-01-01", "dateend": "2026-12-31",
  "contract_value": 12000000.0, "trash": false, "not_visible_to_client": false,
  "signed": true, "marked_as_signed": false, "signature": "sig_abc.png",
  "signature_status": "signed",
  "vigencia": "vigente", "isexpirynotified": false,
  "tags": [], "custom_fields": [],
  "added_by": { "id": 12, "full_name": "…", "profile_image_url": "…" },
  "dateadded": "2025-12-20T11:00:00Z", "last_sent_at": null }
```

La ficha agrega `content`, `acceptance` (`firstname`, `lastname`, `email`, `date`, `ip`),
`comments` y `files`. Los dos subrecursos también se piden sueltos:

```json
// GET /contracts/{id}/comentarios
[ { "id": 3, "content": "…", "author": { "id": 12, "full_name": "…" },
    "from_client": false, "dateadded": "2026-02-01T10:00:00Z" } ]

// GET /contracts/{id}/archivos
[ { "id": 90, "file_name": "anexo.pdf", "filetype": "application/pdf",
    "added_by": { "id": 12, "full_name": "…" },
    "dateadded": "2026-02-01T10:00:00Z",
    "url": "/api/v1/files/contract/90/download" } ]
```

> **Ni `hash` ni `short_link` viajan**, igual que en facturas, cotizaciones y propuestas. Una versión
> anterior de este documento decía que el `hash` sí salía, con el argumento de que el enlace público
> del contrato "sólo expone la firma" y no un cobro. El argumento estaba mal medido:
> `contract/{id}/{hash}` (`config/routes.php:120`) pasa por `check_contract_restrictions()`, que con
> `view_contract_only_logged_in = 0` **no exige sesión de ninguna clase**, y acepta
> `action=sign_contract`. `Contracts_model::add_signature():196-215` **no verifica identidad**: el
> nombre, el correo y la IP de la aceptación salen de la propia petición. Quien tenga la cadena firma
> el contrato en nombre del cliente, que es peor que pagar una factura.
>
> `short_link` se fue con él y por lo mismo: `get_contract_shortlink()`
> (`helpers/contracts_helper.php:11-40`) acorta con bit.ly exactamente
> `site_url("contract/{id}/{hash}")`, así que la cadena corta **es** el hash con un salto de por
> medio. Hoy vale `null` en toda la base porque `bitly_access_token` está vacío, pero el día que
> alguien lo configure desde el panel la API repartiría enlaces de firma sin que nadie toque el
> módulo.
>
> Los dos salieron del `SELECT`, no sólo del JSON: una credencial que se trae a memoria termina en un
> log. Si alguna vez hace falta "copiar el enlace de firma", eso es un endpoint propio con su permiso
> y su registro en la bitácora.
>
> La `url` de descarga sí funciona: `Recursos/Descargas.php:45-90` conoce el tipo `contract`.

**`signed` y `marked_as_signed` son distintos, y los dos viajan.** `signed` lo pone
`add_signature()` (`Contracts_model.php:196-215`) desde el enlace público del cliente, y **la API no
lo toca nunca**; `marked_as_signed` es que alguien del equipo lo dio por firmado. `signature_status`
es la precedencia del panel (`views/admin/tables/contracts.php:116-123`) ya resuelta:
`marked_as_signed` → `signed` → `not_signed`. Colapsarlos en un booleano borra la diferencia entre
"el cliente firmó" y "alguien del equipo lo marcó".

**`content` sale crudo, con los `{merge_field}` sin resolver.** `Contracts_model::get()` los
sustituye sólo cuando `$for_editor == false`, y hacerlo en cada detalle obligaría a cargar tres
librerías de merge fields por petición. **El frontend recibe el texto tal como está guardado y no lo
interpreta.**

**`vigencia` y `filter[vigencia]` usan comparaciones estrictas:**

| valor | condición |
|---|---|
| `"vigente"` | `trash = 0 AND (dateend IS NULL OR dateend > hoy)` |
| `"vencido"` | `trash = 0 AND dateend < hoy` |
| `null` | contrato en papelera, **o `dateend` exactamente hoy** |

Es literal de `count_active_contracts()` (`contracts_helper.php:184`) y `count_expired_contracts()`
(`:203`). Dos trampas: **un contrato sin `dateend` es vigente, no vencido**, y el que vence hoy no
cae en ninguno de los dos. No se "arregla" a `<=`: el panel deja ese contrato fuera de sus dos
contadores y la API tiene que devolver el mismo conjunto. `hoy` es `date('Y-m-d')` de PHP, no
`CURDATE()`: MySQL puede estar en otra zona horaria.

Filtros: `contract_type`, `signed`, `marked_as_signed`, `trash`, `client`, `project_id`, `year`
sobre `datestart`, `vigencia`, `date_from`/`date_to` sobre `datestart`. Orden: `subject`,
`datestart`, `dateend`, `value`, `date_added`. Búsqueda `q` sobre `subject` y `description`. Sin
`include` — `custom_fields` viaja **siempre**.

> El filtro del cliente se llama **`client`**, no `clientid`: es el nombre real de la columna en
> `tblcontracts`. Es la única de las cinco tablas de venta que no la llamó `clientid`.

`PATCH /contracts/{id}` acepta `subject`, `description`, `content`, `datestart`, `dateend`,
`contract_type`, `project_id`, `not_visible_to_client`, `trash`
(`Escritura/ParcheContrato.php:39-49`). Cambiar `dateend` resetea `isexpirynotified = 0`, y sólo si
**cambia**: repetir la misma fecha no reactiva el aviso del cron.

**Marcar y desmarcar firmado son acciones, no un `PATCH`**, porque no cambian un campo:
`mark_as_signed()` / `unmark_as_signed()` (`Contracts_model.php:500-538`) **reescriben `content`**,
congelando o restaurando cada `{merge_field}`. Un `UPDATE` de una sola columna dejaría el contrato
firmado mostrando datos del cliente que cambian después de la firma. Si el contrato ya está en ese
estado, la acción **no llama al modelo**: repetirla anidaría los `<span>`.

Errores propios:

| Situación | Respuesta |
|---|---|
| `PATCH` de `contract_value`, `clientid`, `datestart` o `dateend` sobre un contrato con `signed = 1` | `409 conflict` |
| Acción distinta de `marcar-firmado` / `desmarcar-firmado` | `404 not_found` |
| Acción pedida con un método que no es `POST` | `404 not_found` |
| Sin `view` ni `view_own` de `contracts` | `403 forbidden` |
| `POST /contracts` o `DELETE /contracts/{id}` | `404 not_found` — alta y borrado no están expuestos |

El `409` del contrato firmado es **divergencia deliberada**: `admin/Contracts.php:66-68` hace
`unset()` de esos cuatro campos y **acepta el formulario tirándolos sin avisar**. La regla de "nada
se ignora en silencio" pesa más que la réplica. La comprobación corre **antes** que la whitelist, a
propósito: `contract_value` y `clientid` no son editables en esta tanda, pero sobre un contrato
firmado la respuesta útil es `409` y no `422`, que mandaría al llamador a buscar un error de nombre
que no tiene.

### `leads` → **Prospectos**

`GET /leads` · `GET /leads?vista=embudo` · `GET /leads/{id}` · `GET /leads/{id}/notas` ·
`GET /leads/{id}/actividad` · `GET /leads/{id}/archivos` · `PATCH /leads/{id}` ·
`POST /leads/{id}/mover` ·
`POST /leads/{id}/acciones/{marcar-perdido|desmarcar-perdido|marcar-basura|desmarcar-basura}`

```json
{ "id": 84, "name": "…", "title": null, "company": "…", "email": "…",
  "phonenumber": null, "website": null,
  "status": { "id": 3, "name": "Contactado", "color": "#03a9f4", "order": 3, "is_default": false },
  "source": { "id": 2, "name": "Referido" },
  "assigned": { "id": 12, "full_name": "…", "profile_image_url": "…" },
  "lead_value": 5000000.0,
  "country": 0, "city": null, "state": null, "zip": null, "address": null,
  "date_added": "2026-03-02T08:00:00Z", "date_assigned": "2026-03-02",
  "last_contact": null, "last_status_change": "2026-04-01T12:00:00Z",
  "date_converted": null,
  "is_public": false, "lost": false, "junk": false, "last_lead_status": null,
  "lead_order": 4, "added_from": 12, "from_webhook": false, "from_form_id": null,
  "default_language": null, "client_id": null,
  "tags": [],
  "counts": { "notes": 2, "attachments": 0, "activity": 7 } }
```

`?include=description` agrega `description`; `?include=custom_fields` agrega `custom_fields`. Son los
únicos dos includes.

**`country` es un entero, no un objeto, y `0` significa "sin país"** — `tblleads.country` vale `0`,
no `NULL`. `0` no es una fila de `tblcountries`: el frontend lo trata como vacío, no lo busca en el
catálogo de `GET /lookups`.

**`status` puede ser `null`.** Pasa siempre con `junk` o `lost`, que ponen `status = 0` guardando la
etapa vieja en `last_lead_status`, y pasaría también si alguien borrara una etapa con prospectos
dentro. El panel, en cambio, hace `get_status($status)->name` sin comprobar y tira un fatal
(`Leads_model.php:815`).

**`client_id` no se lee de `tblleads.client_id`.** Esa columna existe pero está **muerta**: 0 en las
81 filas de producción, mientras que los clientes convertidos sí tienen `tblclients.leadid`
apuntando a su prospecto. El core nunca la escribe; `admin/tables/leads.php:147` y
`get_client_id_by_lead_id()` resuelven la conversión con una subconsulta sobre `tblclients`, y la API
hace lo mismo.

**`from_webhook` es `addedfrom = 0`** (`modules/form_sync/form_sync.php:428-431`), no un dato
faltante.

`GET /leads?vista=embudo` devuelve **una entrada por etapa**, con paginación propia por columna:

```json
{ "data": [
  { "columna": { "id": 1, "name": "Nuevo", "color": "#64748b", "order": 1, "is_default": false },
    "tarjetas": [ { "id": 84, "…": "…" } ],
    "pagination": { "page": 1, "per_page": 25, "total": 12, "total_pages": 1 } }
] }
```

Las columnas salen de `tblleads_status` ordenada por `statusorder`: **agregar una etapa en Perfex la
hace aparecer en el embudo sin tocar código**. Un prospecto marcado basura desaparece solo del
embudo —ninguna columna tiene id 0— y sigue en la lista con `filter[junk]=1`.

Subrecursos, todos array plano sin paginación:

```json
// GET /leads/{id}/notas
[ { "id": 5, "lead_id": 84, "description": "…", "date_contacted": null,
    "date_added": "2026-03-05T09:00:00Z",
    "staff": { "id": 12, "full_name": "…" } } ]

// GET /leads/{id}/actividad
[ { "id": 21, "lead_id": 84, "description": "not_lead_activity_assigned_to",
    "params": ["<a href=\"…\">Ana</a>"], "date": "2026-03-02T08:00:00Z",
    "staff_id": 12, "full_name": "…", "custom": false } ]

// GET /leads/{id}/archivos
[ { "id": 44, "file_name": "brief.pdf", "filetype": "application/pdf",
    "rel_type": "lead", "rel_id": 84, "staff_id": 12,
    "date_added": "2026-03-05T09:00:00Z", "external": null,
    "url": "/api/v1/files/lead/44/download" } ]
```

**`actividad.description` es una clave de idioma, no un texto.** La traduce el frontend, con `params`
—el `additional_data` ya deserializado— como argumentos. La tabla es `tbllead_activity_log`, propia:
no `tblactivity_log` ni `tblproject_activity`.

Filtros: `status`, `source`, `assigned`, `country`, `junk`, `lost`, `is_public`,
`date_from`/`date_to` sobre `dateadded`. Orden: `name`, `company`, `date_added`, `date_assigned`,
`last_contact`, `last_status_change`, `lead_value`, `status`. Búsqueda `q` sobre `name`, `company`,
`email` y `phonenumber`.

`PATCH /leads/{id}` acepta 18 claves (`Escritura/ParcheProspecto.php:58-77`): `name`, `title`,
`company`, `email`, `phonenumber`, `website`, `address`, `city`, `state`, `zip`, `country`, `source`,
`assigned`, `lead_value`, `description`, `lastcontact`, `is_public`, `default_language`.

Lo que se replica exactamente del panel: **`address` pasa por `trim()` y `nl2br()`**
(`Leads_model::update():266-267`), **`email` por `trim()`** (`:269`), y **cambiar `assigned` escribe
dos cosas más**: `dateassigned = date('Y-m-d')` y una fila de bitácora
`not_lead_activity_assigned_to`. Con las tres guardas del panel: no escribe nada si el asignado no
cambió, si es `0`, o si es uno mismo.

Lo que **no** se replica, porque un `PATCH` parcial significa lo contrario: omitir `is_public` no lo
pone en `0`, omitir `country` no lo pone en `0`, y `description` **no** pasa por `nl2br()`.

`POST /leads/{id}/mover`:

```json
{ "etapa": 4, "posicion": 2, "columna_completa": [84, 12, 33] }
```

**`etapa` es obligatoria y no admite default.** Con un `?? 0`, olvidarla significaría "moverlo a la
etapa 0", que es donde viven los perdidos y los basura: el endpoint sacaría la tarjeta del embudo sin
que nadie lo pidiera. Como en el tablero de Procesos, **el movimiento reordena la columna destino
entera**: las tarjetas que el cliente no cargó por paginación se empujan al fondo.

Errores propios:

| Situación | Respuesta |
|---|---|
| Staff con `is_not_staff = 1` | `403 forbidden` |
| Prospecto que existe pero este staff no ve | `404 not_found` |
| `mover` sin `etapa` | `422 {"etapa":["required"]}` |
| `mover` a una etapa que no existe | `409 conflict` |
| `mover` un prospecto de webhook (`addedfrom = 0`) a la etapa `isdefault` | `409 conflict` |
| `address` de más de 100 caracteres **después** del `nl2br()` | `422` |
| `source`, `assigned` o `country` que no existen en su tabla | `422` |
| Acción distinta de las cuatro de arriba | `404 not_found` |

Cuatro de esos son **endurecimientos deliberados**. `Leads_model.php:815` hace
`get_status($status)->name` sin comprobar y tira un fatal sobre `false`; `admin/Leads.php:612-617`
no comprueba nada para reordenar —ni `is_staff_member()` ni `staff_can_access_lead()`—; la columna
`address` es `varchar(100)` y el panel deja que MySQL la corte en silencio dejando un `<br` a
medias; y `tblleads` no tiene ni una clave foránea, así que un `source` fantasma hace desaparecer el
prospecto de las vistas del panel, que hacen `INNER JOIN tblleads_sources`.

**La feature `leads` sólo declara `view` y `delete`** (`helpers/staff_helper.php:165-176`). No hay
`edit` ni `view_own`: editar, mover y marcar exigen únicamente que el prospecto sea visible
(`assigned = yo OR addedfrom = yo OR is_public = 1`), igual que en el panel.

**`POST /leads/{id}/convertir` no existe.** Ver
[Lo que la API no hace](#lo-que-la-api-no-hace).

### `tickets` → **Tickets**

`GET /tickets` · `GET /tickets/respuestas-predefinidas` · `GET /tickets/{id}` ·
`GET /tickets/{id}/respuestas` · `GET /tickets/{id}/archivos` ·
`POST /tickets/{id}/respuestas` · `PATCH /tickets/{id}`

```json
{ "id": 14, "ticketkey": "a1b2c3…", "subject": "…",
  "status": 1, "priority": 2,
  "department": { "id": 1, "name": "Soporte" },
  "service": null, "project_id": null,
  "assigned": { "id": 12, "full_name": "…", "profile_image_url": "…" },
  "opened_by": null,
  "solicitante": { "tipo": "contacto",
                   "contact": { "id": 7, "full_name": "…", "email": "…" },
                   "client": { "id": 42, "company": "…" },
                   "name": null, "email": null },
  "date": "2026-08-01T09:00:00Z", "lastreply": "2026-08-02T15:30:00Z",
  "adminread": true, "clientread": false,
  "staff_id_replying": null, "merged_ticket_id": null, "cc": null,
  "tags": [],
  "counts": { "replies": 3, "attachments": 1 } }
```

`?include=message` agrega el mensaje original (`mediumtext`, fuera del listado por defecto);
`?include=custom_fields` agrega `custom_fields`. En `GET /tickets/{id}` los dos vienen siempre.

**`GET /tickets/{id}` escribe.** Ejecuta `UPDATE tbltickets SET adminread = 1 WHERE ticketid = ? AND
adminread = 0`, que es exactamente `set_ticket_open()` (`helpers/tickets_helper.php:109-123`), lo que
el panel hace al renderizar el detalle. Sin eso, el ticket abierto desde `ops-v2` seguiría en negrita
en el panel viejo. **Es el único `GET` de la API que muta estado**: un prefetch especulativo del
frontend marcaría tickets como leídos sin que nadie los abriera.

**El bloque `solicitante` viaja siempre y con sus nulos.** El panel bifurca por `userid != 0`, no por
`contactid` (`views/admin/tables/tickets.php:210-219`). En un ticket de contacto, `name` y `email` de
`tbltickets` son legítimamente `NULL` —`update_single_ticket_settings():1092-1095` los anula al fijar
`contactid`—, así que omitirlos haría que el cliente no distinga "no aplica" de "el backend no lo
mandó". `tipo` es `"contacto"` cuando `userid != 0` y `"correo"` cuando no.

Subrecursos:

```json
// GET /tickets/{id}/respuestas
[ { "id": 51, "ticket_id": 14, "message": "…", "date": "2026-08-02T15:30:00Z",
    "autor": { "tipo": "staff", "id": 12, "full_name": "…", "email": null },
    "attachments": [ { "id": 9, "ticket_id": 14, "reply_id": 51,
                       "file_name": "captura.png", "filetype": "image/png",
                       "date_added": "2026-08-02T15:30:00Z",
                       "download_path": "files/ticket/9/download" } ] } ]

// GET /tickets/{id}/archivos  — adjuntos del mensaje ORIGINAL (replyid IS NULL)
[ { "id": 8, "ticket_id": 14, "reply_id": null, "…": "…" } ]

// GET /tickets/respuestas-predefinidas
[ { "id": 1, "name": "Saludo inicial", "message": "…" } ]
```

`autor.tipo` es `"staff"`, `"contacto"` o `"correo"`, y es **excluyente**: de ahí sale de qué lado
del hilo va cada burbuja.

> `Tickets_model::get_ticket_replies():742` decide el autor con
> `if ($reply['admin'] !== null || $reply['admin'] != 0)`, que con `||` es verdadero para casi todo y
> deja la rama del contacto prácticamente inalcanzable. La API usa la condición que ese `if` quería
> (`&&`). Divergencia deliberada.

Las respuestas predefinidas **no están en `/lookups`** a propósito: ese payload ya carga 250 países y
estos `message` son `mediumtext`. `ticket_statuses`, `ticket_priorities`, `departments` y
`ticket_services` sí están ahí.

Filtros: `status`, `priority`, `service`, `userid`, `contactid`, `project_id`,
`date_from`/`date_to` sobre `date`, más **`department` y `assigned` sólo para administradores**.
Orden: `subject`, `date`, `lastreply`, `status`, `priority`. Búsqueda `q` sobre `subject` y
`ticketkey`.

**Para un no administrador, `filter[department]` y `filter[assigned]` son `422 unknown`**, no filtros
que se ignoran. El panel declara los dos selectores con `->isVisible(fn () => is_admin())`
(`views/admin/tables/tickets.php:16` y `:46`): para un no-admin **ese selector no existe**. Un filtro
ignorado en silencio le dejaría el selector vacío al staff creyendo que filtró.

**La bandeja ordena por `-lastreply`, no por `date`.** Los tickets sin ninguna respuesta van al final
en las dos direcciones, que es lo que `Nucleo\Consulta` ya hace con los nulos. Desempate por
`ticketid`.

`PATCH /tickets/{id}` acepta `subject`, `department`, `priority`, `status`, `service`, `assigned`,
`project_id`, `contactid` (`Escritura/ParcheTicket.php:41-50`).

`POST /tickets/{id}/respuestas` acepta **sólo** `message` y `status`; cualquier otra clave es `422`.
**`status` es opcional**: por defecto queda el estado actual del ticket. `add_reply()` lo exige
(`:440`), pero un default duro reabriría en silencio los tickets cerrados cada vez que alguien
agrega una nota. El `message` pasa por `html_purify`: conserva `<b>`, elimina `<script>`.

Errores propios:

| Situación | Respuesta |
|---|---|
| Staff sin acceso a tickets (`access_tickets_to_none_staff_members` + `is_staff_member()`) | `403 forbidden` |
| Ticket de un departamento que este staff no atiende | `404 not_found` |
| `filter[department]` o `filter[assigned]` siendo no administrador | `422 {"filter[department]":["unknown"]}` |
| `message` vacío al responder | `422 {"message":["required"]}` |
| `status` inexistente al responder | `422 {"status":["invalid"]}` |
| Clave fuera de `message`/`status` al responder | `422 {"campo":["no_editable"]}` |
| Subrecurso que no sea `respuestas` ni `archivos` | `404 not_found` |

**No existe una feature de permisos `tickets` en Perfex.** No hay un solo `staff_can('view',
'tickets')` en el repositorio: el acceso es `get_option('access_tickets_to_none_staff_members')` +
`is_staff_member()` (`admin/Tickets.php:13-15`), y después el departamento. Por eso la ruta no llama
a `Permisos::puede()`, y por eso `permissions` de `GET /me` **no trae una clave `tickets`**.

**Trampas del esquema**, que cuestan un `UPDATE` que no falla y no hace nada:

- Las columnas son **`adminread`**, **`clientread`** y **`staff_id_replying`**.
  `tbltickets.adminreplying` existe en la tabla pero **ningún código del repositorio la lee ni la
  escribe**: es un resto muerto.
- Los adjuntos viven en **`tblticket_attachments`** (`id, ticketid, replyid, file_name, filetype,
  dateadded`), **no en `tblfiles`**: no tienen `external`, `external_link` ni `visible_to_customer`.
- Las respuestas predefinidas viven en **`tbltickets_predefined_replies`** —"tickets" en plural—, al
  revés que `tblticket_replies` y `tblticket_attachments`.

**Responder no le avisa a nadie.** Ver abajo: es la omisión más ruidosa de toda la API.

## Salas de reunión

Dominio propio del módulo `api`: **no hay entidad de Perfex detrás**. Dos tablas nuevas
(`tblapi_salas`, `tblapi_sala_reservas`) creadas por `modules/api/instalar.sql`, y ninguna tabla ni
vista del panel involucrada. La interfaz vive únicamente en `ops-v2` — ver
[modulos/06-salas.md](modulos/06-salas.md).

Todo cuelga del prefijo `rooms` a propósito: el BFF autoriza por primer segmento, así que una sola
entrada en su lista blanca cubre salas, reservas y pantalla de puerta.

### Sala

```json
{
  "id": 2,
  "name": "One Team",
  "capacity": 10,
  "location": "Piso 2",
  "active": true,
  "date_created": "2026-08-01T12:00:00Z",
  "panel_token": "c2e60d7b91f34a58bd05e7c31a9b4d62"
}
```

`panel_token` **solo aparece si quien pregunta es administrador**. Es la llave de
`GET /rooms/panel/{token}`, que responde sin sesión; en el listado que ve todo el equipo dejaría de
ser un secreto.

| Método | Ruta | Quién |
|---|---|---|
| `GET` | `/rooms` | Cualquier staff. `?todas=1` incluye las dadas de baja |
| `POST` | `/rooms` | Admin. `name`, `capacity`, `location` |
| `PATCH` | `/rooms/{id}` | Admin. Además acepta `rotate_token: true` |
| `DELETE` | `/rooms/{id}` | Admin. Baja **lógica**: `active` pasa a `false`, la fila queda |

No hay paginación ni `?include=`: son tres filas. Un `include` cualquiera devuelve `422`, como en todo
recurso sin relaciones opcionales.

### Reserva

```json
{
  "id": 1,
  "room_id": 2,
  "room_name": "One Team",
  "room_capacity": 10,
  "staff_id": 1,
  "staff": {
    "id": 1,
    "full_name": "Ana Ríos",
    "email": "ana@wiwo.me",
    "profile_image_url": null
  },
  "title": "Comité semanal",
  "start": "2026-09-02T13:00:00Z",
  "end": "2026-09-02T14:00:00Z",
  "attendees": 8,
  "notes": null,
  "cancelled_at": null,
  "date_created": "2026-09-01T18:22:00Z"
}
```

`staff` trae el **correo**, a diferencia de `StaffReferencia`: el pedido que originó el módulo es
poder contactar a quien reservó para confirmar si va a usar la sala. Es `null` solo si esa persona ya
no está en `tblstaff`.

| Método | Ruta | Quién |
|---|---|---|
| `GET` | `/rooms/bookings?from=&to=` | Cualquier staff. `room_id` acota a una sala |
| `POST` | `/rooms/bookings` | Cualquier staff |
| `PATCH` | `/rooms/bookings/{id}` | Autor o admin |
| `DELETE` | `/rooms/bookings/{id}` | Autor o admin. Cancela, no borra |

`from` y `to` son **obligatorios** en el listado y van en ISO-8601: sin ellos es `400`. Una agenda
siempre mira una ventana, y un listado sin límites devolvería el histórico entero.

Devuelve las reservas que **cruzan** el rango (`inicio < to AND fin > from`), no las que empiezan
dentro. Una reunión que arrancó a las 23:00 de ayer ocupa la sala hoy a las 00:30, y con un `BETWEEN`
sobre `start` no aparecería: la agenda pintaría esa franja libre.

Las canceladas nunca salen. Cancelar libera el horario en el acto; la fila queda con `cancelled_at` y
quién canceló, que es el rastro que hoy falta cuando alguien suelta una sala a último momento.

**Cancelar dos veces no es error**: la segunda no cambia nada y responde igual. Un botón que falla
porque alguien se adelantó no le aporta nada a quien lo aprieta.

#### Errores propios

| Código | Cuándo |
|---|---|
| `409` | El horario se pisa con otra reserva vigente de esa sala. El mensaje **nombra a quien la ocupa** |
| `409` | Ya existe una sala con ese nombre |
| `422` | Título vacío o >255; `end` <= `start`; duración < 10 min o > 12 h; `start` en el pasado (con 15 min de gracia); `attendees` fuera de 1–500 |
| `403` | Editar o cancelar una reserva ajena sin ser admin; administrar salas sin ser admin |
| `404` | La sala no existe o está dada de baja |

Los extremos que se tocan **no** chocan: 10:00–11:00 y 11:00–12:00 conviven.

El `409` de solapamiento se decide **dentro de una transacción, con `SELECT ... FOR UPDATE` sobre la
fila de la sala**. MySQL no tiene exclusion constraints, y un `SELECT` de comprobación seguido de un
`INSERT` es la carrera que produce exactamente el sobreagendamiento que este módulo viene a resolver.

### Pantalla de puerta

`GET /rooms/panel/{token}` — **la única ruta autenticada por token de recurso y no por sesión.** Una
tablet colgada en la pared no se loguea. Devuelve solo la agenda de esa sala:

```json
{
  "data": {
    "room": { "id": 2, "name": "One Team", "capacity": 10, "location": "Piso 2", "active": true, "date_created": "2026-08-01T12:00:00Z" },
    "now": "2026-09-02T17:25:21Z",
    "current": null,
    "upcoming": []
  }
}
```

`current` es la reserva en curso o `null`; `upcoming` son hasta **3** reservas más de **hoy**. La sala
llega sin `panel_token` —quien ya lo tiene no lo necesita de vuelta, y así no se filtra a nadie que
mire la respuesta por encima del hombro—. Un token con forma inválida o de una sala dada de baja es
`404`, igual que uno inexistente.

## Campos personalizados

`GET /custom-fields?para=tasks` devuelve las definiciones:

```json
{ "data": [
  { "id": 4, "slug": "tasks_cf_area", "name": "Área", "type": "select",
    "options": ["Diseño","Desarrollo"], "required": true, "order": 1,
    "default_value": null, "only_admin": false, "show_on_table": true }
] }
```

Valores en el recurso, con `?include=custom_fields`, y como **array, no objeto**:

```json
"custom_fields": [ { "id": 4, "slug": "tasks_cf_area", "name": "Área", "type": "select", "value": "Diseño" } ]
```

Array y no objeto por dos razones: los slugs se repiten entre distintos `fieldto`, y el `field_order`
importa para renderizar el formulario en el orden correcto.

`only_admin` ya lo respeta el backend según quién sea el dueño del token. El frontend no vuelve a
decidirlo.

**El tipo de `value` depende del `type`**, porque la base guarda dos transformaciones que hay que
deshacer al leer:

| `type` | `value` | Por qué |
|---|---|---|
| `multiselect`, `checkbox` | **array de strings** | Se guardan con `implode(', ')`, no como JSON |
| `textarea` | string con **saltos de línea** | Se guarda pasado por `nl2br()`, o sea con `<br />` embebido |
| el resto | string | Valor crudo, sin formatear |

> Limitación irrecuperable por diseño: una opción de `multiselect` que contenga una coma no se puede
> distinguir de dos opciones. Es así en la base, no en la API.

**El `fieldto` es plural** (`tasks`, `projects`, `customers`), al revés que el `rel_type` de etiquetas
y archivos, que es singular. Son dos convenciones conviviendo en el mismo esquema.

## Tags

Siempre presentes, sin `include`: son baratos y la interfaz siempre los pinta.

```json
"tags": [ { "id": 3, "name": "urgente" } ]
```

Filtrar por tag: `?filter[tag]=3` (acepta lista).

## Tiempo real

`GET /config/realtime` → `{ "data": { "enabled": true, "key": "…", "cluster": "…" } }`

Nada de esto se escribe en el código de `ops-v2`: sale de las opciones de Perfex.

El evento es un **ping sin datos**, igual que hoy en el panel:

1. `pusher-js` se suscribe a `notifications-channel-<mi staff id>`.
2. Llega el evento `notification`, con cuerpo vacío.
3. El frontend **invalida la clave** de TanStack Query correspondiente y vuelve a pedir.

No se aplica ningún diff en vivo: invalidar es diez veces menos código y no se puede desincronizar.

## Errores que el frontend maneja distinto

| Situación | Respuesta | Qué hace `ops-v2` |
|---|---|---|
| Token expirado | `401 token_expired` | El BFF intenta refrescar **una** vez y reintenta |
| Token revocado | `401 token_revoked` | Limpia caché y va a `/colab`. No reintenta |
| Sin permiso | `403 forbidden` | Muestra `SinPermiso` en el lugar del contenido |
| Validación | `422 validation_failed` | `details` va campo a campo a react-hook-form |
| Conflicto al mover | `409 conflict` | Revierte el movimiento optimista y avisa |

## Lo que la API no hace

**No notifica a nadie.** Al completar una tarea desde `ops-v2`, ni los asignados, ni los seguidores,
ni el creador, ni quienes comentaron reciben nada: ni campana, ni tiempo real, ni correo. Los
contactos del cliente tampoco. El panel no muestra ninguna señal de que faltó.

Es deuda consciente. Importa para el frontend por una razón práctica: **si una acción necesita que
alguien se entere, la interfaz no puede darlo por hecho**.

Tampoco toca asignados ni seguidores: en el panel también van por caminos propios, que sí notifican.

**El caso más ruidoso es `POST /tickets/{id}/respuestas`.** En el panel, responder un ticket es sobre
todo **avisarle al cliente**: `Tickets_model::add_reply():592` manda
`send_mail_template('ticket_new_reply_to_customer')`. Acá el efecto es escribir una fila. El ticket
queda perfecto en la base —`lastreply` avanzado, `adminread = 0`, `staff_id_replying = NULL`— y del
otro lado no pasa nada. **Mientras siga así, responder desde `ops-v2` exige avisarle al cliente por
otro medio**, y la interfaz no puede decir "respuesta enviada".

### Lo que no se construyó

No es implícito ni está "pendiente de conectar": no existe. Pedirlo devuelve `404`.

| Falta | Detalle |
|---|---|
| **PDF** | No hay `GET /invoices/{id}/pdf`, ni de cotizaciones ni de propuestas. Portar el generador arrastra TCPDF, sus fuentes y las plantillas del panel |
| **Envío por correo** | No hay `POST /{id}/enviar` para ninguno de los tres documentos. `save_and_send` no se propaga jamás, ni con el kill-switch puesto |
| **Facturas recurrentes** | Las genera el cron. La API devuelve `recurring` de sólo lectura y no dispara nada |
| **Notas de crédito** | Sin recurso. `tblcreditnotes` no se toca |
| **Subida del comprobante de gasto** | La **lectura** sale en `file`; la subida necesita `upload_helper`, whitelist de extensiones y un `413` propio |
| **Subida de adjuntos al responder un ticket** | La lectura y la descarga funcionan desde el día uno; la subida sería el único endpoint del módulo que escribe en disco |
| **`POST /leads/{id}/convertir`** | La conversión a cliente queda en el panel, por decisión del usuario. No es un `INSERT` en `tblclients`: `admin/Leads.php:373-609` copia campos, arrastra los campos personalizados con equivalencia y crea el contacto primario |
| **Embudo de propuestas y de cotizaciones** | No hay `?vista=embudo` ni `POST /{id}/mover` sobre `pipeline_order`. El único embudo que existe es el de `leads` |
| **Alta y borrado de contratos, borrado de gastos, `PATCH /payments/{id}`** | `POST`/`DELETE` sobre esos recursos es `404` |
| **`custom_fields` de gastos, facturas, cotizaciones y propuestas** | `CamposPersonalizados::PERMITIDAS` ya declara las cuatro, pero los recursos todavía no los piden: la respuesta no trae la clave |
| **`tags` de facturas y de gastos** | `Etiquetas` ya declara el tipo `invoice`, pero `RecursoFacturas` y `RecursoGastos` no los resuelven. Cotizaciones y propuestas sí traen `tags` |

## Mock

Mientras la API no exista, `API_BASE` apunta al mock. Vive en [`mock/`](../mock/) y sirve exactamente
las respuestas de este documento.

```bash
pnpm mock                      # escucha en :3001
PORT=4000 pnpm mock            # otro puerto
ORIGENES=http://localhost:3000 pnpm mock
```

Sin dependencias: `node:http` a secas. `json-server` no hace envelope, ni Bearer, ni 2FA, ni
`filter[]`, así que pelearlo cuesta más que escribirlo.

| Archivo | Rol |
|---|---|
| `mock/datos.js` | Fixtures, generados de forma determinista (sin `Math.random`) |
| `mock/consulta.js` | `page` / `sort` / `filter[]` / `q` / `fields` / `include`, con whitelist |
| `mock/sesion.js` | Emisión, validación y rotación de tokens, en memoria |
| `mock/servidor.js` | Routing, CORS, envelope, códigos |

### Cuentas

| Correo | Contraseña | Para qué |
|---|---|---|
| `ana@wiwo.me` | `mock1234` | Admin: puede todo |
| `carla@wiwo.me` | `mock1234` | Sin permiso sobre clientes → ejercita el `403` |
| `bruno@wiwo.me` | `mock1234` | Devuelve `two_factor_required` → ejercita el camino de 2FA |
| `hugo@wiwo.me` | `mock1234` | Cuenta inactiva → devuelve `403`, no `401` |

En `/auth/2fa` sirve cualquier código de seis dígitos. Validar un TOTP real no aporta nada acá; lo que
sí aporta es rechazar un código con forma inválida, porque es el error que la interfaz debe mostrar.

### Casos límite que el fixture cubre a propósito

- **84 Procesos**: con `per_page=25` da 4 páginas, y cada columna del tablero tiene más de una página
  propia.
- **9 Procesos con `rel_type: "customer"`** (uno de cada nueve): cuelgan de un cliente y no de un
  Espacio, así que `project` es `null`. Si la interfaz asume que todo Proceso tiene Espacio, se rompe
  acá y no en producción.
- **Un solo cronómetro activo** (`tasks/504`): el caso que pinta la barra superior.
- **Procesos sin fecha** y orden con nulos: van al final en las dos direcciones.
- **Un campo personalizado `only_admin`** en `projects`: visible para `ana`, invisible para `carla`.

### Lo que el mock no hace

Escritura amplia (llega en F2), subida de archivos, IA y PDF. `GET /files/{id}/download` devuelve la
metadata con `mock: true` en vez de un binario: alcanza para construir la interfaz, y sí replica el
`404` y el permiso.

El estado vive en memoria y se pierde al reiniciar. Es deliberado: dos ejecuciones del mock devuelven
lo mismo, así que ninguna prueba se vuelve intermitente por un dato que quedó de la corrida anterior.

**Sin mock, F0 no está cerrado**: es lo que desbloquea al frontend para avanzar en paralelo con el
backend. La integración es cambiar una variable de entorno — y si eso duele, es señal de que el
contrato se congeló mal.
