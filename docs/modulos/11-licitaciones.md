# Licitaciones

> **No es una entidad nueva de Perfex.** Una Licitación **es un Espacio** (`tblprojects`) con una
> empresa candidata y un contacto colgados de él: `licitacion.id === licitacion.espacio.id`. Por eso
> todo el trabajo —tareas, hitos, tiempos, archivos, discusiones— se lee de los endpoints de Espacio
> que ya existen, y el detalle no tiene un solo panel propio.

## Qué resuelve

Preparar una propuesta para una empresa que **todavía no es cliente**, con el mismo espacio de
trabajo que tendría si ya lo fuera. El día que se gana, la empresa candidata se convierte en Cliente
de verdad, su contacto en el contacto principal, y el Espacio pasa a colgar de ese cliente. El día
que se pierde, el Espacio se archiva y la licitación queda consultable en el histórico.

Lo que evita: crear un cliente falso para poder abrir un Espacio, y después tener que limpiarlo
cuando la licitación no se gana.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/licitaciones` | Tabla genérica: empresa, contacto, estado, nombre del Espacio, inicio |
| Detalle | `/licitaciones/[id]` | Cabecera del Espacio + Ficha, Tareas, Hitos, Tiempos, Archivos, Discusiones, Actividad |

**Sin vista de tarjetas**: una licitación se compara por empresa, estado y fecha, y esas tres
comparaciones se hacen en columnas.

Las pestañas de trabajo son **las mismas** del detalle de Espacio, montadas con `licitacion.espacio.id`
donde aquel pasa `proyecto.id`. Es el patrón de `src/componentes/cliente/PanelesCliente.tsx`. Se
reusan sin envoltorios: `PanelTareas`, `PanelHitos`, `PanelTiempos`, `PanelArchivos`,
`PanelDiscusiones`, `PanelActividad`, `PanelDescripcion` y `CabeceraProyecto`.

No están Gantt, Notas, la capa de IA ni Configuración: son del Espacio adjudicado, no de la propuesta.

## Endpoints que consume

| Método | Ruta | Devuelve |
|---|---|---|
| `GET` | `/licitaciones` | Colección paginada; `espacio` **parcial** |
| `GET` | `/licitaciones/{id}` | Item; `espacio` es la ficha completa de `GET /projects/{id}` |
| `POST` | `/licitaciones` | `201` con el item |
| `PATCH` | `/licitaciones/{id}` | El item actualizado; `409` si ya está resuelta |
| `POST` | `/licitaciones/{id}/actions/ganar` | `200` con el item ya ganado |
| `POST` | `/licitaciones/{id}/actions/perder` | `200` con el item ya perdido |
| `GET` | `/projects/{id}/tasks\|milestones\|members\|files` | Los subrecursos de trabajo, con `licitacion.espacio.id` |

Mientras es licitación, `GET /projects/{id}` y todos sus subrecursos responden `200` normal: lo único
que la esconde es el **listado** `GET /projects`. Por eso los paneles reusados funcionan desde el día
uno sin código de compatibilidad.

### Consulta

| Capacidad | Valores admitidos |
|---|---|
| `filter[]` | `estado`: `abierta`, `ganada`, `perdida` |
| `sort` | `company`, `start_date` (que es `espacio.start_date`), `creada_en`. Por defecto `-creada_en` |
| `q` | Busca en `company` |
| `include` | **Ninguno.** El Espacio y el contacto ya vienen en la fila |

**Sin filtro devuelve las tres**, no solo las abiertas: el histórico se consulta desde la misma
pantalla, y esconderlo por defecto obligaría a saber que existe un filtro para encontrarlo.

## Campos

```jsonc
{
  "id": 93,                        // == el id del Espacio: son la misma fila vista de dos lados
  "estado": "abierta",             // "abierta" | "ganada" | "perdida"
  "company": "Constructora X",     // copia de cliente.company, para la columna y la búsqueda
  "cliente":  { "company": "…", "vat": null, "phonenumber": null, "website": null,
                "address": null, "city": null, "state": null, "zip": null, "country_id": null },
  "contacto": { "firstname": "…", "lastname": "…", "email": "…",
                "phonenumber": null, "title": null },
  "client_id": null,               // el Cliente REAL, solo cuando estado === "ganada"
  "resultado_en": null,            // cuándo se ganó o se perdió
  "creada_en": "2026-09-08T12:00:00Z",
  "espacio": { "id": 93, "name": "…", "status": 2,
               "start_date": "2026-09-15", "deadline": null }
}
```

`espacio` viene **parcial en el listado** (esos cinco campos) y **completo en el detalle** (la ficha
de `GET /projects/{id}`). El listado no trae `counts`: obligaría al backend a una consulta por fila y
ninguna columna lo necesita. Por eso la definición **no tiene** columna "Tareas abiertas".

`cliente.company` no es el cliente: es la empresa a la que se le está licitando. Mientras la
licitación no se gane, `espacio.client` es `null` (`clientid = 0`), no un objeto vacío.

Los estados **no salen de `/lookups`**: no son un catálogo administrable en Perfex, son las tres ramas
del flujo. Van fijos en `ESTADOS_DE_LICITACION` (`src/definiciones/licitaciones.ts`), con el mismo
criterio que `TIPOS_DE_FACTURACION` en `definiciones/espacios.ts`. Por eso la columna Estado no usa
`comoInsignia`: ese camino busca el valor en un catálogo y la dejaría en blanco.

## Acciones y escrituras

**`POST /licitaciones`** crea las tres cosas de una vez. Cuerpo: `cliente` (objeto, `company`
obligatoria), `contacto` (objeto, `firstname` / `lastname` / `email` obligatorios) y `espacio` (objeto,
`name` y `start_date` obligatorios, más `deadline`, `billing_type`, `status`, `description`, `members`,
`project_cost`, `project_rate_per_hour`, `estimated_hours`).

**`PATCH /licitaciones/{id}` acepta SOLO `cliente` y `contacto`.** Los campos del Espacio —nombre,
fechas, estado, descripción— se editan con `PATCH /projects/{id}`, que ya existe. De ahí que el
formulario de **alta** tenga tres secciones y el de **edición** solo dos.

**No acepta cambios cuando la licitación ya está ganada o perdida**: responde `409`. Por eso la ficha
esconde Editar en esos dos estados, y en una ganada ofrece "Editar en el cliente" hacia
`/clientes/{client_id}`.

**`POST /licitaciones/{id}/actions/ganar`** crea el Cliente real y su contacto principal, y cuelga el
Espacio de ese cliente. **No se puede deshacer**, y así lo dice el diálogo de confirmación **antes**
de apretar.

**`POST /licitaciones/{id}/actions/perder`** archiva el Espacio con sus tareas, sus hitos y sus
archivos. La licitación sigue consultable.

Las dos acciones se confirman en un diálogo de Radix (`Dialogo` / `ContenidoDialogo`). Si la llamada
falla, **el diálogo no se cierra**: muestra el mensaje del contrato ahí mismo. Si sale bien, se hace
`router.refresh()` y se queda en la ficha — quien acaba de ganar quiere ver el resultado, no aparecer
en otra pantalla.

### Qué acciones hay en cada estado

| | Abierta | Ganada | Perdida |
|---|---|---|---|
| Editar | sí | no — "Editar en el cliente" → `/clientes/{client_id}` | no |
| Ganar / Perder | sí | no | no |
| Enlace al cliente | — | "Ver cliente" → `/clientes/{client_id}` | — |
| Enlace al Espacio | no: mientras es licitación no vive en esa sección | "Ver {espacio.name}" → `/espacios/{espacio.id}` | no |
| Pestañas | todas | todas | todas, consultables |

## Permisos

**No hay un permiso de Perfex propio**: no es una entidad suya. El frontend usa `permissions.projects`
de `GET /me` para ocultar controles (`create` para el alta, `edit` para editar, ganar y perder), que
es el mismo permiso que el backend aplica.

La sección aparece en la barra lateral cuando `secciones_habilitadas` de `GET /me` incluye
`"licitaciones"`. Es la **bandera de instalación**, no un permiso: el módulo se enciende por cliente, y
condicionarla a `permissions.projects` mostraría la sección en instalaciones donde el recurso ni
existe, con un listado que devolvería `404`.

Como en todo el panel: ocultar un botón no es seguridad, la API filtra igual.

## Reglas del panel que hay que replicar

Ninguna: el panel clásico no tiene licitaciones. Es un módulo propio de `ops-v2` sobre `tblprojects`.

## Estado de la API

En construcción, contra este contrato. El frontend está escrito y verificado sin tocar la API real.

## Criterios de aceptación

1. La lista pagina, ordena por `company`, `start_date` y `creada_en`, filtra por estado y busca, sin
   un `422`.
2. Sin filtro se ven las tres: abiertas, ganadas y perdidas.
3. El alta crea empresa candidata, contacto y Espacio en una sola llamada, y la lista lo muestra sin
   recargar a mano.
4. Ganar crea el cliente y lo enlaza; la ficha pasa a ofrecer "Ver cliente" y "Ver {espacio.name}", y
   Editar / Ganar / Perder desaparecen.
5. Perder archiva el Espacio y la licitación sigue abriéndose con sus pestañas.
6. Un `409` sobre una licitación ya resuelta se muestra en el diálogo, que **no** se cierra.
7. Las pestañas de trabajo no tienen código nuevo: son los paneles del detalle de Espacio.
8. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
