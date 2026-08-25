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

Por construir: `GET /payments`, `/payments/{id}`, `/invoices/{id}/payments`, `POST /payments`.

## Campos

Los que muestra la tabla del panel: `id`, `invoiceid`, `paymentmode` (con el nombre por join),
`transactionid`, cliente, `amount`, `date`.

El detalle agrega `daterecorded`, `note` y `paymentmethod`.

Los modos de pago salen de `tblpayment_modes`, configurable: van en `lookups` como `payment_modes`,
con sus banderas `invoices_only`, `expenses_only`, `active` y `selected_by_default` — el selector del
formulario las necesita para no ofrecer un modo que no corresponde.

## Acciones y escrituras

Registrar un pago. Eliminarlo requiere el permiso `delete` sobre `payments`.

**Aplicar un pago cambia el estado de la factura** (Sin pagar → Pago parcial → Pagada). Ese cálculo es
de Perfex: tras registrar, se refresca la factura y se lee su `status`, no se infiere en el frontend.

## Permisos

Feature `payments`, capacidades `view`, `view_own`, `delete`.

La visibilidad es indirecta y vale la pena leerla completa antes de construir el recurso: sin `view`
sobre `payments`, un staff ve solo los pagos de facturas que él creó **y** sobre las que tiene
`view_own` de `invoices`; y si `allow_staff_view_invoices_assigned` está activo, también los de las
facturas donde figura como `sale_agent`. Está en
`application/views/admin/tables/payments.php`, en el bloque `if (staff_cant('view', 'payments'))`.

## Reglas del panel que hay que replicar

- Un pago no existe sin factura: no hay creación suelta.
- El monto es dinero: no se opera en JavaScript.
- El estado de la factura después del pago lo decide Perfex.

## Estado de la API

❌ Por construir. Recurso chico, pero su visibilidad depende de la de Facturas — conviene construirlo
**después** de `invoices` y reusar ese fragmento de visibilidad en vez de duplicarlo.

## Criterios de aceptación

1. Registrar un pago parcial deja la factura en Pago parcial con el mismo saldo que el panel.
2. Registrar el saldo restante la deja en Pagada.
3. Un staff sin `view` sobre pagos ve exactamente el mismo conjunto que ve en el panel.
4. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
