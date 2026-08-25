# Gastos

> `expenses`. El módulo más simple del grupo Finanzas.

## Qué resuelve

Registrar lo que se gasta, asociarlo a un cliente o a un espacio, y facturarlo cuando corresponde.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/gastos` | Tabla genérica |
| Detalle | `/gastos/[id]` | Datos, adjunto, facturación |
| Registrar | `/gastos/nuevo` | Formulario |

## Endpoints que consume

Por construir: `GET /expenses`, `/expenses/{id}`, `POST /expenses`, `PATCH /expenses/{id}`.

## Campos

Los de la tabla del panel: `id`, categoría (`expenses_categories.name`), `amount`, `expense_name`,
`file_name` del adjunto, `date`, espacio asociado, cliente, `invoiceid`, `reference_no`, `paymentmode`.

El detalle agrega: `currency`, `tax`, `tax2`, `note`, `billable`, `create_invoice_billable`,
`addedfrom`, `dateadded` y el bloque de recurrencia (`recurring`, `recurring_type`, `repeat_every`,
`cycles`, `total_cycles`, `custom_recurring`, `last_recurring_date`).

Las categorías salen de `tblexpenses_categories`, configurable: van en `lookups` como
`expense_categories`.

## Acciones y escrituras

Registrar, editar, adjuntar comprobante, marcar facturable, convertir a factura.

## Permisos

Feature `expenses`, capacidades `view`, `view_own`, `create`, `edit`, `delete`.

## Reglas del panel que hay que replicar

- `billable` sin `invoiceid` es un gasto pendiente de facturar: es el filtro más usado de la pantalla.
- Con `invoiceid` no nulo, el gasto ya está facturado y no se edita libremente.
- El bloque de recurrencia lo maneja el cron. Desde la interfaz se configura, no se dispara.
- El adjunto entra por `tblfiles` con `rel_type="expense"`. La subida usa
  `application/helpers/upload_helper.php`, llamado tal cual — incluida su validación de extensiones.

Fuente: `application/views/admin/tables/expenses.php`.

## Estado de la API

❌ Por construir. Recurso barato: sin embudo, sin ítems, sin PDF. Los `tax` y `tax2` son porcentajes,
no montos: el total facturable lo calcula Perfex.

## Criterios de aceptación

1. El filtro "facturables sin facturar" devuelve el mismo conjunto que el panel.
2. Subir un comprobante desde `ops-v2` lo deja en la misma ruta de `uploads/` con la misma validación
   de extensión.
3. Un archivo mayor que `post_max_size` devuelve `413` explícito, no un fallo silencioso.
4. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
