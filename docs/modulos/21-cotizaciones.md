# Cotizaciones

> `estimates`. Estructura casi idéntica a Facturas, con embudo propio y aceptación con firma.

## Qué resuelve

El presupuesto que se manda antes de facturar. Se acepta, se rechaza o vence, y al aceptarse se
convierte en factura.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/cotizaciones` | Tabla genérica |
| Embudo | `/cotizaciones/embudo` | Kanban por estado |
| Detalle | `/cotizaciones/[id]` | Encabezado, ítems, totales, aceptación |
| PDF | acción | Generado por Perfex |

## Endpoints que consume

Por construir: `GET /estimates`, `?vista=embudo`, `/estimates/{id}`, `/estimates/{id}/items`,
`POST /estimates`, `PATCH /estimates/{id}`, `POST /estimates/{id}/mover`,
`POST /estimates/{id}/convertir-a-factura`, `GET /estimates/{id}/pdf`.

## Campos

Los de la tabla del panel: `number`, `total`, `total_tax`, `YEAR(date)`, cliente, espacio, `tags`,
`date`, `expirydate`, `reference_no`, `status`.

El detalle agrega los mismos bloques que Facturas —`subtotal`, `adjustment`, descuentos, `currency`,
`clientnote`, `adminnote`, `items`— más `pipeline_order`, `is_expiry_notified` y el bloque de
aceptación (`acceptance_firstname`, `acceptance_lastname`, `acceptance_email`, `acceptance_date`,
`acceptance_ip`, `signature`, `short_link`).

Estados: 1 Borrador, 2 Enviada, 3 Rechazada, 4 Aceptada, 5 Expirada.

## Acciones y escrituras

Emitir, editar, enviar, mover de etapa, **convertir a factura**.

La regla de dinero de [Facturas](20-facturas.md) aplica igual: los totales los calcula
`Estimates_model.php`.

## Permisos

Feature `estimates`, con las cinco capacidades y 25 chequeos en el controlador del panel.

## Reglas del panel que hay que replicar

- **Convertir a factura** copia ítems, impuestos y descuentos, y enlaza los dos documentos. Es
  `Estimates_model`, no un `INSERT`.
- `expirydate` vencida pasa la cotización a Expirada por cron, no por la interfaz.
- `is_expiry_notified` es bandera anti-spam del cron: no se edita.
- `pipeline_order` gobierna el orden dentro de la columna del embudo.

Fuente: `application/views/admin/tables/estimates.php`,
`application/views/admin/estimates/pipeline/`, `Estimates_model.php`.

## Estado de la API

❌ Por construir. Reusa `RecursoItems` con Facturas y Propuestas.

## Criterios de aceptación

1. Los totales coinciden al centavo con los del panel, en los mismos cinco casos que Facturas.
2. Convertir a factura produce una factura idéntica a la que produce el panel para la misma
   cotización.
3. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
