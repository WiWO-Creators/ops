# Prospectos

> `leads`. Se deja en inglés en la API y en el código; "Prospecto" es solo el nombre visible.

## Qué resuelve

El embudo comercial antes de que exista un cliente. Es el módulo que justifica el grupo Comercial,
porque termina en una acción concreta: **convertir el prospecto en cliente**.

Junto con Contratos, es uno de los dos únicos recursos con **datos reales** en producción: 81 filas
en `tblleads`. Todo lo de abajo está verificado contra datos de verdad, no contra casos sembrados.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/prospectos` | Tabla genérica |
| Embudo | `/prospectos/embudo` | Kanban por etapa, con el motor de Procesos |
| Detalle | `/prospectos/[id]` | Datos, seguimiento, notas, adjuntos, campos personalizados |
| Convertir | superposición | Formulario de conversión a cliente — **la API no lo soporta**, ver *Estado de la API* |

## Endpoints que consume

| Método | Ruta | Devuelve | Estado |
|---|---|---|---|
| `GET` | `/leads` | Colección paginada | ✅ |
| `GET` | `/leads?vista=embudo` | Una entrada por etapa, con paginación **por columna** | ✅ |
| `GET` | `/leads/{id}` | Item | ✅ |
| `GET` | `/leads/{id}/notas` | Array plano | ✅ |
| `GET` | `/leads/{id}/actividad` | Array plano | ✅ |
| `GET` | `/leads/{id}/archivos` | Array plano | ✅ |
| `PATCH` | `/leads/{id}` | El prospecto actualizado | ✅ |
| `POST` | `/leads/{id}/mover` | Cambio de etapa y reorden | ✅ |
| `POST` | `/leads/{id}/acciones/{marcar-perdido\|desmarcar-perdido\|marcar-basura\|desmarcar-basura}` | El prospecto actualizado | ✅ |
| `POST` | `/leads/{id}/convertir` | El cliente creado | ❌ **no construido** |

`?include=` acepta `description` y `custom_fields`, y sólo esos dos. La forma exacta de cada
respuesta está en [`../contrato-api.md`](../contrato-api.md#leads--prospectos).

## Campos

De `tblleads`. Los que la tabla del panel muestra y filtra:

| Campo | Nota |
|---|---|
| `id`, `name`, `title`, `company`, `email`, `phonenumber`, `website` | Identidad |
| `status` → `{id, name, color, order}` | Configurable en Perfex (`tblleads_status`); no es un enum fijo |
| `source` → `{id, name}` | Configurable (`tblleads_sources`) |
| `assigned` → forma reducida de staff | Quién lo atiende |
| `lead_value` | Valor estimado. **Es dinero**: número, no cadena |
| `country`, `city`, `state`, `zip`, `address` | Ubicación |
| `dateadded`, `dateassigned`, `lastcontact`, `last_status_change` | Fechas |
| `is_public`, `lost`, `junk` | Banderas |
| `client_id` | No nulo si ya fue convertido. **No se lee de `tblleads.client_id`**: ver abajo |
| `last_lead_status`, `lead_order`, `from_webhook`, `from_form_id`, `counts` | Derivados que la API agrega |
| `tags` | |

**`status` y `source` no son enums.** Salen de tablas configurables, así que van en `GET /lookups`
como `lead_statuses` y `lead_sources`, igual que `task_statuses`. Codificarlos en el frontend garantiza
que se rompan cuando alguien agregue una etapa.

**`status` puede llegar `null`.** Pasa siempre con `junk` o `lost`, que ponen `status = 0` guardando
la etapa vieja en `last_lead_status`. Es por eso que un prospecto basura desaparece solo del embudo:
ninguna columna tiene id 0.

**`country` es un entero, no un objeto, y `0` significa "sin país"** — `tblleads.country` vale `0`, no
`NULL`, y `0` no es una fila de `tblcountries`.

> **Corrección: `tblleads.client_id` está muerta.** La columna existe, pero vale 0 en las 81 filas de
> producción, mientras que los clientes convertidos sí tienen `tblclients.leadid` apuntando a su
> prospecto. El core nunca la escribe: `admin/tables/leads.php:147`, `LeadsKanban:47` y
> `get_client_id_by_lead_id()` resuelven la conversión con una subconsulta sobre `tblclients`. La API
> expone `client_id` resuelto así e **ignora la columna homónima**. La conclusión de esta ficha
> —"no nulo si ya fue convertido"— era correcta; su premisa no.

## Acciones y escrituras

- Editar campos del prospecto — 18 claves, ver el contrato.
- Mover de etapa en el embudo (`POST /leads/{id}/mover`), que **reordena la columna destino entera**,
  igual que el tablero de Procesos.
- Marcar y desmarcar perdido o basura — cuatro acciones.
- Registrar contacto: es `PATCH` de `lastcontact`, no una acción propia.
- **Convertir a cliente: no está construido.** Ver *Estado de la API*.

**Cambiar `assigned` escribe dos cosas más**: `dateassigned = date('Y-m-d')` y una fila de bitácora
`not_lead_activity_assigned_to`. Con las tres guardas del panel: no escribe nada si el asignado no
cambió, si es `0`, o si es uno mismo — `lead_assigned_member_notification():138-142` corta **antes**
de escribir la fecha, no sólo antes de notificar.

**La API no manda el correo `lead_assigned` ni la notificación de campana.** Quien asigna un
prospecto desde `ops-v2` tiene que avisarle a la persona por otro medio.

## Permisos

> **Corrección.** Este documento decía "capacidades `view`, `view_own`, `create`, `edit`, `delete`".
> **La feature `leads` sólo declara `view` y `delete`** (`helpers/staff_helper.php:165-176`). No hay
> `edit` ni `view_own` ni `create` que consultar, así que `permissions.leads` de `GET /me` trae dos
> claves, no cinco.

La puerta de área es otra: **403 si el staff no es miembro del equipo** (`is_not_staff = 1`), que es
toda la regla que aplica `admin/Leads.php:25-26`.

De ahí para abajo la unidad es la visibilidad por fila: `assigned = yo OR addedfrom = yo OR
is_public = 1`. Editar, mover y marcar exigen únicamente que el prospecto sea visible, igual que en
el panel. Un prospecto que este staff no ve responde **404, no 403**: un 403 confirmaría que ese id
existe.

## Reglas del panel que hay que replicar

- **La conversión no es un `INSERT` en `tblclients`** — y **no vive en `Leads_model`**, como decía
  este documento. Vive en el controlador: `application/controllers/admin/Leads.php:373-609`
  (`convert_to_customer()`), que copia campos, arrastra los campos personalizados con equivalencia,
  crea el contacto primario, escribe `tblclients.leadid` y anota la bitácora. Un recurso de API que
  quiera replicarla tiene que portar ese método, no llamar a un modelo.
- Cambiar de etapa escribe `last_status_change` y una entrada de `tbllead_activity_log`.
- Un prospecto `junk` no aparece en el embudo pero sí en la lista con `filter[junk]=1`.
- **`address` pasa por `trim()` y `nl2br()`** (`Leads_model::update():266-267`) y **`email` por
  `trim()`** (`:269`). Esas líneas están **fuera** del `if (!defined('API'))` que protege a
  `description`, así que sí viajan. Sin replicarlo, el panel muestra en un solo renglón una dirección
  que la API guardó con saltos.
- **La bitácora es `tbllead_activity_log`**, tabla propia: no `tblproject_activity` ni
  `tblactivity_log`. Su `description` es una **clave de idioma** que traduce el frontend, y
  `additional_data` un `serialize()` de PHP que la API devuelve ya deserializado en `params`.

Fuente: `application/views/admin/tables/leads.php` (columnas, filtros y permisos),
`application/views/admin/leads/kan-ban.php` y `_kan_ban_card.php` (anatomía de la tarjeta),
`admin/Leads.php` (conversión), `Leads_model.php` (actividad, asignación, cambio de etapa).

## Estado de la API

✅ **Construido y verificado**, **sin la conversión a cliente**.

`Recursos/RecursoProspectos.php`, `Escritura/{ParcheProspecto,EtapaProspecto,EstadoProspecto}.php`,
`Acceso/Visibilidad.php`, y `lead_statuses` / `lead_sources` en `lookups`.

Verificación: `php index.php api v1 verificacion prospectos` sobre las **81 filas reales** de
producción — visibilidad cotejada contra 179 staff con **0 diferencias**, embudo de 9 columnas sin
fallas, 21 comparaciones de escritura sobre 22 columnas con 0 diferencias, y **0 notificaciones y 0
intentos de correo** desde el camino de la API contra al menos 1 desde el del panel (ese "al menos
uno" es lo que prueba que el espía mide algo).

**No está en `secciones_habilitadas` de `GET /me`**: la API responde, `ops-v2` no ofrece la sección.

**Fuera de alcance, por decisión del usuario: `POST /leads/{id}/convertir`.** La conversión a cliente
se sigue haciendo desde el panel. Eliminarla de esta tanda evitó el shim de sesión, el merge de
campos personalizados y la captura manual del cliente resultante.

**Endurecimientos deliberados**, que el panel no hace y acá sí:

| Qué | Por qué |
|---|---|
| `409` si la etapa no existe al mover | `Leads_model.php:815` hace `get_status($status)->name` sin comprobar y tira un fatal sobre `false`. Un 500 no es una respuesta |
| Se exige visibilidad para mover | `admin/Leads.php:612-617` no comprueba nada: ni `is_staff_member()` ni `staff_can_access_lead()` |
| `422` si `address` pasa de 100 caracteres **después** del `nl2br()` | La columna es `varchar(100)` y el panel deja que MySQL la corte dejando un `<br` a medias |
| `source`, `assigned` y `country` comprobados contra su tabla | `tblleads` no tiene ni una clave foránea. Un `source` fantasma hace desaparecer el prospecto de las vistas del panel, que hacen `INNER JOIN tblleads_sources` |
| `409` si un prospecto de webhook (`addedfrom = 0`) va a la etapa `isdefault` | El guard de `modules/form_sync` existe para eso, pero **no funciona**: recibe nombres de etapa donde espera ids (`form_sync.php:436`), MySQL castea `'Customer'` a 0 y el guard vuelve sin bloquear. Se implementa la intención, no el bug |

**Aviso operativo:** `/leads/{id}/mover` reordena la columna destino **entera**, igual que el kanban
del panel. Probarlo contra una base real cambia el `leadorder` de todas las tarjetas de esa columna.

## Criterios de aceptación

1. Un prospecto entra y recorre el embudo completo **sin tocar Perfex**. ✅
   *(La segunda mitad —"y se convierte en cliente"— queda fuera: la conversión no se construyó.)*
2. El cliente resultante es idéntico —campo a campo— al que produce el panel viejo para el mismo
   prospecto. **No aplica en esta tanda**: sin `POST /leads/{id}/convertir` no hay nada que comparar.
3. Agregar una etapa nueva en Perfex la hace aparecer en el embudo sin tocar código del frontend. ✅
   Las columnas salen de `tblleads_status` ordenada por `statusorder`.
4. La visibilidad coincide con la del panel: `verificacion prospectos`, 179 staff, 0 diferencias. ✅
5. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
