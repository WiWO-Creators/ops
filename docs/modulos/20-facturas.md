# Facturas

> `invoices`. El módulo de mayor riesgo del sistema.

## Por qué es el de mayor riesgo

No es el volumen. Es que el dinero no admite aproximaciones: impuestos compuestos, descuentos por
línea y por documento, monedas con distinto redondeo, notas de crédito parciales, facturas recurrentes
y PDFs que el cliente recibe.

`Invoices_model.php` son 70 KB y `invoice_template.php` otros 51 KB. **Esa lógica no se reescribe: se
llama.**

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

Por construir: `GET /invoices`, `/invoices/{id}`, `/invoices/{id}/items`, `/invoices/{id}/payments`,
`POST /invoices`, `PATCH /invoices/{id}`, `POST /invoices/{id}/enviar`, `GET /invoices/{id}/pdf`.

## Campos

Los que muestra la tabla del panel: `number`, `total`, `total_tax`, `YEAR(date)`, `date`, cliente,
espacio asociado, `tags`, `duedate`, `status`.

El detalle además: `prefix`, `number_format`, `datecreated`, `currency` (con `currency_name` y
`symbol`), `subtotal`, `adjustment`, `addedfrom`, `clientnote`, `adminnote`, `discount_percent`,
`discount_total`, `discount_type` (`""`, `before_tax`, `after_tax`), `recurring`, `paymentmethod`,
`sent`, `datesend`, `sale_agent`, e `items`.

Estados: 1 Sin pagar, 2 Pagada, 3 Pago parcial, 4 Vencida, 5 Cancelada, 6 Borrador.

Ítems: `id, rel_id, rel_type, description, long_description, qty, rate, unit, item_order, taxname[]`.

**Todos los importes llegan como número, ya calculados por Perfex.** `taxname` es un array porque un
ítem puede llevar más de un impuesto — de ahí salen los compuestos.

## Acciones y escrituras

Emitir, editar, enviar por correo, registrar pago, cancelar.

Al crear con ítems, Perfex usa un formato de cuerpo particular:

```
newitems[0][description]=Servicio X
newitems[0][rate]=100000
newitems[0][qty]=1
newitems[0][taxname][0]=IVA|19
```

Eso lo traduce el recurso de la API; el frontend manda JSON limpio.

## Permisos

Feature `invoices`, con las cinco capacidades y 28 chequeos en el controlador del panel. Además,
`allow_staff_view_invoices_assigned` amplía la visibilidad a quien figure como `sale_agent`. Hay que
leer el controlador antes de construir el recurso.

## Reglas del panel que hay que replicar

- **Los cálculos son de `Invoices_model.php`.** Impuesto simple, impuesto compuesto, descuento por
  línea, descuento sobre el total, moneda distinta a la predeterminada: los cinco casos se prueban
  contra el panel.
- **El PDF lo genera Perfex.** El frontend lo muestra y lo descarga.
- Las facturas recurrentes las genera el cron. Desde la interfaz se configuran, no se disparan.
- El número de factura sale de `prefix` + `number_format`: no se arma en el frontend.
- Una factura con pagos aplicados no se edita libremente — el panel lo restringe y la API también debe.

Fuente: `application/views/admin/tables/invoices.php` (columnas y joins), `Invoices_model.php` (todos
los cálculos), `invoice_template.php` (el PDF).

## Estado de la API

❌ Por construir, y es el recurso más caro del lote. El andamiaje es el patrón habitual de seis pasos,
pero lo caro es:

- La visibilidad, que combina `addedfrom`, la capacidad `view_own` y la opción `sale_agent`.
- Los campos derivados: totales, saldo pendiente, moneda y símbolo, estado calculado.
- Las escrituras, que deben delegar en `Invoices_model` y no armar el `UPDATE` a mano.

`Recursos/RecursoItems.php` se comparte con Cotizaciones y Propuestas: los tres usan `tblitems_in`
distinguidos por `rel_type`.

## Criterios de aceptación

1. Emitir una factura desde cero, registrar un pago, y que **el PDF y todos los totales coincidan al
   centavo** con los de Perfex para el mismo documento. Verificado con al menos: impuesto simple,
   impuesto compuesto, descuento por línea, descuento sobre el total, y moneda distinta a la
   predeterminada.
2. Una factura recurrente generada por el cron se ve igual en ambos sistemas.
3. `grep` de aritmética sobre importes en `src/` no devuelve nada fuera del formateo.
4. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
