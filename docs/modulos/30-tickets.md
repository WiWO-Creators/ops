# Tickets

> `tickets`. Soporte al cliente.

## Qué resuelve

El canal de atención: el cliente escribe, el equipo responde, y el hilo queda registrado con su
estado y prioridad.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/tickets` | Tabla genérica, con filtro por departamento, estado, prioridad y servicio |
| Detalle | `/tickets/[id]` | Hilo de respuestas, adjuntos, datos del solicitante |
| Responder | en el detalle | Editor con respuestas predefinidas |

## Endpoints que consume

| Método | Ruta | Devuelve | Estado |
|---|---|---|---|
| `GET` | `/tickets` | Bandeja paginada, ordenada por `-lastreply` | ✅ |
| `GET` | `/tickets/respuestas-predefinidas` | Catálogo de `tbltickets_predefined_replies` | ✅ |
| `GET` | `/tickets/{id}` | Ficha — **y marca el ticket como leído** | ✅ |
| `GET` | `/tickets/{id}/respuestas` | Respuestas con sus adjuntos | ✅ |
| `GET` | `/tickets/{id}/archivos` | Adjuntos del mensaje original (`replyid IS NULL`) | ✅ |
| `POST` | `/tickets/{id}/respuestas` | La respuesta creada, `201` | ✅ |
| `PATCH` | `/tickets/{id}` | El ticket actualizado | ✅ |

`?include=` acepta `message` y `custom_fields`, y sólo esos dos. La forma exacta de cada respuesta
está en [`../contrato-api.md`](../contrato-api.md#tickets--tickets).

## Campos

De `tbltickets`: `ticketid`, `subject`, `message`, `userid` (cliente), `contactid`, `email`, `name`,
`department`, `priority`, `status`, `service`, `ticketkey`, `admin`, `assigned`, `date`, `lastreply`,
`project_id`, `clientread`, `adminread`, `staff_id_replying`, `merged_ticket_id`, `cc`.

> **Corrección: las columnas no se llaman como decía este documento.** Son **`adminread`**,
> **`clientread`** —sin guión bajo— y **`staff_id_replying`**. `tbltickets.adminreplying` existe en la
> tabla pero **ningún código del repositorio la lee ni la escribe**: es un resto muerto. Nombrar mal
> la columna es un `UPDATE` que no falla y no hace nada.

Respuestas (`tblticket_replies`): `id, ticketid, userid, contactid, name, email, date, message,
admin`. La API las presenta con un bloque `autor` de tipo `staff`, `contacto` o `correo`, que es
excluyente.

> **Corrección: los adjuntos no viven en `tblfiles`.** Viven en **`tblticket_attachments`**
> (`id, ticketid, replyid, file_name, filetype, dateadded`), así que **no tienen** `external`,
> `external_link` ni `visible_to_customer`. Los del mensaje original son los que tienen
> `replyid IS NULL`.

Estados: 1 Abierto, 2 En progreso, 3 Respondido, 4 En espera, 5 Cerrado — **pero son configurables**
(`tbltickets_status`), así que van en `lookups` como `ticket_statuses`, no codificados en el frontend.
Igual con departamentos (`ticket_departments`), servicios (`ticket_services`) y prioridades.

`autor.tipo` decide de qué lado del hilo va cada burbuja.

> `Tickets_model::get_ticket_replies():742` resuelve el autor con
> `if ($reply['admin'] !== null || $reply['admin'] != 0)`. Con `||` esa condición es verdadera para
> casi todo y deja la rama del contacto prácticamente inalcanzable. La API usa la condición que ese
> `if` quería (`&&`): divergencia deliberada, documentada en `modules/api/README.md`.

## Acciones y escrituras

Responder, cambiar estado, cambiar prioridad, asignar, cambiar departamento, servicio, espacio o
contacto, y usar respuestas predefinidas. **Adjuntar archivos no está construido.**

`POST /tickets/{id}/respuestas` acepta **sólo** `message` y `status`; cualquier otra clave es `422`.
**`status` es opcional**: por defecto queda el estado actual. `add_reply()` lo exige (`:440`), pero un
default duro reabriría en silencio los tickets cerrados cada vez que alguien agrega una nota.

> **El cliente no se entera de que le respondieron.** `POST /tickets/{id}/respuestas` **no manda
> ningún correo**: no llama a `send_mail_template('ticket_new_reply_to_customer')`
> (`Tickets_model::add_reply():592`), ni a `add_notification()`, ni a
> `pusher_trigger_notification()`. El ticket queda perfecto en la base —`lastreply` avanzado,
> `adminread = 0`, `staff_id_replying = NULL`— y del otro lado no pasa nada. Es la omisión más
> ruidosa de toda la API, porque en el panel responder un ticket es sobre todo **avisarle al
> cliente**. **La interfaz no puede decir "respuesta enviada"**, y quien responda desde `ops-v2` tiene
> que avisarle al cliente por otro medio.

## Permisos

> **Corrección: no existe una feature de permisos `tickets` en Perfex.** No hay un solo
> `staff_can('view', 'tickets')` en el repositorio, y `helpers/staff_helper.php` no la declara. Por eso
> `permissions` de `GET /me` **no trae una clave `tickets`** y la interfaz no puede podar controles
> con ella.

El acceso es otra cosa: `get_option('access_tickets_to_none_staff_members')` + `is_staff_member()`
(`admin/Tickets.php:13-15`) como puerta de área —**403** si no pasa—, y después el **departamento**
como visibilidad por fila. Un ticket de un departamento que este staff no atiende responde **404**.

El filtro por departamento en el panel **solo es visible para administradores**
(`->isVisible(fn () => is_admin())`, `views/admin/tables/tickets.php:16` y `:46`): un staff común ve
únicamente los tickets de sus departamentos, y el selector no debería siquiera aparecerle. Por eso
`filter[department]` y `filter[assigned]` son **`422 unknown`** para un no administrador, no filtros
que se ignoran: un filtro ignorado en silencio le dejaría el selector vacío al staff creyendo que
filtró.

## Reglas del panel que hay que replicar

- **`adminread` y `clientread` marcan lo no leído** de cada lado. Abrir el ticket desde `ops-v2` lo
  marca: `GET /tickets/{id}` ejecuta `UPDATE ... SET adminread = 1 WHERE ticketid = ? AND
  adminread = 0`, que es exactamente `set_ticket_open()` (`helpers/tickets_helper.php:109-123`).
  **Es el único `GET` de la API que muta estado**: un prefetch especulativo marcaría tickets como
  leídos sin que nadie los abriera.
- **`staff_id_replying`** es la señal de "alguien del equipo está escribiendo". La API la limpia al
  responder y nunca la enciende. `adminreplying` no es esa columna: no la usa nadie.
- `lastreply` ordena la bandeja: es el orden por defecto, no `date`. Los tickets sin respuesta van al
  final en las dos direcciones; desempate por `ticketid`.
- Un ticket puede venir de un contacto o de un correo suelto (`email` y `name` sin `contactid`). El
  bloque `solicitante` **viaja siempre y con sus nulos**: el panel bifurca por `userid != 0`, no por
  `contactid` (`views/admin/tables/tickets.php:210-219`), y en un ticket de contacto `name` y `email`
  de `tbltickets` son legítimamente `NULL`. Omitirlos haría que la interfaz no distinga "no aplica"
  de "el backend no lo mandó".
- **Las respuestas predefinidas salen de `tbltickets_predefined_replies`** —"tickets" en **plural**—,
  al revés que `tblticket_replies` y `tblticket_attachments`. Este documento la nombraba en singular.
- **No están en `/lookups`** a propósito: ese payload ya carga 250 países y estos `message` son
  `mediumtext`. Tienen endpoint propio. `ticket_statuses`, `ticket_priorities`, `departments` y
  `ticket_services` sí están en `lookups`.

Fuente: `application/views/admin/tables/tickets.php` (columnas, filtros y visibilidad),
`Tickets_model.php`.

## Estado de la API

✅ **Construido y verificado**, **sin la subida de adjuntos**.

`Recursos/RecursoTickets.php`, `Escritura/{ParcheTicket,RespuestaTicket}.php`,
`Acceso/Visibilidad::tickets()`.

Verificación: `php index.php api v1 verificacion tickets` — 36 comprobaciones, 0 fallos,
`rollback_limpio: true`. **Los dumps de producción tienen cero tickets y cero departamentos**, así que
el comparador fabrica dos departamentos, tres tickets y un staff con departamento asignado dentro de
una transacción, y revierte.

**No está en `secciones_habilitadas` de `GET /me`**: la API responde, `ops-v2` no ofrece la sección.

**Fuera de alcance, declarado:**

- **La subida de adjuntos.** La **lectura** y la **descarga** funcionan desde el día uno
  (`Recursos/Descargas.php`, tipo `ticket`, carpeta `uploads/ticket_attachments/{ticketid}`). No hay
  `POST /tickets/{id}/respuestas/{rid}/archivos`: sería el único endpoint del módulo que escribe en
  disco, y necesita whitelist de extensiones (`ticket_attachments_file_extensions`), tope de cantidad
  (`maximum_allowed_ticket_attachments`), `unique_filename`, `mkdir 0755` con su `index.html` y un
  `413` propio.
- **Todo aviso al cliente.** Ver *Acciones y escrituras*.
- **Alta y borrado de tickets, fusión, y el hilo del portal del cliente.**

## Criterios de aceptación

1. Un staff no administrador ve solo los tickets de sus departamentos, y sin el selector de
   departamento. ✅ Verificado: ve 2 de 3, el ajeno da `404`, y `filter[department]` da `422` con
   no-admin y `200` con admin.
2. Abrir un ticket lo marca como leído también en el panel viejo. ✅ Verificado en MySQL: `adminread`
   pasa de 0 a 1 al pedir el detalle por HTTP.
3. La bandeja ordena por `lastreply`, no por fecha de creación. ✅ Con los nulos al final.
4. Un ticket sin `contactid` (llegado por correo) se muestra completo, sin campos rotos. ✅ Verificado
   con `userid = 0`: bloque `solicitante` completo, `tipo: "correo"`.
5. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
