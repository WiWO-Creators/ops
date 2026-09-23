import type { ReactElement, ReactNode } from 'react'
import { EnlaceATicket } from '@/componentes/tickets/EnlaceATicket'
import { Insignia } from '@/componentes/presentadores/Insignia'
import type { DefinicionRecurso, OpcionFiltro } from '@/definiciones/tipos'
import type { TicketEspacio } from '@/datos/recursos'
import type { TicketPortal } from '@/datos/portal'
import { nombreDelSolicitante } from '@/definiciones/tickets'
import { GLOSARIO } from '@/dominio/glosario'
import { resolverEstado } from '@/dominio/estados-tarea'
import {
  esperaDelTicket,
  esperaTuRespuesta,
  noLeidoPorElCliente,
  noLeidoPorElEquipo,
  ultimaActividad
} from '@/dominio/tickets-listados'
import { formatearFecha, formatearRelativo } from '@/lib/fechas'
import { cn } from '@/lib/clases'

/**
 * Celdas y tarjetas de los listados de tickets.
 *
 * Las comparten la pestaña Tickets del Proyecto, la bandeja global del equipo y la bandeja de
 * Solicitudes del portal. Viven juntas para que "sin leer" y "esperando" se vean igual en las tres:
 * si una pantalla lo pintara en negrita y otra con una insignia, la persona tendria que aprender dos
 * codigos para lo mismo.
 */

/** Fondo de una fila con algo sin leer. Suave: marca la fila sin competir con las insignias. */
export const CLASE_FILA_SIN_LEER = 'bg-acento-suave/40'

/**
 * El asunto como enlace al modal, con la marca de no leido al lado.
 *
 * La marca es texto ("Sin leer") y no solo color o peso: una fila resaltada por fondo no se lee con
 * un lector de pantalla ni con poca vision de color.
 *
 * @param props.id el ticket
 * @param props.asunto el texto del enlace
 * @param props.marca el texto de la insignia, o `null` si no hay nada que marcar
 */
export function AsuntoDeTicket ({ id, asunto, marca }: { id: number, asunto: string, marca: string | null }): ReactElement {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <EnlaceATicket id={id}>{asunto}</EnlaceATicket>
      {marca !== null && <Insignia tono="acento" tamano="chico">{marca}</Insignia>}
    </span>
  )
}

/**
 * A quien espera el ticket y desde cuando.
 *
 * El lado equipo va en tono de aviso porque es lo que el equipo tiene que mover; el lado cliente va
 * de contorno porque informa y no pide nada.
 *
 * @param props.ticket la fila del listado
 */
export function EsperaDeTicket ({ ticket }: { ticket: TicketEspacio }): ReactElement | null {
  const espera = esperaDelTicket(ticket)

  if (espera === null) return null

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <Insignia tono={espera.lado === 'equipo' ? 'aviso' : 'contorno'} tamano="chico">
        {espera.lado === 'equipo' ? 'Equipo' : 'Cliente'}
      </Insignia>
      {espera.desde !== null && espera.instante !== null && (
        <time dateTime={espera.instante} title={formatearFecha(espera.instante, true)} className="text-texto-tenue text-xs">
          {espera.desde}
        </time>
      )}
    </span>
  )
}

/**
 * Ultima actividad en forma relativa, con la absoluta en el `title`.
 *
 * Al reves que `<Fecha>`: en una bandeja lo que se compara es cuanto hace, no el dia.
 *
 * @param props.instante ISO, o `null` si no hay ninguno
 */
export function ActividadDeTicket ({ instante }: { instante: string | null }): ReactElement {
  if (instante === null) return <span className="text-texto-sutil">Sin actividad</span>

  return (
    <time dateTime={instante} title={formatearFecha(instante, true)} className="text-texto-tenue tabular-nums">
      {formatearRelativo(instante)}
    </time>
  )
}

/**
 * Un valor de catalogo (estado, prioridad) como insignia, igual que la celda de la tabla.
 *
 * @param props.valor el id que manda la API
 * @param props.catalogo las opciones del catalogo, si ya llegaron
 */
export function InsigniaDeCatalogo ({ valor, catalogo }: { valor: number, catalogo: OpcionFiltro[] | undefined }): ReactElement {
  const insignia = resolverEstado(valor, catalogo)

  return (
    <Insignia tono={insignia.desconocido ? 'contorno' : 'neutro'} color={insignia.color} tamano="chico">
      {insignia.etiqueta}
    </Insignia>
  )
}

/**
 * Reemplaza los presentadores de texto de la definicion por los que necesitan un componente.
 *
 * @param base la definicion de `definiciones/tickets`
 * @param nombreDeProyecto como se nombra un Proyecto por su id; ausente = se deja el `#id`
 * @returns la definicion lista para montar
 */
export function conCeldasDeTickets (
  base: DefinicionRecurso<TicketEspacio>,
  nombreDeProyecto?: (id: number) => string | null
): DefinicionRecurso<TicketEspacio> {
  const presentadores: Record<string, (t: TicketEspacio) => ReactNode> = {
    subject: (t) => <AsuntoDeTicket id={t.id} asunto={t.subject} marca={noLeidoPorElEquipo(t) ? 'Sin leer' : null} />,
    esperando: (t) => <EsperaDeTicket ticket={t} />,
    lastreply: (t) => <ActividadDeTicket instante={ultimaActividad(t)} />
  }

  if (nombreDeProyecto !== undefined) {
    presentadores.project = (t) => {
      if (t.project_id === null || t.project_id === undefined) {
        return <span className="text-texto-sutil">Sin {GLOSARIO.espacio.singular.toLowerCase()}</span>
      }

      return nombreDeProyecto(t.project_id) ?? `#${t.project_id}`
    }
  }

  return {
    ...base,
    columnas: base.columnas.map((columna) => {
      const presentar = presentadores[columna.clave]

      return presentar === undefined ? columna : { ...columna, presentar }
    })
  }
}

/** Clase de la fila de un ticket del equipo: resaltada si tiene algo sin leer. */
export function claseDeFilaDeTicket (ticket: TicketEspacio): string | undefined {
  return noLeidoPorElEquipo(ticket) ? CLASE_FILA_SIN_LEER : undefined
}

/** Caja comun de las tarjetas de ticket; la marca de no leido es el filete izquierdo. */
function claseDeTarjeta (sinLeer: boolean): string {
  return cn(
    'border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex w-full flex-col gap-3 border p-4',
    sinLeer && 'border-l-acento border-l-4'
  )
}

/**
 * Un ticket del equipo como tarjeta, para pantallas angostas.
 *
 * Elige los campos que se miran de pie: asunto, estado, a quien espera, quien lo pidio y hace cuanto
 * se movio. Departamento y Tarea quedan para la tabla.
 *
 * @param props.ticket la fila del listado
 * @param props.catalogos los catalogos de la tabla, para nombrar estado y prioridad
 * @param props.proyecto el nombre del Proyecto, solo en la bandeja global
 */
export function TarjetaDeTicket ({
  ticket,
  catalogos,
  proyecto
}: {
  ticket: TicketEspacio
  catalogos?: Record<string, OpcionFiltro[]>
  proyecto?: string
}): ReactElement {
  const sinLeer = noLeidoPorElEquipo(ticket)

  return (
    <article className={claseDeTarjeta(sinLeer)}>
      <header className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 text-base leading-snug text-pretty">
          <AsuntoDeTicket id={ticket.id} asunto={ticket.subject} marca={sinLeer ? 'Sin leer' : null} />
        </h3>
        <span className="text-texto-sutil shrink-0 text-xs tabular-nums">#{ticket.id}</span>
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        <InsigniaDeCatalogo valor={ticket.status} catalogo={catalogos?.ticket_statuses} />
        <InsigniaDeCatalogo valor={ticket.priority} catalogo={catalogos?.ticket_priorities} />
        <EsperaDeTicket ticket={ticket} />
      </div>

      <dl className="text-texto-tenue grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {proyecto !== undefined && (
          <>
            <dt className="text-texto-sutil">{GLOSARIO.espacio.singular}</dt>
            <dd className="min-w-0 truncate">{proyecto}</dd>
          </>
        )}
        <dt className="text-texto-sutil">Solicitante</dt>
        <dd className="min-w-0 truncate">{nombreDelSolicitante(ticket)}</dd>
        <dt className="text-texto-sutil">Asignado</dt>
        <dd className="min-w-0 truncate">{ticket.assigned?.full_name ?? 'Sin asignar'}</dd>
        <dt className="text-texto-sutil">Actividad</dt>
        <dd><ActividadDeTicket instante={ultimaActividad(ticket)} /></dd>
      </dl>
    </article>
  )
}

/**
 * Marca de una solicitud del portal, o `null`.
 *
 * "Esperando tu respuesta" y no "Sin leer": al cliente le importa que le toca a el, y una respuesta
 * nueva del equipo es justamente eso.
 *
 * @param ticket la fila del portal
 * @returns el texto de la insignia
 */
export function marcaDeSolicitud (ticket: TicketPortal): string | null {
  return esperaTuRespuesta(ticket) ? 'Esperando tu respuesta' : null
}

/** Clase de la fila de una solicitud del portal: resaltada si tiene una respuesta sin leer. */
export function claseDeFilaDeSolicitud (ticket: TicketPortal): string | undefined {
  return noLeidoPorElCliente(ticket) ? CLASE_FILA_SIN_LEER : undefined
}

/**
 * Una solicitud del portal como tarjeta, para pantallas angostas.
 *
 * @param props.ticket la fila del portal
 * @param props.catalogos los catalogos del portal, para nombrar estado y prioridad
 */
export function TarjetaDeSolicitud ({
  ticket,
  catalogos
}: {
  ticket: TicketPortal
  catalogos?: Record<string, OpcionFiltro[]>
}): ReactElement {
  return (
    <article className={claseDeTarjeta(noLeidoPorElCliente(ticket))}>
      <h3 className="text-base leading-snug text-pretty">
        <AsuntoDeTicket id={ticket.id} asunto={ticket.subject} marca={marcaDeSolicitud(ticket)} />
      </h3>

      <div className="flex flex-wrap items-center gap-1.5">
        <InsigniaDeCatalogo valor={ticket.status} catalogo={catalogos?.ticket_statuses} />
        <InsigniaDeCatalogo valor={ticket.priority} catalogo={catalogos?.ticket_priorities} />
      </div>

      <p className="text-texto-tenue text-sm">
        Última actividad: <ActividadDeTicket instante={ultimaActividad(ticket)} />
      </p>
    </article>
  )
}
