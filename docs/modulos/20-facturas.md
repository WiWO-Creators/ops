# Facturas

> `invoices`. El módulo de mayor riesgo del sistema.

## Por qué es el de mayor riesgo

No es el volumen. Es que el dinero no admite aproximaciones: impuestos compuestos, descuentos por
documento, monedas con distinto redondeo, notas de crédito parciales, facturas recurrentes y PDFs que
el cliente recibe.

> **Corrección.** Este documento decía "descuentos por línea". **No existen en Perfex**:
> `tblitemable` no tiene ninguna columna de descuento —comprobado con `SHOW COLUMNS` en
> `modules/api/herramientas/comparar-dinero.php:422`— y el descuento es siempre por documento, con
> `discount_type` en `""`, `before_tax` o `after_tax`.

> **Corrección.** Este documento decía "esa lógica no se reescribe: se llama". Es falso para el
> cálculo del total. `Invoices_model.php` **no calcula `subtotal` ni `total`**: los recibe ya
> calculados del navegador, que los arma en `assets/js/main.js:7538 calculate_total()` —una función
> de JavaScript de 170 líneas cuyo propio comentario dice *"NOT RECOMENDING EDIT THIS FUNCTION"*—.
> Ningún modelo de PHP los recalcula. Una API que llamara al modelo sin más guardaría ceros.
> Por eso el módulo **porta esa función**: `modules/api/Escritura/TotalesVenta.php`, con sus 18 casos
> en `herramientas/comparar-totales-casos.php`. Lo que sí se llama tal cual es el resto:
> `add()`, `update()`, `update_invoice_status()` y las cascadas.

## La regla no negociable

> **Ningún cálculo monetario ocurre en JavaScript.**

El frontend recibe totales ya calculados y los **formatea**. No suma, no aplica impuestos, no calcula
descuentos, no convierte monedas. Ni siquiera "para mostrar un preview". Un total calculado en el
navegador que difiere en un peso del que emite Perfex es un problema con un cliente, no un bug de
interfaz.

El criterio de cierre es mecánico: un `grep` de aritmética sobre importes en `src/` no devuelve nada
fuera del formateo de presentación.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/facturas` | Tabla genérica |
| Detalle | `/facturas/[id]` | Encabezado, ítems, totales, pagos aplicados, estado |
| Emisión | `/facturas/nueva` | Formulario con ítems; los totales los devuelve el servidor |
| Registrar pago | superposición | Ver [Pagos](22-pagos.md) |
| PDF | acción | Vista previa y descarga, **generado por Perfex con TCPDF** |

## Endpoints que consume

| Método | Ruta | Estado |
|---|---|---|
| `GET` | `/invoices` · `/invoices/{id}` | ✅ |
| `GET` | `/invoices/{id}/items` · `/invoices/{id}/payments` | ✅ array plano |
| `POST` | `/invoices` | ✅ |
| `PATCH` | `/invoices/{id}` | ✅ |
| `POST` | `/invoices/{id}/actions/cancel` · `/uncancel` | ✅ |
| `POST` | `/invoices/{id}/enviar` | ❌ no construido |
| `GET` | `/invoices/{id}/pdf` | ❌ no construido |

La forma exacta de cada respuesta, las whitelists y los errores están en
[`../contrato-api.md`](../contrato-api.md#invoices--facturas).

## Campos

Los que muestra la tabla del panel: `number`, `total`, `total_tax`, `YEAR(date)`, `date`, cliente,
espacio asociado, `duedate`, `status`. **`tags` no viaja**: ver *Estado de la API*.

El detalle además: `prefix`, `number_format`, `datecreated`, `currency` (con `currency_name` y
`symbol`), `subtotal`, `adjustment`, `addedfrom`, `clientnote`, `adminnote`, `discount_percent`,
`discount_total`, `discount_type` (`""`, `before_tax`, `after_tax`), `recurring`, `paymentmethod`,
`sent`, `datesend`, `sale_agent`, e `items`.

Estados: 1 Sin pagar, 2 Pagada, 3 Pago parcial, 4 Vencida, 5 Cancelada, 6 Borrador.

Ítems: `id, description, long_description, qty, rate, unit, is_optional, is_selected, order,
taxes[]`. Cada tasa es `{name, rate, registered}`; `registered` es `false` cuando esa combinación ya
no existe en `tbltaxes` — pasa con documentos viejos, y descartarla correría el total.

La tabla de líneas es **`tblitemable`**, no `tblitems_in`: ese era su nombre hasta que
`application/migrations/231_version_231.php:180` la renombró. Las tres entidades —factura, cotización
y propuesta— comparten esa tabla, distinguidas por `rel_type`.

**Todos los importes llegan como número, ya calculados por el backend.** `taxes` es un array porque
un ítem puede llevar más de un impuesto — de ahí salen los compuestos.

## Acciones y escrituras

Emitir, editar, registrar pago, cancelar y descancelar. **Enviar por correo no está construido.**

Al crear con ítems, Perfex usa un formato de cuerpo particular:

```
newitems[0][description]=Servicio X
newitems[0][rate]=100000
newitems[0][qty]=1
newitems[0][taxname][0]=IVA|19
```

Eso lo traduce el recurso de la API; el frontend manda JSON limpio con las tasas como cadena
`"IVA|19"`. Ojo: **en cotizaciones y propuestas la misma clave viaja como objeto**
`{"name":"IVA","rate":19}`, y la lectura de las tres devuelve objetos. Ver el contrato.

**Cuando el `PATCH` trae `items`, el juego de líneas se reemplaza entero.** En cotizaciones y
propuestas, en cambio, las líneas llevan `id` y se editan una a una. No es la misma semántica.

## Permisos

Feature `invoices`, con las cinco capacidades y 28 chequeos en el controlador del panel. Además,
`allow_staff_view_invoices_assigned` amplía la visibilidad a quien figure como `sale_agent`. Hay que
leer el controlador antes de construir el recurso.

## Reglas del panel que hay que replicar

- **Los cálculos son de `calculate_total()`, portada en `Escritura/TotalesVenta.php`.** Impuesto
  simple con redondeo por línea, impuesto compuesto, descuento antes del impuesto, descuento sobre el
  total, ajuste con moneda no predeterminada: los cinco casos se prueban contra el panel. **No hay un
  sexto caso de "descuento por línea": esa columna no existe.**
- **El redondeo es `Math.round` del JS, no `round()` de PHP.** Difieren en `-0.005`, y la base tiene
  líneas con `rate` negativo (así representa Perfex algunos descuentos).
- **El PDF lo genera Perfex.** El frontend lo muestra y lo descarga.
- Las facturas recurrentes las genera el cron. Desde la interfaz se configuran, no se disparan.
- El número de factura sale de `prefix` + `number_format`: no se arma en el frontend.
- Una factura con pagos aplicados: **el panel NO lo restringe.** `admin/Invoices.php:333-356` sólo
  pide `edit` y no mira `tblinvoicepaymentrecords`; `invoice_template.php` dibuja el formulario
  completo sobre una factura ya cobrada. Lo único parecido es
  `Invoices_model::check_for_merge_invoice():560-570`, que se niega a **fusionar** una factura pagada
  —no a editarla—. La API es **más estricta a propósito**: con pagos aplicados, tocar `currency`,
  `discount_percent`, `discount_total`, `discount_type`, `adjustment` o `items` es `409`. Lo no
  monetario se sigue editando. Divergencia deliberada, no réplica.
- **`status` es columna guardada, no derivada.** Si el cron no corrió, una factura vencida dice "Sin
  pagar" en los dos sistemas. La interfaz no la recalcula.
- **`hash`, `token` y `short_link` no salen nunca**: son la llave del enlace público de pago.

Fuente: `application/views/admin/tables/invoices.php` (columnas y joins), `Invoices_model.php` (todos
los cálculos), `invoice_template.php` (el PDF).

## Estado de la API

✅ **Construido y verificado**, con lo de abajo declarado fuera de alcance.

`Recursos/RecursoFacturas.php`, `Escritura/Factura.php`, `Escritura/TotalesVenta.php` y
`Recursos/RecursoItems.php` —este último compartido con Cotizaciones y Propuestas, las tres sobre
`tblitemable` distinguidas por `rel_type`—.

Verificación: `php index.php api v1 verificacion dinero`, **0 diferencias**, con control negativo
—corriendo una constante `107100` a `107101`, el comparador pasa a 1 diferencia con el detalle
exacto, así que el verde no es por vacío—. En producción **no hay ni una factura ni un pago**, así
que el comparador siembra sus datos en una transacción que siempre revierte.

**No está en `secciones_habilitadas` de `GET /me`**: la API responde, `ops-v2` no ofrece la sección.

**Fuera de alcance, declarado:**

- `GET /invoices/{id}/pdf` y `POST /invoices/{id}/enviar`.
- **Facturas recurrentes**: las genera el cron; `recurring` viaja de sólo lectura.
- **Notas de crédito**: sin recurso.
- **`PATCH /payments/{id}`**: ver [Pagos](22-pagos.md).
- **`tags` y `custom_fields` de facturas**: `Etiquetas::TIPO_FACTURA` y
  `CamposPersonalizados::PARA_FACTURAS` ya existen, pero `RecursoFacturas` todavía no los resuelve,
  así que la respuesta no trae ninguna de las dos claves.

**Un defecto del modelo que el módulo corrige.** `Invoices_model::update()` recalcula `total_tax` y
`status` `if ($updated)` (`:900`), y ese flag sale de `affected_rows()` (`:875`) leído **después** de
`save_formatted_number()` (`:874`), que dispara su propio `UPDATE` y devuelve 0 filas. Un `PATCH` que
sólo mueve el descuento dejaba `total` nuevo con `total_tax` viejo. `Escritura/Factura.php` corre las
dos funciones a mano.

## Criterios de aceptación

1. Emitir una factura desde cero, registrar un pago, y que **todos los totales coincidan al centavo**
   con los de Perfex para el mismo documento. Verificado con los cinco casos que sí existen:
   impuesto simple con redondeo por línea, impuesto compuesto, descuento antes del impuesto,
   descuento sobre el total, y ajuste con moneda distinta a la predeterminada.
   *(Reescrito: la versión anterior pedía probar "descuento por línea" y comparar el PDF. El
   descuento por línea no tiene contraparte en Perfex, y el PDF no se construyó.)*
2. Una factura recurrente generada por el cron se ve igual en ambos sistemas. **No verificado**: la
   recurrencia no está expuesta y en producción no hay ni una factura.
3. `grep` de aritmética sobre importes en `src/` no devuelve nada fuera del formateo.
4. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
