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
`GET /tasks/{id}/timers` · `GET /tasks/{id}/files`

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
  "url": "/api/v1/files/77/download",
  "thumbnail_url": null }
```

**Nunca se expone la ruta real de `uploads/`.** Hoy la única protección de esa carpeta es que la URL
no se adivina; publicarla en JSON lo empeoraría.

**Si `external` no es nulo**, el archivo vive en Drive, Dropbox o similar y **no hay archivo local**:
`url` trae el enlace externo tal cual, no una ruta de descarga.

> Dato sucio real de la base: `tblfiles.rel_type` tiene 14 filas con `'tasks'` en plural además de 208
> con `'task'`. La API consulta ambos y normaliza a singular hacia afuera; filtrar sólo por el
> singular pierde 14 adjuntos.

`GET /files/{id}/download` autentica, valida el permiso sobre la entidad dueña y sirve el binario.

**Para `<img src>` y `<a download>`**, que no mandan el header `Authorization`:
`POST /files/{id}/link` → `{ "data": { "url": "…?t=…", "expires_in": 60 } }`. Token de un solo uso.
La alternativa —cookie cross-site— obligaría a `SameSite=None` con credenciales, justo lo que el BFF
evita.

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
