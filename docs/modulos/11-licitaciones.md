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
| `PATCH` | `/licitaciones/{id}` | El item; acepta los **cinco campos propios** (ver abajo) |
| `POST` | `/licitaciones/{id}/actions/ganar` | `200` con el item ya ganado |
| `POST` | `/licitaciones/{id}/actions/perder` | `200` con el item ya perdido |
| `GET` | `/projects/{id}/tasks\|milestones\|members\|files` | Los subrecursos de trabajo, con `licitacion.espacio.id` |

Mientras es licitación, `GET /projects/{id}` y todos sus subrecursos responden `200` normal: lo único
que la esconde es el **listado** `GET /projects`. Por eso los paneles reusados funcionan desde el día
uno sin código de compatibilidad.

### Consulta

| Capacidad | Valores admitidos |
|---|---|
| `filter[]` | `estado`: `abierta`, `ganada`, `perdida`. `empresa_holding`, `area_id`, `modelo_servicio`, `owner_id`, `focal_id`, `codigo`. `prospecto_id`: **existe pero no se declara** en la definición, se usa como `consultaFija` desde la ficha del Prospecto |
| `sort` | `codigo`, `company`, `start_date` (que es `espacio.start_date`), `creada_en`. Por defecto `-creada_en` |
| `q` | Busca en `company`, en el nombre del Espacio, en `codigo` y en `codigo_anterior` |
| `include` | **Ninguno.** El Espacio y el contacto ya vienen en la fila |

**Sin filtro devuelve las tres**, no solo las abiertas: el histórico se consulta desde la misma
pantalla, y esconderlo por defecto obligaría a saber que existe un filtro para encontrarlo.

## Campos

```jsonc
{
  "id": 93,                        // == el id del Espacio: son la misma fila vista de dos lados
  "estado": "abierta",             // "abierta" | "ganada" | "perdida"
  "codigo": "le_0042",             // el identificador que la gente usa; lo emite la base
  "codigo_anterior": null,         // el "le_0042" de antes de ganarse; null si nunca cambió
  "empresa_holding": "mgc",        // "mgc" | "hl" | "pacifico" | null
  "area_id": 3,                    // área del EQUIPO (lookup `areas`); null si no se eligió
  "modelo_servicio": "mantencion", // "implementacion" | "mantencion" | "implementacion_mantencion" | null
  "owner_id": 7,
  "owner": { "id": 7, "full_name": "…", "…": "…" },   // la persona completa, o null
  "focal_id": 12,
  "focal": { "id": 12, "full_name": "…", "…": "…" },  // la persona completa, o null
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
`404`), `espacio` (objeto, `name` y `start_date` obligatorios, más `deadline`, `billing_type`,
`status`, `description`, `members`, `project_cost`, `project_rate_per_hour`, `estimated_hours`) y los
**cinco campos propios de la licitación**, todos opcionales:

| Clave | Tipo | Valores | Validación del servidor |
|---|---|---|---|
| `empresa_holding` | `string \| null` | `"mgc"`, `"hl"`, `"pacifico"` | Fuera del catálogo → `422 {empresa_holding: ["invalid"]}` |
| `area_id` | `int \| null` | id del lookup `areas` de `GET /lookups` (áreas del **equipo**) | No existe en `tblareas` → `422 {area_id: ["unknown"]}` |
| `modelo_servicio` | `string \| null` | `"implementacion"`, `"mantencion"`, `"implementacion_mantencion"` | Fuera del catálogo → `422 {modelo_servicio: ["invalid"]}` |
| `owner_id` | `int \| null` | `staffid` | No existe en `tblstaff` → `422 {owner_id: ["unknown"]}` |
| `focal_id` | `int \| null` | `staffid` | No existe en `tblstaff` → `422 {focal_id: ["unknown"]}` |

Los tres enteros aceptan también la **cadena de dígitos** que manda un `<select>` (`"7"` vale `7`), y
la **cadena vacía** vale `null` — un selector sin elegir no es un valor inválido. El servidor valida
el rango aunque el formulario ya lo haya hecho: un `<select>` es una comodidad, no una garantía.

**`modelo_servicio` reemplaza a `billing_type` solo acá.** En `POST /projects` y en el formulario de
Espacio, `billing_type` sigue igual: aquello dice cómo se le cobra a un Espacio ya vendido, y esto,
qué se ofrece. Son dos preguntas, no dos nombres de la misma.

**`cliente` y `contacto` en el cuerpo son `422 no_editable`**, con un mensaje que dice dónde se
editan ahora. Es el cuerpo anterior a `0320`: aceptarlo en silencio dejaría creer que se guardó. **No
hay capa de compatibilidad**: el único consumidor es `ops-v2` y viaja en el mismo cambio.

**`POST` puede responder `503`.** Crear una licitación crea además su carpeta de Drive (abajo), y si
Google no responde **no se crea nada**: ni el Espacio, ni la licitación. El mensaje del `503` dice el
motivo. Es a propósito lo contrario del criterio del panel, donde Drive nunca corta el alta.

**`PATCH /licitaciones/{id}` acepta esos mismos cinco campos, y nada más.** Omitir una clave la deja
como estaba; mandarla en `null` la vacía — son dos cosas distintas, y de eso depende el asistente por
pasos, que manda un paso por vez. La empresa y sus contactos se siguen editando en `/prospectos/{id}`;
el nombre, las fechas, el estado y la descripción con `PATCH /projects/{id}`. Cualquier otra clave
—`codigo` incluido— es `422 no_editable` con el destino escrito.

**`POST /licitaciones/{id}/actions/ganar`** convierte el prospecto en Cliente real con todas sus
personas de contacto —**una sola vez**, en `Prospecto::asegurarCliente()`— y cuelga el Espacio de ese
cliente. Ganar la segunda licitación del mismo prospecto **no crea un segundo cliente**, y el diálogo
de confirmación escribe una cosa u otra según corresponda. **No se puede deshacer**.

En la misma transacción, el **código pasa de `le_` a `mod_`** conservando el correlativo
(`le_0042` → `mod_0042`) y el anterior queda en `codigo_anterior`. Después del commit se **renombra**
la carpeta de Drive: es la misma carpeta, el id no cambia, así que los enlaces ya compartidos siguen
funcionando. Si Google falla, el renombrado queda en el registro de actividad y el cierre **no** se
revierte.

**`POST /licitaciones/{id}/actions/perder`** archiva el Espacio con sus tareas, sus hitos y sus
archivos. La licitación sigue consultable.

Las dos acciones se confirman en un diálogo de Radix (`Dialogo` / `ContenidoDialogo`). Si la llamada
falla, **el diálogo no se cierra**: muestra el mensaje del contrato ahí mismo. Si sale bien, se hace
`router.refresh()` y se queda en la ficha — quien acaba de ganar quiere ver el resultado, no aparecer
en otra pantalla.

### Qué acciones hay en cada estado

| | Abierta | Ganada | Perdida |
|---|---|---|---|
| Editar | los cinco campos propios, por `PATCH`; la empresa en el prospecto y el resto en el Espacio | ídem | ídem |
| Ganar / Perder | sí | no | no |
| Enlace al prospecto | "Ver prospecto" → `/prospectos/{prospecto_id}` | ídem | ídem |
| Enlace al cliente | — | "Ver cliente" → `/clientes/{client_id}` | — |
| Enlace al Espacio | no: mientras es licitación no vive en esa sección | "Ver {espacio.name}" → `/espacios/{espacio.id}` | no |
| Pestañas | todas | todas | todas, consultables |

## El código: `le_0042` → `mod_0042`

Cada licitación tiene un identificador propio, correlativo y ordenable: `le_0042` mientras se
postula, `mod_0042` una vez ganada. **El correlativo no cambia** — es la misma licitación, y
renumerarla invalidaría los enlaces, las carpetas y las tareas que ya la nombran.

**No es la patente de cuatro letras del Espacio** (`CNSA-001`). Aquella se deriva del nombre de la
empresa y solo existe cuando hay cliente; una licitación no tiene cliente, que es su motivo de
existir. Los dos identificadores conviven: la patente nombra al Espacio, el código nombra a la
licitación.

| Regla | Cómo funciona |
|---|---|
| No se escribe desde ningún cuerpo | Lo emite la base al crear. `codigo` en un `POST` o un `PATCH` es `422 no_editable` |
| Dos altas simultáneas no chocan | El correlativo es una columna `AUTO_INCREMENT`; no hay ningún `MAX()+1` en PHP |
| La conversión es de ida | El `UPDATE` solo toca lo que todavía empieza con `le_`. Revertir el estado **no** devuelve el prefijo |
| El código viejo sigue resolviendo | Queda en `codigo_anterior`, y entra en la búsqueda: `?q=le_0042` encuentra la que hoy se llama `mod_0042` |

Puede haber **huecos** en la serie: una alta que revierte se lleva su número. Nadie pidió que no los
hubiera, y evitarlos exigiría un candado global sobre la tabla.

## La carpeta de Drive

Crear una licitación crea su árbol de carpetas, con taxonomía fija:

```
Licitaciones/
└─ <AÑO>/
   └─ <código>_<Empresa>_<Nombre corto del Espacio>/
      ├─ 01_Bases/          ├─ 04_Creatividad/
      ├─ 02_Propuesta/      ├─ 05_Entregables/
      └─ 03_Presupuesto/    └─ 06_Comunicaciones/
```

Los prefijos numéricos existen para forzar el orden: Drive ordena alfabéticamente y "Bases" quedaría
después de "Propuesta". El nombre corto va en formato de título —un nombre escrito todo en mayúsculas
se reescribe—, y las barras y los dos puntos del nombre de la empresa se limpian.

- **No se comparte con el cliente.** La carpeta hereda los permisos de la unidad compartida y nada
  más. Abrirla a alguien es otra acción: `POST /drive/{folder_id}/permissions`.
- **Se registra como la carpeta del Espacio**, así que `GET /projects/{id}/drive`, la subida de
  archivos y los permisos funcionan sin nada nuevo del lado del frontend.
- **Al ganar se renombra, no se duplica ni se mueve**: el id de Drive no cambia.
- **Si Drive falla, el `POST` responde `503` y no se creó nada.** Mejor ninguna licitación que una
  licitación sin su carpeta.

## Avisos de plazo

Un cron diario (8:30) avisa al **owner** y al **focal** de cada licitación abierta cuando faltan
exactamente **7, 3, 1 o 0 días** para una fecha:

| Evento | Qué fecha mira |
|---|---|
| `licitacion_vencimiento` | `espacio.deadline`: el cierre de la licitación |
| `licitacion_fecha_clave` | el `due_date` de cada hito del Espacio (las Fechas Clave) |

Son **dos eventos y no uno** porque no se apagan juntos: quien lleva diez licitaciones quiere saber
cuándo cierra cada una y no necesariamente cada uno de sus hitos. Los dos están en el catálogo de
`/notifications/preferences`, así que cada persona se apaga el que quiera.

Días exactos y no una ventana: si se avisara por "faltan 7 días o menos", la misma licitación
generaría ocho avisos seguidos. Lo **ya vencido no se avisa** — la banda de alertas de la pantalla lo
muestra, que para eso es una lectura.

**El interruptor de la casa es `wiwo_avisos_licitaciones`** (Administración → Avisos por correo,
grupo `correo`). **Nace apagado**, como todo efecto externo: con él en `0` el cron corre, cuenta lo
que habría avisado y no escribe ni un aviso ni un correo.

`GET /me/vencimientos` devuelve además un bloque `licitacion` por Proceso: `{id, codigo, estado}` si
su Espacio es una licitación, y `null` si no. **Ya no hace falta cruzar `proceso.project.id` contra
`GET /licitaciones` a mano.**

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

Construida y verificada contra una base con datos reales. El código, los cinco campos del alta, la
carpeta de Drive y los avisos de plazo llegan con la migración `0470` de `modules/api/migraciones/`.

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
8. El alta acepta los cinco campos propios y rechaza con `422` un holding, un modelo o un área que no
   estén en su catálogo. Dos altas seguidas reciben códigos distintos y correlativos.
9. Al ganar, el código pasa de `le_NNNN` a `mod_NNNN` con el mismo número, el anterior queda como
   alias y `?q=<código viejo>` sigue encontrando la licitación.
10. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
