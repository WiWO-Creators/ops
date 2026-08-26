import type { Metadata } from 'next'
import { formatearImporte } from '@/componentes/proyecto/formatos'
import { formatearFecha } from '@/lib/fechas'
import type { PropuestaPortalDetalle } from '@/datos/portal'
import { ErrorApi } from '@/datos/errores'
import { Bloque, cargarDetalle, Datos, EstadoDeError, EstadoDelPortal, Volver } from '../../detalle'
import { ContenidoDeDocumento } from '../../ContenidoDeDocumento'

export const metadata: Metadata = { title: 'Propuesta · Portal de clientes' }

export default async function PropuestaPagina (props: PageProps<'/portal/propuestas/[id]'>) {
  const { id } = await props.params
  const sobre = await cargarDetalle<PropuestaPortalDetalle>(`/portal/proposals/${id}`)

  if (sobre instanceof ErrorApi) {
    return <EstadoDeError error={sobre} volverA="/portal/propuestas" etiqueta="Propuestas" />
  }

  const propuesta = sobre.data
  const simbolo = propuesta.currency?.symbol ?? null

  return (
    <div className="flex flex-col gap-4">
      <Volver href="/portal/propuestas">Propuestas</Volver>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-texto text-xl font-semibold">{propuesta.subject}</h1>
        <EstadoDelPortal catalogo="proposal_statuses" valor={propuesta.status} />
      </header>

      <Bloque>
        <Datos
          filas={[
            ['Fecha', formatearFecha(propuesta.date)],
            ['Vigente hasta', formatearFecha(propuesta.open_till)],
            ['Dirigida a', propuesta.proposal_to],
            ['Subtotal', formatearImporte(propuesta.subtotal, simbolo)],
            ['Impuestos', formatearImporte(propuesta.total_tax, simbolo)],
            ['Total', formatearImporte(propuesta.total, simbolo)]
          ]}
        />
      </Bloque>

      {propuesta.items.length > 0 && (
        <Bloque titulo="Detalle">
          <ul className="flex flex-col gap-2 text-sm">
            {propuesta.items.map((linea) => (
              <li key={linea.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-texto">{linea.description}</span>
                <span className="text-texto-tenue tabular-nums">
                  {linea.qty} × {formatearImporte(linea.rate, simbolo)}
                </span>
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      {propuesta.content !== '' && (
        <Bloque titulo="Contenido">
          <ContenidoDeDocumento html={propuesta.content} />
        </Bloque>
      )}
    </div>
  )
}
