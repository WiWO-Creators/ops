# Upselling

> **No es una entidad nueva de Perfex.** Un Upsell **es un Espacio** (`tblprojects`) de un cliente
> que **ya existe**, escondido de los listados hasta que la oportunidad se cierre:
> `upsell.id === upsell.espacio.id`. Espejo de [Licitaciones](11-licitaciones.md), con **una**
> diferencia estructural que lo cambia todo, abajo.

## Qué resuelve

Una oportunidad comercial sobre un cliente actual: un trabajo nuevo que se le está armando y que
todavía no se vendió. Se prepara con el mismo espacio de trabajo que tendría si ya estuviera
vendido —tareas, hitos, tiempos, archivos— pero **no es un proyecto en curso del cliente**: mientras
la oportunidad no se cierre, no aparece entre sus proyectos, ni en los totales, ni en su portal.

El día que se gana, el Espacio simplemente deja de esconderse y pasa a ser un proyecto normal del
cliente. **No nace ningún cliente ni ningún contacto** —eso es lo de una licitación—, y por eso la
acción **no exige `customers create`**. El día que se pierde, el Espacio se archiva.

## La diferencia con una Licitación, y por qué importa

| | Licitación | Upsell |
|---|---|---|
| El cliente | **todavía no existe**: `tblprojects.clientid = 0` | **ya existe**: `clientid` REAL desde el día uno |
| Ganar | crea el Cliente y sus contactos (una sola vez, en el Prospecto) | solo `estado = 'ganada'` |
| Permiso de ganar | `projects edit` + `customers create` | `projects edit` |
| ¿Lo ve el portal del cliente? | **nunca**: `clientid = 0`, ningún contacto pertenece a ese cliente | **sí, si no se esconde** |

Esa última fila es la razón por la que existe `RecursoEspacios::fragmentoOculto()`. Una licitación
bastaba con esconderla del panel. Un upsell tiene el `clientid` real: sin esconderlo **también** en
`listarParaContacto()` y en `verParaContacto()`, el cliente ve en su portal el proyecto de la
oportunidad que le están armando, con su nombre y su fecha de entrega. Uno tapa la lista, el otro
tapa el id escrito a mano en la URL. Son cuatro usos del mismo fragmento —esos dos, más el listado
del panel y los chips de `/projects/stats`— y la prueba `modules/api/pruebas/upsells.php` verifica
sobre el código fuente que los cuatro siguen ahí.

`tblapi_upsells` **no guarda `cliente_id`**: sale de `tblprojects.clientid`, que es la única fuente
de verdad. Duplicarlo dejaría de coincidir el día que alguien reasigne el Proyecto desde el panel.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/upsells` | Tabla: cliente, nombre del Espacio, estado, monto estimado, probabilidad, inicio |
| Detalle | `/upsells/[id]` | Cabecera del Espacio + Ficha, Tareas, Hitos, Tiempos, Archivos, Discusiones, Actividad |

Las pestañas de trabajo son **las mismas** del detalle de Espacio: las monta `DetalleDeEspacio`
(`src/componentes/proyecto/DetalleDeEspacio.tsx`), el mismo componente que usa Licitaciones. Lo único
propio es el contenido de la pestaña Ficha y la botonera de la cabecera.

El alta elige el cliente de un `<select>` alimentado por
`GET /clients/minimos?filter[active]=1&sort=company`, la ruta que existe justamente para esto: no
exige `customers view` y devuelve cuatro campos. **Solo los activos**: armarle una oportunidad a un
cliente dado de baja es un error de tipeo, no un caso de uso —y la API lo rechazaría igual si
estuviera en la papelera—.

## Endpoints que consume

| Método | Ruta | Devuelve |
|---|---|---|
| `GET` | `/upsells` | Colección paginada; `espacio` **parcial** |
| `GET` | `/upsells/{id}` | Item; `espacio` es la ficha completa de `GET /projects/{id}` |
| `POST` | `/upsells` | `201` con el item |
| `PATCH` | `/upsells/{id}` | El item actualizado; **`409` si ya está resuelta** |
| `POST` | `/upsells/{id}/actions/ganar` | `200` con el item ya ganado |
| `POST` | `/upsells/{id}/actions/perder` | `200` con el item ya perdido |
| `GET` | `/projects/{id}/tasks\|milestones\|members\|files` | Los subrecursos de trabajo, con `upsell.espacio.id` |

**No hay `DELETE`**: borrar un upsell es `DELETE /projects/{id}`, que lo manda a la papelera con
previsualización y restauración; al purgarlo, la FK `ON DELETE CASCADE` se lleva la fila propia. El
borrado blando no dispara la FK, así que restaurar el Espacio devuelve el upsell entero.

**No hay subrecursos propios**: son los de `/projects/{id}`, con ese mismo id.

### Consulta

| Capacidad | Valores admitidos |
|---|---|
| `filter[]` | `estado`: `abierta`, `ganada`, `perdida`. `status` del Espacio. `clientid` |
| `sort` | `name`, `monto_estimado`, `probabilidad`, `start_date`, `creada_en`. Por defecto `-creada_en` |
| `q` | Busca en el nombre del Espacio |
| `include` | **Ninguno.** El Espacio y el cliente ya vienen en la fila |

**Sin filtro devuelve las tres**, no solo las abiertas: el histórico se consulta desde la misma
pantalla.

## Campos

```jsonc
{
  "id": 313,                       // == el id del Espacio
  "estado": "abierta",             // "abierta" | "ganada" | "perdida"
  "monto_estimado": 12500.5,       // lo que se espera VENDER; null es "todavía no se sabe"
  "moneda_id": null,               // id de `currencies` de /lookups
  "probabilidad": 60,              // 0 a 100
  "motivo": null,                  // por qué se ganó o se perdió; se escribe al cerrar
  "client_id": 81,                 // sale de tblprojects.clientid, no de una columna propia
  "client": { "id": 81, "company": "…", "image_url": null },
  "resultado_en": null,
  "creada_en": "2026-09-09T18:25:55Z",
  "espacio": { "id": 313, "name": "…", "status": 1,
               "start_date": "2026-09-15", "deadline": null }
}
```

`monto_estimado` **no es** `espacio.project_cost`: uno es lo que se espera vender, el otro lo que se
factura si se gana. Mezclarlos haría que cerrar la oportunidad pisara el presupuesto del proyecto.

Los estados son **los mismos tres** de una Licitación, y la definición los importa de
`definiciones/licitaciones.ts` en vez de copiarlos: dos listas iguales se separan en el primer
cambio. Como allá, **no salen de `/lookups`** y por eso la columna Estado no usa `comoInsignia`.

## Acciones y escrituras

**`POST /upsells`** recibe `espacio` (objeto, con `clientid` **obligatorio**, `name` y `start_date`)
y los cuatro campos propios en la raíz. Sin `clientid` es `422 required`: un upsell es, por
definición, sobre un cliente que ya existe. Que ese cliente exista y no esté en la papelera lo valida
`Espacio::crear()`, que se llama sin el modo `$sinCliente` de las licitaciones.

**`PATCH /upsells/{id}` acepta solo `monto_estimado`, `moneda_id`, `probabilidad` y `motivo`**, y
**responde `409` en cuanto la oportunidad se cierra**. Lo del Espacio —cliente, nombre, fechas,
estado, descripción— se edita con `PATCH /projects/{id}`.

**El `motivo` se escribe en el diálogo de cierre**, no en el formulario de edición, porque después el
`PATCH` responde 409: si el campo viviera solo en la edición, habría que acordarse de escribirlo
*antes* de apretar el botón. El diálogo compartido (`DialogoResultado`) lo pinta solo cuando la
sección se lo pide; Licitaciones no tiene esa columna y no lo pasa.

**`POST /upsells/{id}/actions/ganar`** deja de esconder el Espacio. Aparece en `GET /projects`, en la
pestaña Proyectos del cliente, en `/projects/stats` y en el portal del cliente. **No se crea ningún
cliente ni contacto.** El diálogo lo dice con esas palabras.

**`POST /upsells/{id}/actions/perder`** archiva el Espacio. La oportunidad sigue consultable en
`/upsells?filter[estado]=perdida`, y el cliente nunca la vio.

Las dos acciones son atómicas: el `UPDATE` lleva `WHERE estado = 'abierta'`, así que dos clics
simultáneos dan `200` y `409`. Si la llamada falla, **el diálogo no se cierra**.

### Qué acciones hay en cada estado

| | Abierta | Ganada | Perdida |
|---|---|---|---|
| Editar | sí | no | no |
| Ganar / Perder | sí | no | no |
| Enlace al cliente | "Ver cliente" → `/clientes/{client_id}` | ídem | ídem |
| Enlace al Espacio | no: mientras es oportunidad no vive en esa sección | "Ver {espacio.name}" → `/espacios/{espacio.id}` | no |
| Pestañas | todas | todas | todas, consultables |

## Permisos

**No hay un permiso de Perfex propio.** El frontend usa `permissions.projects` de `GET /me`
(`create` para el alta, `edit` para editar, ganar y perder), que es el mismo que aplica el backend.
Ganar **no** pide `customers create`, a diferencia de una licitación: no inserta ni una fila en
`tblclients`.

La sección aparece en la barra lateral cuando `secciones_habilitadas` de `GET /me` incluye
`"upsells"`. Es la **bandera de instalación**, no un permiso.

Como en todo el panel: ocultar un botón no es seguridad, la API filtra igual — y en este módulo eso
incluye al portal del cliente.

## Reglas del panel que hay que replicar

Ninguna: el panel clásico no tiene esto. Es un módulo propio de `ops-v2` sobre `tblprojects`.

## Criterios de aceptación

1. El selector de clientes del alta se llena con los clientes activos.
2. Un upsell abierto **no** aparece en `GET /projects`, ni en la pestaña Proyectos del cliente, ni en
   `/projects/stats`.
3. **Un contacto del portal de ese cliente no lo ve**: `GET /portal/projects` no lo trae y
   `GET /portal/projects/{id}` con el id a mano devuelve `404`.
4. Ganar lo hace aparecer en los cuatro lados, portal incluido.
5. Perder lo archiva, lo saca de `/projects` y lo deja en `/upsells?filter[estado]=perdida`.
6. Dos `POST` concurrentes a `ganar`: el segundo devuelve `409`.
7. `DELETE /projects/{id}` de un upsell va a la papelera; restaurarlo lo devuelve como upsell;
   purgarlo borra su fila por la FK.
8. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
