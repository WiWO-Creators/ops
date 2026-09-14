import type { Metadata } from 'next'
import { cache } from 'react'
import { BarraProgreso } from '@/componentes/proyecto/CabeceraProyecto'
import { formatearFecha } from '@/lib/fechas'
import { cn } from '@/lib/clases'
import { GLOSARIO } from '@/dominio/glosario'
import type { TareaDeTicketPortal, TicketPortalDetalle } from '@/datos/portal'
import { ErrorApi } from '@/datos/errores'
import { Bloque, cargarDetalle, Datos, EstadoDeError, EstadoDelPortal, Volver } from '../../detalle'
import { Responder } from './Responder'

/**
 * `cache()` evita que `generateMetadata` y la pagina pidan el mismo ticket dos veces en la misma
 * peticion, igual que en el detalle de proyecto.
 */
const cargarTicket = cache(
  async (id: string) => await cargarDetalle<TicketPortalDetalle>(`/portal/tickets/${id}`)
)

export async function generateMetadata (props: PageProps<'/portal/soporte/[id]'>): Promise<Metadata> {
  const { id } = await props.params
  const sobre = await cargarTicket(id)
  const asunto = sobre instanceof ErrorApi ? 'Ticket' : sobre.data.subject

  return { title: `${asunto} · Portal de clientes` }
}

/**
 * Hilo de un ticket de soporte.
 *
 * El cliente lee y contesta acá mismo. Antes era solo lectura y responder obligaba a volver al portal
 * viejo o al correo, con lo que la mitad de la conversacion terminaba fuera de esta pantalla.
 */
export default async function TicketPagina (props: PageProps<'/portal/soporte/[id]'>) {
  const { id } = await props.params
  const sobre = await cargarTicket(id)

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

      {ticket.task !== null && <TrabajoDelTicket tarea={ticket.task} />}

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

      <Bloque titulo="Responder">
        <Responder ticketId={ticket.id} />
      </Bloque>
    </div>
  )
}

/**
 * En que anda el equipo con este ticket.
 *
 * La API manda dos formas distintas y acá se respetan las dos. Cuando la {proceso} es interna llega
 * **sin nombre**: se pinta el avance y nada mas. Ponerle un titulo generico —"Trabajo en curso", el
 * asunto del ticket— seria inventar informacion que el equipo decidio no compartir, y el cliente no
 * tendria como saber que se la inventamos.
 */
function TrabajoDelTicket ({ tarea }: { tarea: TareaDeTicketPortal }) {
  const compartida = 'id' in tarea

  return (
    <Bloque titulo={compartida ? GLOSARIO.proceso.singular : 'Avance'}>
      {compartida && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <p className="text-texto text-sm font-medium">{tarea.name}</p>
          <EstadoDelPortal catalogo="task_statuses" valor={tarea.status} />
        </div>
      )}

      <div className="flex items-center gap-3">
        <BarraProgreso porcentaje={tarea.progress} className="min-w-0 flex-1" />
        <span className="text-texto-tenue text-sm tabular-nums">{Math.round(tarea.progress)}%</span>
      </div>
    </Bloque>
  )
}
