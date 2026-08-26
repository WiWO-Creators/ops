# Pagos

> `invoicepaymentrecords`. No tiene vida propia: siempre cuelga de una factura.

## Qué resuelve

Registrar y consultar los pagos aplicados a las facturas.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/pagos` | Tabla genérica |
| Registrar | superposición desde la factura | Monto, modo, fecha, transacción, nota |
| En la factura | `/facturas/[id]` | Pagos aplicados y saldo |

## Endpoints que consume

| Método | Ruta | Estado |
|---|---|---|
| `GET` | `/payments` · `/payments/{id}` | ✅ |
| `GET` | `/invoices/{id}/payments` | ✅ array plano, con la visibilidad **de la factura** |
| `POST` | `/payments` | ✅ |
| `DELETE` | `/payments/{id}` | ✅ |
| `PATCH` | `/payments/{id}` | ❌ `404` — a propósito, ver *Estado de la API* |

La forma exacta de la respuesta está en
[`../contrato-api.md`](../contrato-api.md#payments--pagos).

## Campos

Los que muestra la tabla del panel: `id`, `invoice` (`{id, number, status}`), `payment_mode`
(`{id, name}`), `transactionid`, `client`, `amount`, `currency`, `date`.

El detalle agrega `daterecorded`, `note` y `paymentmethod`. Lista y ficha devuelven **la misma forma**.

> **`payment_mode.id` es una cadena, no un número.** `tblinvoicepaymentrecords.paymentmode` es
> `varchar(40)`: en un pago manual guarda el id de `tblpayment_modes` y en uno por pasarela el
> identificador del gateway (`"stripe"`). Castearlo a entero convierte `stripe` en `0`. Cuando el modo
> no está en `tblpayment_modes`, la API devuelve `{id: "stripe", name: "stripe"}` en vez de `null`.

Los modos de pago salen de `tblpayment_modes`, configurable: van en `lookups` como `payment_modes`,
con sus banderas `invoices_only`, `expenses_only`, `active` y `selected_by_default` — el selector del
formulario las necesita para no ofrecer un modo que no corresponde.

## Acciones y escrituras

Registrar un pago (`create` sobre `payments`) y eliminarlo (`delete` sobre `payments`).

`POST /payments` acepta `invoiceid`, `amount`, `paymentmode`, `date`, `transactionid` y `note`
(`Escritura/Pago.php:47`). Cualquier otra clave es `422`. La factura tiene que ser **visible**: si no,
`404` — y no `403`, que confirmaría que existe.

Sólo se aceptan modos de pago **manuales, activos y no `expenses_only`**, que es lo que filtra el
formulario del panel (`admin/Invoices.php:520`).

**Aplicar un pago cambia el estado de la factura** (Sin pagar → Pago parcial → Pagada). Ese cálculo es
de Perfex: tras registrar, se refresca la factura y se lee su `status`, no se infiere en el frontend.

## Permisos

> **Corrección: la feature `payments` sí declara `create`.** Este documento decía "capacidades
> `view`, `view_own`, `delete`". `helpers/staff_helper.php:83-89` la declara con
> `$withNotApplicableViewOwn`, o sea `view_own` —marcada "no aplica"— más `view`, `create`, `edit` y
> `delete`. El panel usa `create` en los dos caminos de alta (`admin/Invoices.php:531` y
> `admin/Payments.php:32`), y **es el permiso que exige el `POST`**.

La visibilidad es indirecta: sin `view` sobre `payments`, un staff ve solo los pagos de facturas que
él creó **y** sobre las que tiene `view_own` de `invoices`; y si
`allow_staff_view_invoices_assigned` está activo, también los de las facturas donde figura como
`sale_agent`. Está en `application/views/admin/tables/payments.php:29`.

**La compuerta de área mira `view_own` sobre `invoices`, no sobre `payments`**, y son tres ramas:
`view payments` **o** `view_own invoices` **o** `allow_staff_view_invoices_assigned = 1`
(`admin/Payments.php:53`). Sin ninguna, `403`.

**Divergencia deliberada:** `admin/Payments.php:77-83` protege la ficha de un pago **sólo** con la
compuerta de área, así que en el panel cualquiera con `view_own invoices` abre el pago de otro
cambiando el número en la barra de direcciones. Acá eso es `404`. Replicar un agujero de acceso no es
replicar el panel, es abrirlo en un segundo lugar.

## Reglas del panel que hay que replicar

- Un pago no existe sin factura: no hay creación suelta.
- El monto es dinero: no se opera en JavaScript.
- El estado de la factura después del pago lo decide Perfex: `Payments_model::add()` llama a
  `update_invoice_status()`. Tras el `POST`, se relee la factura; el frontend no infiere el estado.
- **`Payments_model::add()` dispara dos efectos más que la API apaga**: el correo al cliente —se pasa
  siempre `do_not_send_email_template => true` (`:190`)— y **un TCPDF incondicional** (`:249-251`), que
  se arma *antes* de mirar ese flag. Lo cubre `Nucleo\EfectosExternos::apagarPdfDePago()`, que cambia
  la clase del PDF por un doble que no dibuja nada.
- **`total_left_to_pay` no es `total - payments_total`.** El saldo sale de
  `get_invoice_total_left_to_pay()` (`invoices_helper.php:49-88`), que descuenta pagos **y créditos
  aplicados** con los decimales de la instalación; `payments_total` es la suma cruda de
  `tblinvoicepaymentrecords`, el renglón "Pagos" que dibuja el panel.

## Estado de la API

✅ **Construido y verificado**, junto con [Facturas](20-facturas.md).

`Recursos/RecursoPagos.php` y `Escritura/Pago.php`. Verificación: `php index.php api v1 verificacion
dinero`, **0 diferencias**, con 30 pagos sembrados y revertidos y el kill-switch del PDF comprobado
por reflexión —se registra un pago de verdad y después se pregunta de qué archivo salió la clase
`Payment_pdf` que quedó cargada—.

**No está en `secciones_habilitadas` de `GET /me`**: la API responde, `ops-v2` no ofrece la sección.

**No hay `PATCH /payments/{id}`, y es deliberado.** `Payments_model::update()` sólo mueve la nota y el
modo; corregir un cobro asentado se hace **borrando y volviendo a cargar**, que es lo que ofrece el
panel.

**Los pagos dentro de la ficha de una factura no pasan por `RecursoPagos`.** Ahí manda la visibilidad
**de la factura**: usar la de `payments` escondería pagos de una factura que la persona sí puede ver,
que no es lo que hace el preview del panel.

## Criterios de aceptación

1. Registrar un pago parcial deja la factura en Pago parcial con el mismo saldo que el panel. ✅
   Verificado por HTTP con el ciclo 3 → 2 → (borrar pago) → 3.
2. Registrar el saldo restante la deja en Pagada. ✅
3. Un staff sin `view` sobre pagos ve exactamente el mismo conjunto que ve en el panel. ✅ 20+20
   comparaciones conjunto contra conjunto en las dos ramas de `allow_staff_view_invoices_assigned`,
   con 4 perfiles.
4. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
