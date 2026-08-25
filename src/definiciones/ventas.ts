import type { DefinicionRecurso } from './tipos.ts'
import type { DocumentoVenta, GastoEspacio } from '../datos/recursos.ts'
import { formatearFecha } from '../lib/fechas.ts'
import { formatearImporte } from '../componentes/proyecto/formatos.ts'

/**
 * Definiciones de la pestaña Ventas: gastos, facturas y presupuestos del Proyecto.
 *
 * Las tres viven en un archivo porque son la misma pestaña con un selector, y separarlas dejaria tres
 * modulos de treinta lineas que siempre se editan juntos.
 *
 * Fuente: `CONTRATO-NUEVO.md` seccion 2.
 */

/**
 * Gastos.
 *
 * `total` **incluye impuestos** (`amount + amount*tax1% + amount*tax2%`): lo calcula el backend, y
 * recalcularlo aca duplicaria una regla de negocio que ya existe del otro lado.
 */
export const GASTOS: DefinicionRecurso<GastoEspacio> = {
  ruta: 'expenses',
  titulo: { singular: 'Gasto', plural: 'Gastos' },

  columnas: [
    { clave: 'id', encabezado: '#', numerica: true, presentar: (g) => String(g.id) },
    { clave: 'category', encabezado: 'Categoría', presentar: (g) => g.category?.name ?? '' },
    { clave: 'expense_name', encabezado: 'Nombre del gasto', presentar: (g) => g.expense_name ?? '' },
    { clave: 'total', encabezado: 'Importe', numerica: true, presentar: (g) => formatearImporte(g.total, g.currency?.symbol ?? null) },
    { clave: 'date', encabezado: 'Fecha', ordenPor: 'date', presentar: (g) => formatearFecha(g.date) },
    { clave: 'invoice', encabezado: 'Factura', presentar: (g) => estadoDeFactura(g) },
    { clave: 'reference_no', encabezado: 'N° de referencia', ocultaPorDefecto: true, presentar: (g) => g.reference_no ?? '' },
    { clave: 'payment_mode', encabezado: 'Modo de pago', ocultaPorDefecto: true, presentar: (g) => g.payment_mode?.name ?? '' }
  ],

  filtros: [
    { clave: 'category', etiqueta: 'Categoría', tipo: 'seleccion', desdeLookup: 'expense_categories' },
    { clave: 'billable', etiqueta: 'Facturable', tipo: 'booleano' },
    { clave: 'fecha', etiqueta: 'Fecha', tipo: 'rangoFechas', clavesRango: ['date_from', 'date_to'] }
  ],

  ordenables: ['date'],
  ordenPorDefecto: '-date',
  busqueda: true,
  includes: []
}

/**
 * Estado de facturacion de un gasto, con las mismas tres leyendas del panel.
 *
 * @param gasto la fila
 * @returns "No facturado" si es facturable y no tiene factura, "Facturado" si la factura esta pagada
 *          (estado 2), el numero de la factura si existe pero no esta pagada, o vacio si no es
 *          facturable
 */
function estadoDeFactura (gasto: GastoEspacio): string {
  if (!gasto.billable) return ''
  if (gasto.invoice === null) return 'No facturado'

  return gasto.invoice.status === 2 ? 'Facturado' : gasto.invoice.number
}

/** Facturas del proyecto. Solo lectura. */
export const FACTURAS: DefinicionRecurso<DocumentoVenta> = {
  ruta: 'invoices',
  titulo: { singular: 'Factura', plural: 'Facturas' },

  columnas: [
    { clave: 'number', encabezado: 'Número', ordenPor: 'number', presentar: (d) => d.number },
    { clave: 'date', encabezado: 'Fecha', ordenPor: 'date', presentar: (d) => formatearFecha(d.date) },
    { clave: 'duedate', encabezado: 'Vence', ordenPor: 'duedate', presentar: (d) => formatearFecha(d.duedate) },
    { clave: 'status', encabezado: 'Estado', comoInsignia: 'invoice_statuses', presentar: (d) => d.status },
    { clave: 'total', encabezado: 'Total', ordenPor: 'total', numerica: true, presentar: (d) => formatearImporte(d.total, d.currency?.symbol ?? null) }
  ],

  filtros: [
    { clave: 'status', etiqueta: 'Estado', tipo: 'multiple', desdeLookup: 'invoice_statuses' }
  ],

  ordenables: ['number', 'date', 'duedate', 'total'],
  ordenPorDefecto: '-date',
  busqueda: true,
  includes: []
}

/** Presupuestos del proyecto. Misma forma que las facturas, otro catalogo de estados. */
export const PRESUPUESTOS: DefinicionRecurso<DocumentoVenta> = {
  ruta: 'estimates',
  titulo: { singular: 'Presupuesto', plural: 'Presupuestos' },

  columnas: [
    { clave: 'number', encabezado: 'Número', ordenPor: 'number', presentar: (d) => d.number },
    { clave: 'date', encabezado: 'Fecha', ordenPor: 'date', presentar: (d) => formatearFecha(d.date) },
    { clave: 'duedate', encabezado: 'Vence', ordenPor: 'duedate', presentar: (d) => formatearFecha(d.duedate) },
    { clave: 'status', encabezado: 'Estado', comoInsignia: 'estimate_statuses', presentar: (d) => d.status },
    { clave: 'total', encabezado: 'Total', ordenPor: 'total', numerica: true, presentar: (d) => formatearImporte(d.total, d.currency?.symbol ?? null) }
  ],

  filtros: [
    { clave: 'status', etiqueta: 'Estado', tipo: 'multiple', desdeLookup: 'estimate_statuses' }
  ],

  ordenables: ['number', 'date', 'duedate', 'total'],
  ordenPorDefecto: '-date',
  busqueda: true,
  includes: []
}
