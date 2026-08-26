# Propuestas

> `proposals`. Lleva importes: aplica la regla de dinero.

## Qué resuelve

El documento comercial que se envía antes de cerrar, a un prospecto o a un cliente. Tiene su propio
embudo y su propia aceptación con firma.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/propuestas` | Tabla genérica |
| Embudo | `/propuestas/embudo` | Kanban por estado — **la API no lo soporta**, ver *Estado de la API* |
| Detalle | `/propuestas/[id]` | Contenido, ítems, totales, aceptación, comentarios |
| PDF | acción | Vista previa y descarga — **la API no lo soporta**, ver *Estado de la API* |

## Endpoints que consume

| Método | Ruta | Estado |
|---|---|---|
| `GET` | `/proposals` · `/proposals/{id}` | ✅ |
| `GET` | `/proposals/{id}/items` | ✅ array plano |
| `GET` | `/proposals/{id}/comments` | ✅ array plano — la ruta es **`comments`**, en inglés, no `comentarios` |
| `POST` | `/proposals` | ✅ |
| `PATCH` | `/proposals/{id}` | ✅ |
| `POST` | `/proposals/{id}/actions/convert-to-invoice` | ✅ |
| `GET` | `/proposals?vista=embudo` · `POST /proposals/{id}/mover` | ❌ no construido |
| `GET` | `/proposals/{id}/pdf` · `POST /proposals/{id}/enviar` | ❌ no construido |

La forma exacta de cada respuesta está en
[`../contrato-api.md`](../contrato-api.md#proposals--propuestas).

## Campos

De `tblproposals`. Los que muestra la tabla del panel: `id`, `subject`, `proposal_to`, `total`,
`date`, `open_till`, `tags`, `datecreated`, `status`.

Los demás que necesita el detalle: `content`, `subtotal`, `total_tax`, `adjustment`,
`discount_percent`, `discount_total`, `discount_type`, `currency`, `address`, `email`, `phone`,
`allow_comments`, `rel_id`, `rel_type` (`lead` o `customer`), `pipeline_order`, el bloque de
aceptación (`acceptance_firstname`, `acceptance_lastname`, `acceptance_email`, `acceptance_date`,
`acceptance_ip`, `signature`) e `items`.

**Ni `hash` ni `short_link` salen nunca.** `hash` (`proposals_helper.php:48`) es la credencial del
enlace público, y quien la tiene abre la propuesta sin sesión; `short_link`
(`proposals_helper.php:11-40`) es esa misma URL acortada con bit.ly. Los dos están fuera del
`SELECT`.

**`number` tampoco es una columna**: se arma con el id y el prefijo configurado, réplica de
`format_proposal_number()`. Ordenar por `number` es ordenar por `id`.

> **Corrección: los ids de estado estaban mal.** Este documento listaba el **orden de presentación**
> como si fueran ids. Los reales (`helpers/proposals_helper.php:115 format_proposal_status()`) son:
>
> | `id` | Estado | Posición en la interfaz |
> |---|---|---|
> | 6 | Borrador | 1 |
> | 1 | Abierta | 2 |
> | 4 | Enviada | 3 |
> | 5 | Revisada | 4 |
> | 3 | Aceptada | 5 |
> | 2 | Rechazada | 6 |
>
> Es la misma trampa que `task_statuses`: **ordenar por `id` da un embudo equivocado**.
> `GET /lookups` publica el mapa correcto en `proposal_statuses`, ya ordenado por `order`, y el
> frontend ordena por ahí.

**`rel_type` decide a quién apunta la propuesta:** `lead` o `customer`. El detalle enlaza a
[Prospectos](10-prospectos.md) o a [Clientes](03-clientes.md) según ese campo, y no puede asumir uno.

## Acciones y escrituras

Crear, editar y **convertir a factura**. Mover de etapa y enviar por correo **no están construidos**.

**Los totales no se calculan en el frontend.** Ver la regla en [Facturas](20-facturas.md): vale igual
acá. El dinero **nunca viene del cuerpo**: `subtotal`, `total` y `discount_total` los calcula
`Escritura/TotalesVenta.php`; mandarlos es `422`.

**`convert-to-invoice` pide `create` sobre `invoices`**, no sobre `proposals`
(`admin/Proposals.php:374`). Y sólo se puede facturar una propuesta dirigida a un cliente: con
`rel_type = "lead"`, `Proposals_model::convert_to_invoice():1055` devuelve `false` sin decir por qué,
y acá eso es un **`409` explícito**.

## Permisos

Feature `proposals`, con las cinco capacidades más `view_all_templates`
(`helpers/staff_helper.php:99-104`).

**La visibilidad de propuestas NO es la de facturas.** `proposals_helper.php:324` mira **`assigned`**
—no `sale_agent`— y revalida `view_own` con una subconsulta sobre `tblstaff_permissions` dentro del
propio SQL: es la forma de la regla de pagos, no la de facturas.

La puerta de área tiene **tres** ramas, y la tercera es una opción de la instalación: `view` **o**
`view_own` **o** `allow_staff_view_proposals_assigned = 1`. Sin ninguna de las tres, `403`. Una
propuesta que este staff no ve es `404`.

## Reglas del panel que hay que replicar

- El PDF lo genera Perfex con TCPDF. El frontend lo **mostraría y lo descargaría**, no lo arma —
  pero el endpoint no existe.
- `pipeline_order` gobierna el orden dentro de la columna del embudo, igual que `kanban_order` en
  Procesos. **Viaja de sólo lectura**: no hay `POST /{id}/mover` que lo escriba.
- **`Proposals_model::update()` borra columnas por omisión de dos maneras**: `:178` abre con
  `$data['allow_comments'] = isset(...) ? 1 : 0`, y `:182-189` pone `rel_id = null, rel_type = ''` si
  alguno llega vacío. Un `PATCH` del asunto apagaría los comentarios y dejaría la propuesta sin
  destinatario. Por eso el módulo **hidrata la fila actual, superpone la whitelist y recién ahí
  delega**.
- La aceptación con firma escribe IP y fecha. Es un registro legal: no se edita desde la interfaz.
- `short_link` es el enlace público que recibe el cliente, y por eso **la API no lo devuelve**: es el
  `hash` acortado.

Fuente: `application/views/admin/tables/proposals.php`,
`application/views/admin/proposals/pipeline/`, `Proposals_model.php`.

## Estado de la API

✅ **Construido y verificado**, **sin PDF, sin envío y sin embudo**.

`Recursos/RecursoPropuestas.php`, `Escritura/Propuesta.php` y `Escritura/DocumentoDeVenta.php` —la
base compartida con Cotizaciones—, más `Recursos/RecursoItems.php`, compartido con Facturas y
Cotizaciones: los tres usan la misma tabla de ítems, que es **`tblitemable`**, no `tblitems_in`
(renombrada en `application/migrations/231_version_231.php:180`).

Verificación: `php index.php api v1 verificacion ventas` — 19 comparaciones, **0 diferencias**,
`filas_dejadas: []`. En producción **no hay ni una propuesta**, así que el comparador siembra las
suyas dentro de una transacción con rollback.

**No está en `secciones_habilitadas` de `GET /me`**: la API responde, `ops-v2` no ofrece la sección.

**Fuera de alcance, declarado:**

- `GET /proposals/{id}/pdf` y `POST /proposals/{id}/enviar`. `save_and_send` **no se propaga jamás**,
  ni con el kill-switch puesto.
- La vista de embudo (`?vista=embudo`) y `POST /{id}/mover` sobre `pipeline_order`.
- Los campos personalizados de `proposal`: `CamposPersonalizados::PARA_PROPUESTAS` ya existe, pero
  `RecursoPropuestas` todavía no los pide. `tags` sí viajan.

**Trampa de runtime que costó un fatal:** `Proposals_model::get():377` pasa la propuesta por
`parse_proposal_content_merge_fields()`, que carga `Proposals_merge_fields extends App_merge_fields`
— y la clase base la carga `_app_init()`, que el módulo no corre nunca. Sin ella, `add()` y `update()`
mueren con *"Non-existent class"* apenas el modelo relee lo que escribió. Se carga desde
`Escritura/Propuesta::prepararModelo()`, no desde `Nucleo/ModeloPerfex.php`, que es compartido.

## Criterios de aceptación

1. Los totales de una propuesta coinciden **al centavo** con los del panel para el mismo documento.
   ✅ Verificado por los dos caminos de escritura en los cinco casos de dinero.
2. El PDF descargado es byte a byte el que genera Perfex. **NO se cumple**: el PDF no se construyó.
3. Una propuesta con `rel_type: "lead"` enlaza al prospecto; una con `"customer"`, al cliente. ✅ El
   backend devuelve el destinatario ya resuelto en `related`, además de `rel_type` y `rel_id`.
4. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
