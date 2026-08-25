# Contratos

> `contracts`. El módulo más simple del grupo Comercial.

## Qué resuelve

El documento firmado con un cliente: vigencia, valor, tipo y firma.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/contratos` | Tabla genérica |
| Detalle | `/contratos/[id]` | Contenido, vigencia, firma, adjuntos, comentarios |

## Endpoints que consume

Por construir: `GET /contracts`, `/contracts/{id}`, `/contracts/{id}/comentarios`,
`/contracts/{id}/archivos`, `PATCH /contracts/{id}`.

## Campos

Los que muestra la tabla del panel: `id`, `subject`, cliente, tipo de contrato (`contracts_types.name`),
`contract_value`, `datestart`, `dateend`, espacio asociado (`projects.name`), `signature`.

El detalle además necesita: `content`, `description`, `contract_type`, `project_id`, `addedfrom`,
`dateadded`, `isexpirynotified`, `not_visible_to_client`, `hash`, `signed`, `marked_as_signed`, el
bloque de aceptación y `short_link`.

`contract_value` **es dinero**: número, y no se opera en JavaScript.

Los tipos de contrato salen de `tblcontracts_types`, configurable: van en `lookups` como
`contract_types`.

## Acciones y escrituras

Editar, marcar como firmado, subir adjuntos. La firma real del cliente llega por el enlace público de
Perfex y no se toca desde acá.

## Permisos

Feature `contracts`, con las cinco capacidades.

## Reglas del panel que hay que replicar

- `signed` y `marked_as_signed` son distintos: el primero es firma real del cliente con su IP y fecha;
  el segundo es que alguien del equipo lo marcó a mano. La interfaz tiene que distinguirlos, porque
  significan cosas distintas ante un conflicto.
- `not_visible_to_client` esconde el contrato del portal.
- `isexpirynotified` es una bandera anti-spam del cron: no se edita.

Fuente: `application/views/admin/tables/contracts.php`.

## Estado de la API

❌ Por construir. Es el recurso más barato del lote: sin embudo, sin ítems, sin cálculos.

## Criterios de aceptación

1. Un contrato firmado por el cliente y uno marcado a mano se ven distinto en la lista.
2. Los contratos vencidos se distinguen de los vigentes por `dateend`, calculado con la fecha local.
3. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
