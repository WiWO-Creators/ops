# Gastos

> `expenses`. El módulo más simple del grupo Finanzas.

## Qué resuelve

Registrar lo que se gasta, asociarlo a un cliente o a un espacio, y facturarlo cuando corresponde.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/gastos` | Tabla genérica |
| Detalle | `/gastos/[id]` | Datos, adjunto (**sólo lectura**), facturación |
| Registrar | `/gastos/nuevo` | Formulario |

## Endpoints que consume

| Método | Ruta | Estado |
|---|---|---|
| `GET` | `/expenses` · `/expenses/{id}` | ✅ |
| `POST` | `/expenses` | ✅ |
| `PATCH` | `/expenses/{id}` | ✅ |
| `DELETE` | `/expenses/{id}` | ❌ `404` — el borrado no está expuesto |
| — | Subida del comprobante | ❌ no construida |

La forma exacta de la respuesta, la whitelist y los errores están en
[`../contrato-api.md`](../contrato-api.md#expenses--gastos).

## Campos

Los de la tabla del panel: `id`, categoría (`expenses_categories.name`), `amount`, `expense_name`,
`file_name` del adjunto, `date`, espacio asociado, cliente, `invoiceid`, `reference_no`, `paymentmode`.

El detalle agrega: `currency`, `tax`, `tax2`, `tax_total`, `total`, `note`, `billable`,
`create_invoice_billable`, `send_invoice_to_customer`, `added_by`, `dateadded` y el bloque de
recurrencia (`recurring`, `recurring_type`, `repeat_every`, `recurring_from`, `cycles`,
`total_cycles`, `last_recurring_date`).

> **Corrección: `tax` y `tax2` son ids de tasa, no porcentajes ni montos.** Este documento decía
> "son porcentajes". En la columna `tblexpenses.tax` lo guardado es el **id** de una fila de
> `tbltaxes`; el porcentaje vive en `tbltaxes.taxrate`. La API resuelve la asimetría así, y hay que
> leerla dos veces:
>
> | | Qué es |
> |---|---|
> | Al **leer** (`GET`) | el **porcentaje ya resuelto**, o `null` si el gasto no lleva esa tasa |
> | Al **escribir** (`POST`/`PATCH`) | el **id de la tasa**; `0` es "sin impuesto", igual que la opción vacía del `<select>` del panel |
>
> **Las dos tasas se aplican sobre el importe base, no en cascada**
> (`views/admin/tables/expenses.php:127-138`, que guarda el importe en `$tmpTotal` justamente para
> eso):
>
> ```
> total = amount + amount/100 * taxrate(tax) + amount/100 * taxrate(tax2)
> ```
>
> `tax_total` y `total` viajan ya calculados. Devolver `amount` pelado haría que la API y el panel
> mostraran números distintos para el mismo gasto.

Las categorías salen de `tblexpenses_categories`, configurable: van en `lookups` como
`expense_categories`.

## Acciones y escrituras

Registrar, editar y marcar facturable. **Adjuntar comprobante no está construido**, y convertir a
factura tampoco: `invoiceid` es de sólo lectura.

Campos escribibles (`Escritura/Gasto.php:51-64`): `expense_name`, `note`, `category`, `amount`,
`tax`, `tax2`, `currency`, `date`, `reference_no`, `billable`, `clientid`, `project_id`,
`paymentmode`. En el alta, `category`, `amount` y `date` son obligatorios. Todo lo demás es `422`.

Fuera de la whitelist, con motivo: **`invoiceid`** —se escribe cuando el gasto se factura; dejar que
un `PATCH` lo invente marcaría un gasto como facturado sin factura— y **todo el bloque de
recurrencia**, que ejecuta el cron y crea gastos hijos: no es un campo, es un comportamiento.

**`note` se guarda pasada por `nl2br()`**, igual que `Expenses_model::add():79`: el panel guarda el
HTML y lo muestra tal cual, así que guardar saltos crudos dejaría la nota en un solo renglón.

## Permisos

Feature `expenses`, capacidades `view`, `view_own`, `create`, `edit`, `delete`
(`helpers/staff_helper.php:67-70`).

Puerta de área de **dos** ramas —`view` o `view_own`—, y `403` si no pasa ninguna. Sin `view` global,
la regla de fila es `addedfrom = yo`; un gasto de otro responde `404`.

## Reglas del panel que hay que replicar

- `billable` sin `invoiceid` es un gasto pendiente de facturar: es el filtro más usado de la
  pantalla, y es `filter[sin_facturar]=1`. **No es una columna**: es la expresión
  `billable = 1 AND invoiceid IS NULL`, el contador `unbilled` de
  `Expenses_model::get_expenses_total():258-261`. Sólo acepta `0` o `1`; cualquier otro valor es
  `422`. Sin esa validación, `filter[sin_facturar]=si` devolvería en silencio **el conjunto
  contrario**.
- Con `invoiceid` no nulo, el gasto ya está facturado y no se edita libremente.
- El bloque de recurrencia lo maneja el cron. Desde la interfaz se configura, no se dispara.
- El adjunto vive en `tblfiles` con `rel_type = "expense"`. La API lo **lee** en el campo `file`, y
  la **descarga funciona**: `Recursos/Descargas.php:45-90` conoce el tipo `expense`. **La subida no
  se construyó.**
- **Ni `Expenses_model::update()` ni sus fechas se usan para escribir.** `:363-365` hace
  `$data['billable'] = array_key_exists('billable', $data) ? 1 : 0` —semántica de formulario HTML: un
  `PATCH` parcial que no mencione el campo lo pondría en 0— y pasa las fechas por `to_sql_date()`,
  que interpreta según el formato configurado en la instalación. `Escritura/Gasto.php` escribe SQL
  propio con whitelist.

Fuente: `application/views/admin/tables/expenses.php`.

## Estado de la API

✅ **Construido y verificado**, **sin la subida del comprobante**.

`Recursos/RecursoGastos.php` y `Escritura/Gasto.php`.

Verificación: `php index.php api v1 verificacion gastos --prod`. **Esta instalación no tiene ni un
gasto**, así que el comparador siembra siete con rollback: decir "0 diferencias sobre 0 filas" no
verificaría nada. Cubre el criterio 1 de abajo (panel 3 / API 3, coinciden), el total con impuestos
7/7, la regla de fila, el `403` de área y el `422` del filtro inválido.

**No está en `secciones_habilitadas` de `GET /me`**: la API responde, `ops-v2` no ofrece la sección.

**Fuera de alcance, declarado:**

- **La subida del comprobante.** Necesita `upload_helper`, la whitelist de extensiones y un `413`
  propio. **Los criterios 2 y 3 de abajo no se cumplen.** La *lectura* sí funciona.
- **Borrado de gastos** (`DELETE` es `404`), **escritura de `invoiceid`** y **la recurrencia**.
- **`custom_fields` y `tags`**: `CamposPersonalizados::PERMITIDAS` y `Etiquetas` ya declaran los
  gastos, pero `RecursoGastos` todavía no los pide, así que la respuesta no trae ninguna de las dos
  claves.

## Criterios de aceptación

1. El filtro "facturables sin facturar" devuelve el mismo conjunto que el panel. ✅ Verificado con
   `filter[sin_facturar]=1` contra el contador `unbilled`: panel 3 / API 3.
2. Subir un comprobante desde `ops-v2` lo deja en la misma ruta de `uploads/` con la misma validación
   de extensión. **NO se cumple**: la subida no se construyó.
3. Un archivo mayor que `post_max_size` devuelve `413` explícito, no un fallo silencioso. **NO se
   cumple**: sin subida no hay `413` que devolver.
4. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
