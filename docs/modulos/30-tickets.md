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

Por construir: `GET /tickets`, `/tickets/{id}`, `/tickets/{id}/respuestas`,
`/tickets/{id}/archivos`, `POST /tickets/{id}/respuestas`, `PATCH /tickets/{id}`.

## Campos

De `tbltickets`: `ticketid`, `subject`, `message`, `userid` (cliente), `contactid`, `email`, `name`,
`department`, `priority`, `status`, `service`, `ticketkey`, `admin`, `assigned`, `date`, `lastreply`,
`project_id`, `client_read`, `admin_read`, `adminreplying`.

Respuestas (`tblticket_replies`): `id, ticketid, admin, contact, message, date, attachment`.

Estados: 1 Abierto, 2 En progreso, 3 Respondido, 4 En espera, 5 Cerrado — **pero son configurables**
(`tbltickets_status`), así que van en `lookups` como `ticket_statuses`, no codificados en el frontend.
Igual con departamentos (`ticket_departments`), servicios (`ticket_services`) y prioridades.

`admin` y `contact` en una respuesta son excluyentes: uno de los dos es nulo. De ahí sale de qué lado
del hilo va cada burbuja.

## Acciones y escrituras

Responder, cambiar estado, cambiar prioridad, asignar, adjuntar archivos, usar respuestas
predefinidas.

## Permisos

Feature `tickets`. El filtro por departamento en el panel **solo es visible para administradores**
(`->isVisible(fn () => is_admin())` en la definición de la tabla): un staff común ve únicamente los
tickets de sus departamentos, y el selector no debería siquiera aparecerle.

## Reglas del panel que hay que replicar

- **`admin_read` y `client_read` marcan lo no leído** de cada lado. Abrir el ticket desde `ops-v2`
  debe marcar `admin_read`, o el panel seguirá mostrándolo como nuevo.
- `adminreplying` es la señal de "alguien del equipo está escribiendo". Si no se va a implementar, no
  se toca; lo que no se puede es dejarla encendida.
- `lastreply` ordena la bandeja: es el orden por defecto, no `date`.
- Un ticket puede venir de un contacto o de un correo suelto (`email` y `name` sin `contactid`). La
  interfaz tiene que mostrar ambos casos.
- Las respuestas predefinidas salen de `tblticket_predefined_replies`.

Fuente: `application/views/admin/tables/tickets.php` (columnas, filtros y visibilidad),
`Tickets_model.php`.

## Estado de la API

❌ Por construir. Recurso de complejidad baja, salvo dos cosas: la visibilidad por departamento y el
manejo de adjuntos en las respuestas.

## Criterios de aceptación

1. Un staff no administrador ve solo los tickets de sus departamentos, y sin el selector de
   departamento.
2. Abrir un ticket lo marca como leído también en el panel viejo.
3. La bandeja ordena por `lastreply`, no por fecha de creación.
4. Un ticket sin `contactid` (llegado por correo) se muestra completo, sin campos rotos.
5. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
