'use client'

import Link from 'next/link'
import { useState, type ReactElement, type ReactNode } from 'react'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { BarraProgreso } from '@/componentes/proyecto/CabeceraProyecto'
import { GLOSARIO } from '@/dominio/glosario'
import { proyectosElegibles, rutaDeTicket, type FuenteDeTicket, type ProyectoElegible, type TicketVista } from '@/dominio/ticket-vista'
import { MenuAsignadoTicket } from './MenuAsignadoTicket'
import { MenuProyectoTicket } from './MenuProyectoTicket'

/** Proyecto, Tarea vinculada, quien lo abrio, a quien esta asignado y las dos fechas. */
export function DatosDelTicket ({
  ticket,
  fuente,
  proyectos,
  rutaEditar,
  puedeEditar,
  onCambiado
}: {
  ticket: TicketVista
  fuente: FuenteDeTicket
  proyectos: ProyectoElegible[]
  rutaEditar: string
  puedeEditar: boolean
  onCambiado: () => void
}): ReactElement {
  // El Proyecto que se pinta: el de la ficha, salvo mientras un cambio optimista espera a la API. Se
  // realinea cuando la ficha recargada trae otro, como `MenuAsignadoTicket`.
  const [proyectoPintado, setProyectoPintado] = useState(ticket.proyectoId)
  const [ultimoDeLaApi, setUltimoDeLaApi] = useState(ticket.proyectoId)

  if (ultimoDeLaApi !== ticket.proyectoId) {
    setUltimoDeLaApi(ticket.proyectoId)
    setProyectoPintado(ticket.proyectoId)
  }

  const proyectoId = proyectoPintado
  const elegibles = puedeEditar ? proyectosElegibles(proyectos, { proyectoId, clienteId: ticket.clienteId }) : []
  const nombreProyecto = proyectoId === null
    ? null
    : (proyectos.find((p) => p.id === proyectoId)?.name ?? `${GLOSARIO.espacio.singular} #${proyectoId}`)

  return (
    <dl className="border-linea-suave grid gap-x-6 gap-y-3 border-t pt-3 sm:grid-cols-2">
      <Dato etiqueta={GLOSARIO.espacio.singular}>
        <span className="flex items-center gap-1">
          {proyectoId === null || nombreProyecto === null
            ? <span className="text-texto-sutil">Sin {GLOSARIO.espacio.singular.toLowerCase()}</span>
            : <Enlace href={rutaDeTicket(fuente.paginaProyecto, proyectoId)}>{nombreProyecto}</Enlace>}
          {elegibles.length > 0 && (
            <MenuProyectoTicket
              actual={proyectoId}
              opciones={elegibles}
              rutaEditar={rutaEditar}
              onElegido={setProyectoPintado}
              onCambiado={onCambiado}
            />
          )}
        </span>
      </Dato>

      <Dato etiqueta={`${GLOSARIO.proceso.singular} vinculada`}>
        <TareaVinculada ticket={ticket} fuente={fuente} />
      </Dato>

      {ticket.solicitante !== null && <Dato etiqueta="Solicitante">{ticket.solicitante}</Dato>}

      {ticket.asignacion !== null && (
        <Dato etiqueta="Asignado">
          <MenuAsignadoTicket
            asignado={ticket.asignacion.asignado}
            rutaEditar={rutaEditar}
            puedeEditar={puedeEditar}
            onCambiado={onCambiado}
          />
        </Dato>
      )}

      <Dato etiqueta="Abierto"><Fecha valor={ticket.abierto} conHora /></Dato>

      <Dato etiqueta="Última respuesta"><Fecha valor={ticket.ultimaRespuesta} conHora /></Dato>
    </dl>
  )
}

/**
 * La Tarea que atiende el ticket.
 *
 * Una tarea interna llega al cliente **sin nombre**: se pinta el avance y nada mas. Inventarle un
 * titulo seria filtrar el tablero interno con palabras nuestras.
 */
function TareaVinculada ({ ticket, fuente }: { ticket: TicketVista, fuente: FuenteDeTicket }): ReactElement {
  const { tarea, proyectoId } = ticket

  if (tarea === null) {
    return <span className="text-texto-sutil">Sin {GLOSARIO.proceso.singular.toLowerCase()} todavía</span>
  }

  const nombre = tarea.nombre ?? 'En curso'
  const titulo = tarea.id !== null && proyectoId !== null
    ? <Enlace href={rutaDeTicket(fuente.paginaTarea, tarea.id, proyectoId)}>{nombre}</Enlace>
    : <span>{nombre}</span>

  return (
    <span className="flex flex-col gap-1.5">
      {titulo}
      {tarea.progreso !== null && (
        <span className="flex items-center gap-2">
          <BarraProgreso porcentaje={tarea.progreso} className="min-w-0 flex-1" />
          <span className="text-texto-tenue text-xs tabular-nums">{Math.round(tarea.progreso)}%</span>
        </span>
      )}
    </span>
  )
}

/** Un par etiqueta/valor, como el `Dato` de la ficha de una Tarea. */
function Dato ({ etiqueta, children }: { etiqueta: string, children: ReactNode }): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-texto-sutil text-xs font-medium tracking-[0.08em] uppercase">{etiqueta}</dt>
      <dd className="text-texto min-w-0 text-sm">{children}</dd>
    </div>
  )
}

function Enlace ({ href, children }: { href: string, children: ReactNode }): ReactElement {
  return (
    <Link href={href} className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline">
      {children}
    </Link>
  )
}
