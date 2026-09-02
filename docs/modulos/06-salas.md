# 06 · Salas de reunión

Agenda de las salas de MGC. **Es el primer módulo cuyo dominio no existe en Perfex**: no es una vista
nueva sobre `tasks` o `clients`, son dos tablas propias del módulo `api` (`tblapi_salas` y
`tblapi_sala_reservas`) y una interfaz que vive **solo en `ops-v2`**. El panel de Perfex no muestra ni
escribe nada de esto, y no se le va a construir un equivalente.

## Por qué existe

Las reservas se hacían invitando por Google Calendar al correo de la sala. Había **más de un correo
por sala**, así que dos personas podían reservar el mismo horario sin enterarse, y aparecían dos
reuniones en la misma sala —a veces con cliente adelante—. Además nadie sabía de quién era una reserva
para poder preguntarle si la iba a usar.

Lo que el pedido exigía, y dónde se resuelve cada punto:

| Pedido | Dónde se cumple |
|---|---|
| Un solo lugar para reservar cada sala | `ops-v2` es la única fuente. Los correos de sala se dejan de usar |
| Bloquear un horario ya ocupado | `Escritura\Reserva::exigirLibre()`, dentro de una transacción con `FOR UPDATE` |
| Rechazar o advertir al pisar una reserva | La pantalla avisa y deshabilita el botón; la API responde `409` con quién ocupa el horario |
| Ver quién reservó y poder contactarlo | La ficha de la reserva trae nombre, avatar y **correo** de quien la hizo |
| Cancelar libera el horario en el acto | `DELETE` marca `cancelada_en`; toda lectura filtra por `IS NULL` |
| Capacidad visible al elegir sala | Encabezado de cada columna, opción del selector y aviso al pasarse |
| Saber quiénes van, no solo cuántos | Lista de participantes del equipo en la reserva, con avatar y nombre |
| Visibilizar en cada sala si hay reserva vigente | `/sala/<token>`: pantalla a página completa, sin sesión, para la tablet de la puerta |

**Google Calendar queda afuera por decisión del usuario.** No hay sincronización ni feed: la agenda
vive en Ops y nada más. Si algún día se pide, el camino barato es un `.ics` de solo lectura por sala,
que no necesita OAuth ni cuenta de servicio.

## Pantallas

| Ruta | Qué es | Sesión |
|---|---|---|
| `/salas` | Agenda del día: una columna por sala, franjas de 30 min de 07:00 a 21:00 | Sí |
| `/salas?dia=YYYY-MM-DD` | El mismo día, compartible por enlace | Sí |
| `/sala/<panel_token>` | Pantalla de puerta: libre u ocupada, quién y qué sigue | **No** |

La agenda es una grilla y no un listado a propósito: lo que la gente busca de un vistazo es **el
hueco**, y un listado de lo ocupado obliga a construirlo mentalmente. Hacer clic en una franja vacía
abre el formulario con esa sala y esa hora ya puestas; hacer clic en un bloque abre su ficha.

`/sala/<token>` es **la única ruta del proyecto sin sesión**, y está excluida del guardia en
`src/proxy.ts`. Una tablet colgada en la pared no se loguea: si el guardia la tomara, a la semana
estaría mostrando la pantalla de acceso. La autoriza el `panel_token` de la sala, que solo da acceso a
la agenda de esa sala y se rota desde *Administrar salas* si se filtra.

## Endpoints

Todo cuelga del prefijo `rooms`, así que el BFF lo autoriza con una sola entrada en su lista blanca.

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET /rooms` | Cualquier staff | Salas activas. `?todas=1` incluye las dadas de baja |
| `POST /rooms` | Admin | Crea una sala |
| `PATCH /rooms/{id}` | Admin | Nombre, capacidad, ubicación, `active`, y `rotate_token` |
| `DELETE /rooms/{id}` | Admin | Baja **lógica** (`activa = 0`) |
| `GET /rooms/people` | Cualquier staff | Personas del equipo que se pueden anotar. Solo nombre y foto |
| `GET /rooms/bookings?from=&to=` | Cualquier staff | Reservas vigentes que cruzan el rango. `room_id` acota a una sala |
| `POST /rooms/bookings` | Cualquier staff | Crea una reserva |
| `PATCH /rooms/bookings/{id}` | Autor o admin | Edita horario, sala, título, asistentes o notas |
| `DELETE /rooms/bookings/{id}` | Autor o admin | Cancela. Cancelar dos veces no es error |
| `GET /rooms/panel/{token}` | **Nadie: sin sesión** | Sala, reserva en curso y las 3 siguientes de hoy |

`panel_token` solo viaja en la respuesta si quien pregunta es administrador. En el listado que ve todo
el equipo dejaría de ser un secreto.

## Cuántos y quiénes son dos cosas

`attendees` es el **número** total de personas. Los participantes son **quiénes del equipo** van. No
se deriva uno del otro a propósito: a una reunión con cliente van tres del equipo y dos de afuera, y
esos dos no tienen fila en `tblstaff`. Contarlos como participantes obligaría a inventarles una, y
derivar el total de la lista dejaría la sala aparentando lugar que no tiene.

En la pantalla, el total **se sigue solo** mientras nadie lo haya escrito a mano: agregar gente lo
actualiza, y apenas alguien pone un número propio deja de moverse (`sugerirAsistentes`). Un campo que
se pisa cada vez que se agrega a alguien es un campo que no se puede usar.

`participant_ids` distingue las tres formas: **ausente** conserva la lista —un PATCH que solo mueve el
horario no tiene por qué borrar a nadie—, **`[]` o `null`** la vacía. Cada id tiene que ser de una
persona activa del equipo; el `422` dice cuáles no sirven (`unknown:<id>`).

### Por qué `GET /rooms/people` y no `GET /staff`

`GET /staff` exige el permiso `staff.view` y devuelve el legajo entero: correo, tarifa, último acceso.
Casi nadie lo tiene, así que anotar a un compañero en una reunión habría quedado reservado a los
administradores. `GET /rooms/people` pide sesión y nada más, y devuelve **solo id, nombre y foto** de
las personas activas del equipo. Lo único que expone es que esa persona trabaja acá, que ya lo sabe
cualquiera que mire una reserva ajena en la agenda.

El selector trae buscador porque la instalación tiene más de 180 personas, y busca sin acentos: nadie
escribe "Núñez" con tilde al filtrar una lista.

## La regla que sostiene todo

MySQL no tiene *exclusion constraints*, así que el solapamiento no se puede declarar como constraint:
hay que comprobarlo leyendo. Un `SELECT` de comprobación seguido de un `INSERT` es la carrera de
libro —dos personas aprietan "Reservar" en el mismo segundo, las dos leen que está libre, las dos
insertan—, y eso es **exactamente el sobreagendamiento que la feature viene a resolver**. Que sea
improbable no alcanza.

Por eso el alta corre dentro de una transacción que primero toma `SELECT ... FOR UPDATE` sobre la fila
de la **sala**: eso serializa las escrituras de esa sala y deja las de las otras dos en paralelo, que
es toda la concurrencia que este dominio necesita.

El navegador comprueba lo mismo, pero **solo para avisar**. Si la única comprobación viviera ahí,
volveríamos al problema original.

Los extremos que se tocan **no** chocan: 10:00–11:00 y 11:00–12:00 conviven. La regla es idéntica en
la API, en el mock y en `src/dominio/salas.ts`; si divergieran, la pantalla ofrecería franjas que la
API rechaza.

## Horas y husos

La base guarda `datetime` en la zona del negocio, igual que todo lo que escribe el panel. La API habla
**ISO-8601 UTC** en las dos direcciones, y la traducción ocurre en un solo lugar por lado:
`Recursos\Fechas::instante()` y `::aDatetime()` en el backend, `src/dominio/salas.ts` en el frontend.

El formulario edita **hora de pared** (`<input type="time">`) y recién al enviar la convierte al
instante UTC de `ZONA_NEGOCIO`. Sin eso, alguien conectado desde otro huso reservaría la hora
equivalente en su reloj y no la que eligió en pantalla. `pruebas/salas.test.js` corre con `TZ=UTC`
justamente para que esa confusión falle en verde o en rojo, no en la sala.

## Validación

Bloquean (`422` en la API, botón deshabilitado en la pantalla): título vacío o de más de 255, fin
anterior o igual al inicio, duración menor a 10 minutos o mayor a 12 horas, e inicio en el pasado
—con 15 minutos de gracia, porque "reservar ahora mismo" es el caso más frecuente y el reloj del
navegador no coincide al segundo con el del servidor—.

**Pasarse de la capacidad avisa pero no bloquea.** Quien reserva puede saber que dos se quedan
parados, y un sistema que se lo prohíbe termina empujándolo a tomar la sala grande por las dudas, que
es peor.

## Permisos

Reservar lo puede hacer **cualquier persona del equipo**: `salas` no es una *feature* de Perfex y no
tiene fila en `tblstaff_permissions`. Inventarla ahí la volvería configurable desde el formulario de
staff del panel, que es justo la parte del panel de la que este módulo se mantiene afuera.

Editar y cancelar: el autor o un administrador, y es **403**, no 404 —a diferencia de las notas
privadas de un Espacio, acá todo el equipo ve todas las reservas, así que esconder su existencia no
protege nada—. Administrar salas: solo administradores.

La sección aparece en la barra lateral cuando `secciones_habilitadas` de `GET /me` incluye `salas`.

## Instalación

Las tablas y las tres salas de MGC están al final de `wiwo-board/modules/api/instalar.sql`, que se
corre a mano una vez. El `INSERT` es `IGNORE` sobre el `UNIQUE` de `nombre`: correrlo dos veces no
duplica ni falla.

Los `panel_token` sembrados son fijos y públicos en el repositorio. **Rotarlos desde
Salas → Administrar salas antes de colgar las tablets**, o cualquiera con acceso al código ve la
agenda de esas tres salas.
