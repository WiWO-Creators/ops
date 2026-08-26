import type { Metadata } from 'next'
import { formatearFecha } from '@/lib/fechas'
import { cn } from '@/lib/clases'
import type { TicketPortalDetalle } from '@/datos/portal'
import { ErrorApi } from '@/datos/errores'
import { Bloque, cargarDetalle, Datos, EstadoDeError, EstadoDelPortal, Volver } from '../../detalle'

export const metadata: Metadata = { title: 'Ticket · Portal de clientes' }

/**
 * Hilo de un ticket de soporte.
 *
 * Solo lectura: responder es una escritura, y el portal nuevo no expone ninguna. Quien necesite
 * contestar lo sigue haciendo por el portal viejo o por correo.
 */
export default async function TicketPagina (props: PageProps<'/portal/soporte/[id]'>) {
  const { id } = await props.params
  const sobre = await cargarDetalle<TicketPortalDetalle>(`/portal/tickets/${id}`)

  if (sobre instanceof ErrorApi) {
    return <EstadoDeError error={sobre} volverA="/portal/soporte" etiqueta="Soporte" />
  }

  const ticket = sobre.data

  return (
    <div className="flex flex-col gap-4">
      <Volver href="/portal/soporte">Soporte</Volver>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-texto text-xl font-semibold">{ticket.subject}</h1>
        <EstadoDelPortal catalogo="ticket_statuses" valor={ticket.status} />
        <EstadoDelPortal catalogo="ticket_priorities" valor={ticket.priority} />
      </header>

      <Bloque>
        <Datos
          filas={[
            ['Abierto', formatearFecha(ticket.date)],
            ['Última respuesta', formatearFecha(ticket.last_reply)]
          ]}
        />
      </Bloque>

      <Bloque titulo="Consulta">
        <p className="text-texto text-sm whitespace-pre-line">{ticket.message}</p>
      </Bloque>

      {ticket.replies.length > 0 && (
        <Bloque titulo="Respuestas">
          <ol className="flex flex-col gap-4">
            {ticket.replies.map((respuesta) => (
              <li
                key={respuesta.id}
                className={cn(
                  'rounded-chico border p-3',
                  // El origen se distingue por relleno y no solo por el nombre: en un hilo largo,
                  // saber de un vistazo cual mensaje es propio es la mitad de la lectura.
                  respuesta.from === 'equipo'
                    ? 'border-linea bg-superficie'
                    : 'border-linea-suave bg-transparent'
                )}
              >
                <p className="text-texto-tenue mb-1 text-xs">
                  <span className="text-texto font-medium">{respuesta.name}</span>
                  {' · '}
                  {formatearFecha(respuesta.date)}
                </p>
                <p className="text-texto text-sm whitespace-pre-line">{respuesta.message}</p>
              </li>
            ))}
          </ol>
        </Bloque>
      )}
    </div>
  )
}
