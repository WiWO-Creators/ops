# Contratos

> `contracts`. El módulo más simple del grupo Comercial.

## Qué resuelve

El documento firmado con un cliente: vigencia, valor, tipo y firma.

Junto con Prospectos, es uno de los dos únicos recursos con **datos reales** en producción: 29 filas
en `tblcontracts`. Todo lo de abajo está verificado contra datos de verdad.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/contratos` | Tabla genérica |
| Detalle | `/contratos/[id]` | Contenido, vigencia, firma, adjuntos, comentarios |

## Endpoints que consume

| Método | Ruta | Estado |
|---|---|---|
| `GET` | `/contracts` · `/contracts/{id}` | ✅ |
| `GET` | `/contracts/{id}/comentarios` · `/contracts/{id}/archivos` | ✅ array plano |
| `PATCH` | `/contracts/{id}` | ✅ |
| `POST` | `/contracts/{id}/acciones/marcar-firmado` · `/desmarcar-firmado` | ✅ |
| `POST` `DELETE` | `/contracts` · `/contracts/{id}` | ❌ `404` — alta y borrado no están expuestos |

> El filtro del cliente se llama **`client`**, no `clientid`: es el nombre real de la columna en
> `tblcontracts`, la única de las cinco tablas de venta que no la llamó `clientid`.

La forma exacta de cada respuesta está en
[`../contrato-api.md`](../contrato-api.md#contracts--contratos).

## Campos

Los que muestra la tabla del panel: `id`, `subject`, cliente, tipo de contrato (`contracts_types.name`),
`contract_value`, `datestart`, `dateend`, espacio asociado (`projects.name`), `signature`.

El detalle además necesita: `content`, `description`, `contract_type`, `project_id`, `added_by`,
`dateadded`, `last_sent_at`, `isexpirynotified`, `not_visible_to_client`, `trash`, `hash`, `signed`,
`marked_as_signed`, `signature_status`, `vigencia`, `tags`, `custom_fields`, el bloque de aceptación
y `short_link`.

**`content` sale crudo, con los `{merge_field}` sin resolver.** `Contracts_model::get():31-39` los
sustituye sólo cuando `$for_editor == false`, y hacerlo en cada detalle obligaría a cargar tres
librerías de merge fields por petición. **El frontend recibe el texto tal como está guardado y no lo
interpreta.**

**`signature_status` es la precedencia del panel ya resuelta**
(`views/admin/tables/contracts.php:116-123`): `marked_as_signed` → `signed` → `not_signed`. El
frontend no la reimplementa.

**`vigencia` es `"vigente"`, `"vencido"` o `null`**, con las comparaciones **estrictas** del panel:
un contrato sin `dateend` es vigente, y **uno cuyo `dateend` es exactamente hoy no es ninguno de los
dos** — el panel lo deja fuera de sus dos contadores y la API devuelve el mismo conjunto. `hoy` es
`date('Y-m-d')` de PHP, no `CURDATE()`: MySQL puede estar en otra zona horaria.

> **`hash` sí viaja**, al revés que en facturas, cotizaciones y propuestas: `Contracts_model` no
> expone pago desde el enlace público, sólo la firma. Aun así es una credencial: la interfaz no debe
> imprimirla ni ponerla en una URL que se comparta.

`contract_value` **es dinero**: número, y no se opera en JavaScript.

Los tipos de contrato salen de `tblcontracts_types`, configurable: van en `lookups` como
`contract_types`.

## Acciones y escrituras

Editar, marcar y desmarcar firmado. **Subir adjuntos no está construido**; la lectura sí. La firma
real del cliente llega por el enlace público de Perfex y **la API no la toca nunca**.

Editables por `PATCH` (`Escritura/ParcheContrato.php:39-49`): `subject`, `description`, `content`,
`datestart`, `dateend`, `contract_type`, `project_id`, `not_visible_to_client`, `trash`. Cambiar
`dateend` resetea `isexpirynotified = 0` (`Contracts_model.php:155-157`) — y sólo si **cambia**:
repetir la misma fecha no reactiva el aviso del cron.

**Marcar y desmarcar firmado son acciones, no un `PATCH`**, porque no cambian un campo:
`mark_as_signed()` / `unmark_as_signed()` (`Contracts_model.php:500-538`) **reescriben `content`**,
congelando o restaurando cada `{merge_field}` dentro de un `<span data-merge-field>`. Un `UPDATE` de
una sola columna dejaría el contrato firmado mostrando datos del cliente que cambian después de la
firma. Si ya está en ese estado, la acción **no llama al modelo**: repetirla anidaría los `<span>`.

**`PATCH` sobre un contrato con `signed = 1` que toque `contract_value`, `clientid`, `datestart` o
`dateend` es `409`.** Divergencia deliberada: `admin/Contracts.php:66-68` hace `unset()` de esos
cuatro campos y **acepta el formulario tirándolos sin avisar**.

## Permisos

Feature `contracts`, con las cinco capacidades más `view_all_templates`
(`helpers/staff_helper.php:39-44`).

Puerta de área de dos ramas —`view` o `view_own`—, y `403` si no pasa ninguna. Sin `view` global, la
regla de fila es `addedfrom = yo` (`admin/tables/contracts.php:63`); un contrato de otro responde
`404`. El `PATCH` y las acciones exigen además `edit`.

## Reglas del panel que hay que replicar

- `signed` y `marked_as_signed` son distintos: el primero es firma real del cliente con su IP y fecha;
  el segundo es que alguien del equipo lo marcó a mano. La interfaz tiene que distinguirlos, porque
  significan cosas distintas ante un conflicto.
- `not_visible_to_client` esconde el contrato del portal.
- `isexpirynotified` es una bandera anti-spam del cron: no se edita por sí misma, pero cambiar
  `dateend` la resetea.
- **`Contracts_model::update():161-165` tiene semántica de formulario HTML**: pone
  `not_visible_to_client` y `trash` en 0 cuando la clave no viene. Por eso `Escritura/ParcheContrato`
  escribe SQL propio con whitelist en vez de llamar al modelo.
- **Marcar firmado no avisa a nadie.** `mark_as_signed()` no llama a
  `send_contract_signed_notification_to_staff()`: eso lo hace `add_signature()`, el camino del
  cliente.

Fuente: `application/views/admin/tables/contracts.php`.

## Estado de la API

✅ **Construido y verificado** contra datos reales.

`Recursos/RecursoContratos.php` y `Escritura/ParcheContrato.php`.

Verificación: `php index.php api v1 verificacion contratos --prod` sobre las **29 filas reales** —
**0 diferencias** sobre 179 staff (15 con lista, 164 con `403`); `vigencia` da 15 vigentes + 14
vencidos, intersección 0, unión igual a las 29 con `trash = 0`. Cuatro casos que la base no tiene
—contrato firmado por el cliente, precedencia de las dos marcas, `dateend` exactamente hoy, y un
staff con `view_own` pero sin `view`— se siembran con rollback.

**No está en `secciones_habilitadas` de `GET /me`**: la API responde, `ops-v2` no ofrece la sección.

**Fuera de alcance, declarado:**

- **Alta y borrado de contratos.** `POST` y `DELETE` son `404`.
- **Subida de adjuntos.** La lectura y la descarga funcionan: `Recursos/Descargas.php:45-90` conoce
  el tipo `contract`.
- **Escritura de `contract_value` y `clientid`.**

**Trampa de runtime:** `mark_as_signed()` necesita la librería `merge_fields/app_merge_fields`, que
define la clase base `App_merge_fields`. En el panel entra por `_app_init_load()`; el módulo no corre
`_app_init()` a propósito, así que sin cargarla la acción era un fatal `500`. Se carga en
`RecursoContratos`, la única ruta que la necesita, y **no** en `Nucleo/ModeloPerfex`, que es
compartido.

## Criterios de aceptación

1. Un contrato firmado por el cliente y uno marcado a mano se ven distinto en la lista. ✅
   `signature_status` los distingue con la precedencia del panel, y `signed` / `marked_as_signed`
   viajan crudos.
2. Los contratos vencidos se distinguen de los vigentes por `dateend`, calculado con la fecha local.
   ✅ Con `date('Y-m-d')` de PHP y comparaciones estrictas. **Un contrato que vence hoy sale con
   `vigencia: null`**: es lo que hace el panel, y el comparador mide ese hueco y lo reporta con su
   número.
3. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
