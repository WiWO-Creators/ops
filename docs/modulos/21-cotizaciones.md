# Cotizaciones

> `estimates`. Estructura casi idéntica a Facturas, con embudo propio y aceptación con firma.

## Qué resuelve

El presupuesto que se manda antes de facturar. Se acepta, se rechaza o vence, y al aceptarse se
convierte en factura.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/cotizaciones` | Tabla genérica |
| Embudo | `/cotizaciones/embudo` | Kanban por estado — **la API no lo soporta**, ver *Estado de la API* |
| Detalle | `/cotizaciones/[id]` | Encabezado, ítems, totales, aceptación |
| PDF | acción | **La API no lo soporta**, ver *Estado de la API* |

## Endpoints que consume

| Método | Ruta | Estado |
|---|---|---|
| `GET` | `/estimates` · `/estimates/{id}` | ✅ |
| `GET` | `/estimates/{id}/items` | ✅ array plano |
| `POST` | `/estimates` | ✅ |
| `PATCH` | `/estimates/{id}` | ✅ |
| `POST` | `/estimates/{id}/actions/convert-to-invoice` | ✅ — la ruta es **`actions/convert-to-invoice`**, en inglés |
| `GET` | `/estimates?vista=embudo` · `POST /estimates/{id}/mover` | ❌ no construido |
| `GET` | `/estimates/{id}/pdf` · `POST /estimates/{id}/enviar` | ❌ no construido |

La forma exacta de cada respuesta está en
[`../contrato-api.md`](../contrato-api.md#estimates--cotizaciones).

## Campos

Los de la tabla del panel: `number`, `total`, `total_tax`, `YEAR(date)`, cliente, espacio, `tags`,
`date`, `expirydate`, `reference_no`, `status`.

El detalle agrega los mismos bloques que Facturas —`subtotal`, `adjustment`, descuentos, `currency`,
`clientnote`, `adminnote`, `items`— más `pipeline_order`, `is_expiry_notified`, `invoiced_date`,
y el bloque `acceptance` (`firstname`, `lastname`, `email`, `date`, `ip`, `signature`).

**Ni `hash` ni `short_link` salen nunca.** `hash` (`estimates_helper.php:47`) es la credencial del
enlace público; `short_link` (`estimates_helper.php:11-40`) es esa misma URL acortada con bit.ly, o
sea el mismo hash con un salto de por medio. Los dos están fuera del `SELECT`.

> **`duedate` no es una columna de presupuestos: la columna es `expirydate`.** El contrato expone
> `duedate` porque el frontend usa la misma tabla genérica para factura y presupuesto, así que la
> whitelist traduce y **la ficha devuelve las dos claves con el mismo valor**.

Estados: 1 Borrador, 2 Enviada, 3 Rechazada, 4 Aceptada, 5 Expirada. Estos **sí** son los ids reales
(`Estimates_model::__construct()`), al revés que los de [Propuestas](11-propuestas.md), que estaban
mal en su ficha. Salen también de `GET /lookups` en `estimate_statuses`.

La tabla de ítems es **`tblitemable`**, no `tblitems_in`: ver [Facturas](20-facturas.md).

## Acciones y escrituras

Emitir, editar y **convertir a factura**. Enviar por correo y mover de etapa **no están
construidos**.

La regla de dinero de [Facturas](20-facturas.md) aplica igual, con la misma corrección: los totales
**no** los calcula `Estimates_model.php`, los calcula `calculate_total()` de `assets/js/main.js:7538`,
portada en `modules/api/Escritura/TotalesVenta.php`. El dinero **nunca viene del cuerpo**: mandar
`subtotal`, `total` o `discount_total` es `422`.

**Las líneas de un `PATCH` llevan `id`**, al revés que en Facturas: una línea con `id` conocido se
edita, una sin `id` se agrega, y las que no aparecen se borran. Un `id` de otro documento es `422` —
`tblitemable` no tiene clave foránea que lo impida.

**`convert-to-invoice` pide `create` sobre `invoices`**, no sobre `estimates`
(`admin/Estimates.php:422`).

## Permisos

Feature `estimates`, con las cinco capacidades (`helpers/staff_helper.php:63-66`).

La puerta de área tiene **tres** ramas, y la tercera es una opción de la instalación: `view` **o**
`view_own` **o** `allow_staff_view_estimates_assigned = 1` (`admin/Estimates.php:24`). Sin ninguna de
las tres, `403`. Una cotización que este staff no ve es `404`.

## Reglas del panel que hay que replicar

- **Convertir a factura** copia ítems, impuestos y descuentos, y enlaza los dos documentos. Es
  `Estimates_model::convert_to_invoice()`, no un `INSERT`.
- **`Estimates_model::update()` borra columnas por omisión de dos maneras**: `:611` abre con
  `trim($data['number'])` —un array parcial deja `number => ''` y el documento pierde su número— y
  `map_shipping_columns():1432` mira si **existe** la clave `include_shipping`, no su valor: mandar
  `include_shipping => 0` significa "sí hay envío", y si no existe escribe `include_shipping = 0` y
  `show_shipping_on_estimate = 1`. Por eso el módulo **hidrata la fila actual, superpone la whitelist
  y recién ahí delega**.
- `expirydate` vencida pasa la cotización a Expirada por cron, no por la interfaz.
- `is_expiry_notified` es bandera anti-spam del cron: no se edita.
- `pipeline_order` gobierna el orden dentro de la columna del embudo.

Fuente: `application/views/admin/tables/estimates.php`,
`application/views/admin/estimates/pipeline/`, `Estimates_model.php`.

## Estado de la API

✅ **Construido y verificado**, **sin PDF, sin envío y sin embudo**.

`Recursos/RecursoCotizaciones.php`, `Escritura/Cotizacion.php` y `Escritura/DocumentoDeVenta.php` —la
base compartida con Propuestas—, más `Recursos/RecursoItems.php`, compartido con Facturas y
Propuestas.

Verificación: `php index.php api v1 verificacion ventas` — 19 comparaciones, **0 diferencias**. En
producción **no hay ni una cotización**, así que el comparador siembra las suyas con rollback y
comprueba tres cosas: que el alta por el camino del panel y por el de la API produce filas, líneas e
impuestos idénticos en los cinco casos de dinero; que el dinero da la vuelta al centavo tras pasar por
`number_format()` y `decimal(15,2)`; y que **las dos conversiones a factura producen la misma factura,
campo a campo**.

**No está en `secciones_habilitadas` de `GET /me`**: la API responde, `ops-v2` no ofrece la sección.

**Fuera de alcance, declarado:**

- `GET /estimates/{id}/pdf` y `POST /estimates/{id}/enviar`.
- La vista de embudo (`?vista=embudo`) y `POST /{id}/mover` sobre `pipeline_order`.
- Los campos personalizados de `estimate`: `CamposPersonalizados::PARA_COTIZACIONES` ya existe, pero
  `RecursoCotizaciones` todavía no los pide. `tags` sí viajan.

**Hallazgo caro, que vale para los tres documentos de venta:**
`_format_data_sales_feature()` (`pre_query_data_formatters_helper.php:69`) **borra `discount_type`
cuando el `discount_total` que llega vale 0**. En el panel no se nota porque el navegador postea el
descuento ya calculado; una API que mande 0 pierde el tipo de descuento en silencio y el total sale
mal. Por eso el módulo escribe el `discount_total` **calculado** antes de llamar al modelo.

## Criterios de aceptación

1. Los totales coinciden al centavo con los del panel, en los mismos cinco casos que Facturas. ✅
2. Convertir a factura produce una factura idéntica a la que produce el panel para la misma
   cotización. ✅ Verificado campo a campo por los dos caminos.
3. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
