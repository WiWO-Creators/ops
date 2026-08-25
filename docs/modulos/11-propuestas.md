# Propuestas

> `proposals`. Lleva importes: aplica la regla de dinero.

## Qué resuelve

El documento comercial que se envía antes de cerrar, a un prospecto o a un cliente. Tiene su propio
embudo y su propia aceptación con firma.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/propuestas` | Tabla genérica |
| Embudo | `/propuestas/embudo` | Kanban por estado |
| Detalle | `/propuestas/[id]` | Contenido, ítems, totales, aceptación, comentarios |
| PDF | acción | Vista previa y descarga, **generado por Perfex** |

## Endpoints que consume

Por construir: `GET /proposals`, `?vista=embudo`, `/proposals/{id}`, `/proposals/{id}/items`,
`/proposals/{id}/comentarios`, `PATCH /proposals/{id}`, `POST /proposals/{id}/mover`,
`GET /proposals/{id}/pdf`.

## Campos

De `tblproposals`. Los que muestra la tabla del panel: `id`, `subject`, `proposal_to`, `total`,
`date`, `open_till`, `tags`, `datecreated`, `status`.

Los demás que necesita el detalle: `content`, `subtotal`, `total_tax`, `adjustment`,
`discount_percent`, `discount_total`, `discount_type`, `currency`, `address`, `email`, `phone`,
`allow_comments`, `rel_id`, `rel_type` (`lead` o `customer`), `pipeline_order`, el bloque de
aceptación (`acceptance_firstname`, `acceptance_lastname`, `acceptance_email`, `acceptance_date`,
`acceptance_ip`, `signature`), `short_link`, `hash`, e `items`.

Estados: 1 Borrador, 2 Enviada, 3 Abierta, 4 Revisada, 5 Rechazada, 6 Aceptada.

**`rel_type` decide a quién apunta la propuesta:** `lead` o `customer`. El detalle enlaza a
[Prospectos](10-prospectos.md) o a [Clientes](03-clientes.md) según ese campo, y no puede asumir uno.

## Acciones y escrituras

Editar, mover de etapa, enviar, y convertir a factura o a cotización.

**Los totales no se calculan en el frontend.** Ver la regla en [Facturas](20-facturas.md): vale igual
acá.

## Permisos

Feature `proposals`, con las cinco capacidades. Es de los módulos con más chequeos del panel (28
llamadas a `staff_can` en su controlador), así que la ficha de permisos hay que sacarla del controlador
antes de construir el recurso, no de memoria.

## Reglas del panel que hay que replicar

- El PDF lo genera Perfex con TCPDF. El frontend lo **muestra y lo descarga**, no lo arma.
- `pipeline_order` gobierna el orden dentro de la columna del embudo, igual que `kanban_order` en
  Procesos.
- La aceptación con firma escribe IP y fecha. Es un registro legal: no se edita desde la interfaz.
- `short_link` es el enlace público que recibe el cliente.

Fuente: `application/views/admin/tables/proposals.php`,
`application/views/admin/proposals/pipeline/`, `Proposals_model.php`.

## Estado de la API

❌ Por construir. Mismo patrón de seis pasos que [Prospectos](10-prospectos.md), más
`Recursos/RecursoItems.php` compartido con Facturas y Cotizaciones — los tres usan la misma tabla de
ítems (`tblitems_in` con `rel_type`).

## Criterios de aceptación

1. Los totales de una propuesta coinciden **al centavo** con los del panel para el mismo documento.
2. El PDF descargado es byte a byte el que genera Perfex.
3. Una propuesta con `rel_type: "lead"` enlaza al prospecto; una con `"customer"`, al cliente.
4. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
