# Licitaciones

> **No es una entidad nueva de Perfex.** Una Licitación **es un Espacio** (`tblprojects`) colgado de
> un [Prospecto](12-prospectos.md) —la empresa candidata—: `licitacion.id === licitacion.espacio.id`.
> Por eso todo el trabajo —tareas, hitos, tiempos, archivos, discusiones— se lee de los endpoints de
> Espacio que ya existen, y el detalle no tiene un solo panel propio.
>
> **Desde la migración `0320` la empresa NO vive acá.** Vive en el Prospecto, una sola vez para todas
> sus licitaciones. Antes cada licitación cargaba su copia, y ganar dos licitaciones de la misma
> empresa creaba dos clientes con el mismo nombre.

## Qué resuelve

Preparar una propuesta para una empresa que **todavía no es cliente**, con el mismo espacio de
trabajo que tendría si ya lo fuera. El día que se gana la **primera** licitación de un prospecto, la
empresa candidata se convierte en Cliente de verdad con todas sus personas de contacto, y el Espacio
pasa a colgar de ese cliente; ganar la **segunda** no crea a nadie, solo cuelga su Espacio del
cliente que ya existe. El día que se pierde, el Espacio se archiva y la licitación queda consultable
en el histórico.

Lo que evita: crear un cliente falso para poder abrir un Espacio, y después tener que limpiarlo
cuando la licitación no se gana.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/licitaciones` | Tabla genérica: empresa (del prospecto), estado, nombre del Espacio, inicio |
| Detalle | `/licitaciones/[id]` | Cabecera del Espacio + Ficha, Tareas, Hitos, Tiempos, Archivos, Discusiones, Actividad |

**Sin vista de tarjetas**: una licitación se compara por empresa, estado y fecha, y esas tres
comparaciones se hacen en columnas.

Las pestañas de trabajo son **las mismas** del detalle de Espacio: las monta `DetalleDeEspacio`
(`src/componentes/proyecto/DetalleDeEspacio.tsx`), el mismo componente que usa
[Upselling](13-upselling.md). Reúne sin envoltorios `CabeceraProyecto`, `PanelDescripcion`,
`PanelTareas`, `PanelHitos`, `PanelTiempos`, `PanelArchivos`, `PanelDiscusiones` y `PanelActividad`;
lo único propio de cada sección es el contenido de la pestaña Ficha y la botonera de la cabecera.

No están Gantt, Notas, la capa de IA ni Configuración: son del Espacio adjudicado, no de la propuesta.

## Endpoints que consume

| Método | Ruta | Devuelve |
|---|---|---|
| `GET` | `/licitaciones` | Colección paginada; `espacio` **parcial** |
| `GET` | `/licitaciones/{id}` | Item; `espacio` es la ficha completa de `GET /projects/{id}` |
| `POST` | `/licitaciones` | `201` con el item |
| `PATCH` | `/licitaciones/{id}` | El item; **no acepta ningún campo** (ver abajo) |
| `POST` | `/licitaciones/{id}/actions/ganar` | `200` con el item ya ganado |
| `POST` | `/licitaciones/{id}/actions/perder` | `200` con el item ya perdido |
| `GET` | `/projects/{id}/tasks\|milestones\|members\|files` | Los subrecursos de trabajo, con `licitacion.espacio.id` |

Mientras es licitación, `GET /projects/{id}` y todos sus subrecursos responden `200` normal: lo único
que la esconde es el **listado** `GET /projects`. Por eso los paneles reusados funcionan desde el día
uno sin código de compatibilidad.

### Consulta

| Capacidad | Valores admitidos |
|---|---|
| `filter[]` | `estado`: `abierta`, `ganada`, `perdida`. `prospecto_id`: **existe pero no se declara** en la definición, se usa como `consultaFija` desde la ficha del Prospecto |
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
  "prospecto_id": 8,
  "prospecto": { "id": 8, "empresa": "…", "client_id": null, "client": null },
  "company": "Constructora X",     // el nombre del prospecto, resuelto por el JOIN
  "client_id": null,               // el Cliente REAL del prospecto; null hasta la primera victoria
  "client": null,
  "resultado_en": null,            // cuándo se ganó o se perdió
  "creada_en": "2026-09-08T12:00:00Z",
  "espacio": { "id": 93, "name": "…", "status": 2,
               "start_date": "2026-09-15", "deadline": null }
}
```

**Ya no hay `cliente` ni `contacto`.** El legajo de la empresa y sus personas viven en el Prospecto;
la ficha muestra un enlace hacia allá en vez de una copia. Copiarlo garantizaba que el listado y la
ficha mostraran datos distintos el día que alguien editara uno de los dos. `company` no es una
columna espejo: sale del JOIN, así que hay un solo nombre y no dos que se separan.

`espacio` viene **parcial en el listado** (esos cinco campos) y **completo en el detalle** (la ficha
de `GET /projects/{id}`). El listado no trae `counts`: obligaría al backend a una consulta por fila y
ninguna columna lo necesita. Por eso la definición **no tiene** columna "Tareas abiertas".

`prospecto.empresa` no es el cliente: es la empresa a la que se le está licitando. Mientras la
licitación no se gane, `espacio.client` es `null` (`clientid = 0`), no un objeto vacío.

Los estados **no salen de `/lookups`**: no son un catálogo administrable en Perfex, son las tres ramas
del flujo. Van fijos en `ESTADOS_DE_LICITACION` (`src/definiciones/licitaciones.ts`), con el mismo
criterio que `TIPOS_DE_FACTURACION` en `definiciones/espacios.ts`. Por eso la columna Estado no usa
`comoInsignia`: ese camino busca el valor en un catálogo y la dejaría en blanco.

## Acciones y escrituras

**`POST /licitaciones`** recibe `prospecto_id` (obligatorio, el prospecto tiene que existir o es
`404`) y `espacio` (objeto, `name` y `start_date` obligatorios, más `deadline`, `billing_type`,
`status`, `description`, `members`, `project_cost`, `project_rate_per_hour`, `estimated_hours`).

**`cliente` y `contacto` en el cuerpo son `422 no_editable`**, con un mensaje que dice dónde se
editan ahora. Es el cuerpo anterior a `0320`: aceptarlo en silencio dejaría creer que se guardó. **No
hay capa de compatibilidad**: el único consumidor es `ops-v2` y viaja en el mismo cambio.

**`PATCH /licitaciones/{id}` ya no acepta ningún campo.** La empresa y sus contactos se editan en
`/prospectos/{id}`; el nombre, las fechas, el estado y la descripción con `PATCH /projects/{id}`, que
ya existe. La ruta se conserva y devuelve `422 no_editable` con el destino escrito, en vez de
desaparecer con un `404` que no explica nada. Por eso **el formulario de edición ya no existe** y la
ficha ofrece "Ver prospecto" en su lugar.

**`POST /licitaciones/{id}/actions/ganar`** convierte el prospecto en Cliente real con todas sus
personas de contacto —**una sola vez**, en `Prospecto::asegurarCliente()`— y cuelga el Espacio de ese
cliente. Ganar la segunda licitación del mismo prospecto **no crea un segundo cliente**, y el diálogo
de confirmación escribe una cosa u otra según corresponda. **No se puede deshacer**.

**`POST /licitaciones/{id}/actions/perder`** archiva el Espacio con sus tareas, sus hitos y sus
archivos. La licitación sigue consultable.

Las dos acciones se confirman en un diálogo de Radix (`Dialogo` / `ContenidoDialogo`). Si la llamada
falla, **el diálogo no se cierra**: muestra el mensaje del contrato ahí mismo. Si sale bien, se hace
`router.refresh()` y se queda en la ficha — quien acaba de ganar quiere ver el resultado, no aparecer
en otra pantalla.

### Qué acciones hay en cada estado

| | Abierta | Ganada | Perdida |
|---|---|---|---|
| Editar | no existe: se edita en el prospecto y en el Espacio | no | no |
| Ganar / Perder | sí | no | no |
| Enlace al prospecto | "Ver prospecto" → `/prospectos/{prospecto_id}` | ídem | ídem |
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

Construida y verificada contra una base con datos reales.

## Criterios de aceptación

1. La lista pagina, ordena por `company`, `start_date` y `creada_en`, filtra por estado y busca, sin
   un `422`.
2. Sin filtro se ven las tres: abiertas, ganadas y perdidas.
3. El alta elige un prospecto que ya existe y crea el Espacio, y la lista lo muestra sin recargar a
   mano. El cuerpo anterior a `0320` (`{cliente: …}`) devuelve `422 no_editable`.
4. Ganar la primera licitación de un prospecto crea el cliente y lo enlaza; la ficha pasa a ofrecer
   "Ver cliente" y "Ver {espacio.name}", y Ganar / Perder desaparecen. Ganar la segunda **no** crea
   un segundo cliente.
5. Perder archiva el Espacio y la licitación sigue abriéndose con sus pestañas.
6. Un `409` sobre una licitación ya resuelta se muestra en el diálogo, que **no** se cierra.
7. Las pestañas de trabajo no tienen código nuevo: son los paneles del detalle de Espacio.
8. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
