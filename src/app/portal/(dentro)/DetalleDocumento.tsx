import { formatearImporte } from '@/componentes/proyecto/formatos'
import { formatearFecha } from '@/lib/fechas'
import type { DocumentoPortalDetalle } from '@/datos/portal'
import { ErrorApi } from '@/datos/errores'
import { Bloque, cargarDetalle, Datos, EstadoDeError, EstadoDelPortal, Volver } from './detalle'

/**
 * Detalle de una factura o de un presupuesto.
 *
 * Son la misma pantalla: mismos datos de cabecera, mismas lineas, y la unica diferencia es que la
 * factura muestra los pagos recibidos. Escribirlas dos veces garantizaria que se separen.
 */
export async function DetalleDocumento ({ id, kind }: { id: string, kind: 'invoice' | 'estimate' }) {
  const esFactura = kind === 'invoice'
  const seccion = esFactura ? 'facturas' : 'presupuestos'
  const etiqueta = esFactura ? 'Facturas' : 'Presupuestos'
  const recurso = esFactura ? 'invoices' : 'estimates'

  const sobre = await cargarDetalle<DocumentoPortalDetalle>(`/portal/${recurso}/${id}`)

  if (sobre instanceof ErrorApi) {
    return <EstadoDeError error={sobre} volverA={`/portal/${seccion}`} etiqueta={etiqueta} />
  }

  const doc = sobre.data
  const simbolo = doc.currency?.symbol ?? null
  const pagado = (doc.payments ?? []).reduce((suma, p) => suma + p.amount, 0)

  return (
    <div className="flex flex-col gap-4">
      <Volver href={`/portal/${seccion}`}>{etiqueta}</Volver>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-texto text-xl font-semibold">{doc.number}</h1>
        <EstadoDelPortal catalogo={esFactura ? 'invoice_statuses' : 'estimate_statuses'} valor={doc.status} />
      </header>

      <Bloque>
        <Datos
          filas={[
            ['Fecha', formatearFecha(doc.date)],
            [esFactura ? 'Vence' : 'Válido hasta', formatearFecha(doc.due_date)],
            ['Subtotal', formatearImporte(doc.subtotal, simbolo)],
            ['Impuestos', formatearImporte(doc.total_tax, simbolo)],
            ['Descuento', doc.discount_total > 0 ? formatearImporte(doc.discount_total, simbolo) : ''],
            ['Total', formatearImporte(doc.total, simbolo)]
          ]}
        />
      </Bloque>

      {doc.items.length > 0 && (
        <Bloque titulo="Detalle">
          {/* La tabla se desplaza dentro de su caja: en un telefono, seis columnas de importes no
              entran y el que tiene que moverse es el bloque, no la pagina. */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-texto-sutil border-linea-suave border-b text-left text-xs tracking-wide uppercase">
                  <th className="pb-2 font-medium">Concepto</th>
                  <th className="pb-2 text-right font-medium">Cantidad</th>
                  <th className="pb-2 text-right font-medium">Precio</th>
                  <th className="pb-2 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody>
                {doc.items.map((linea) => (
                  <tr key={linea.id} className="border-linea-suave border-b last:border-0">
                    <td className="text-texto py-2">
                      {linea.description}
                      {linea.long_description !== '' && (
                        <span className="text-texto-tenue block text-xs">{linea.long_description}</span>
                      )}
                    </td>
                    <td className="text-texto-tenue py-2 text-right tabular-nums">
                      {linea.qty}{linea.unit !== '' ? ` ${linea.unit}` : ''}
                    </td>
                    <td className="text-texto-tenue py-2 text-right tabular-nums">
                      {formatearImporte(linea.rate, simbolo)}
                    </td>
                    <td className="text-texto py-2 text-right tabular-nums">
                      {formatearImporte(linea.qty * linea.rate, simbolo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloque>
      )}

      {esFactura && (doc.payments ?? []).length > 0 && (
        <Bloque titulo="Pagos recibidos">
          <ul className="flex flex-col gap-2">
            {(doc.payments ?? []).map((pago) => (
              <li key={pago.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="text-texto">{formatearImporte(pago.amount, simbolo)}</span>
                <span className="text-texto-tenue">{formatearFecha(pago.date)}</span>
              </li>
            ))}
          </ul>
          <p className="text-texto-tenue border-linea-suave mt-3 border-t pt-3 text-sm">
            Saldo pendiente:{' '}
            <span className="text-texto font-medium">{formatearImporte(doc.total - pagado, simbolo)}</span>
          </p>
        </Bloque>
      )}

      {doc.client_note !== '' && <Bloque titulo="Nota">{doc.client_note}</Bloque>}
      {doc.terms !== '' && <Bloque titulo="Términos">{doc.terms}</Bloque>}
    </div>
  )
}
