'use client'

import { Suspense, useMemo, type ReactElement } from 'react'
import { FiltroEsperandoAlEquipo } from '@/componentes/datos/FiltroEsperandoAlEquipo'
import { ABRIR_TICKET_EN_MODAL, TarjetaDeTicket, claseDeFilaDeTicket, conCeldasDeTickets } from '@/componentes/datos/celdas-tickets'
import { useRefrescoDeTickets } from '@/componentes/datos/useAlCambiarTickets'
import { PanelRecurso } from '@/componentes/proyecto/PanelRecurso'
import { ModalTicket } from '@/componentes/tickets/ModalTicket'
import type { Capacidad } from '@/datos/tipos'
import {
  CATALOGO_PROYECTOS_DE_TICKETS,
  definicionDeTickets,
  opcionesDeProyectoDeTickets
} from '@/definiciones/tickets'
import { TICKET_DEL_PANEL, type ProyectoElegible } from '@/dominio/ticket-vista'
import { nombreDeEspacio } from '@/dominio/tickets-listados'

/**
 * Capacidades del equipo sobre un ticket: las mismas que en la pestaña del Proyecto. La API decide por
 * visibilidad del ticket, no por una capability de `/me`, que no trae un area de tickets.
 */
const TICKETS_DEL_EQUIPO: Capacidad[] = ['edit']

/**
 * La bandeja global de tickets del equipo, con el modal del ticket encima.
 *
 * Es la pestaña Tickets del Proyecto sin el Proyecto: mismas columnas, mismas tarjetas, mismo modal y
 * mismo refresco. Suma la columna y el filtro de Proyecto —con "Sin Proyecto" primero, que es la
 * unica forma de encontrar los que llegaron sin uno— y, para quien administra, departamento y
 * asignado.
 *
 * @param props.esAdmin si quien mira administra; sin eso la API rechaza departamento y asignado
 * @param props.proyectos los Proyectos visibles, para nombrarlos, filtrar y mover un ticket de uno a otro
 */
export function BandejaTickets ({ esAdmin, proyectos }: { esAdmin: boolean, proyectos: ProyectoElegible[] }): ReactElement {
  const revision = useRefrescoDeTickets()

  const nombres = useMemo(() => new Map(proyectos.map((p) => [p.id, p.name])), [proyectos])

  // Memoizada: `PanelRecurso` la usa como dependencia de su carga.
  const definicion = useMemo(
    () => conCeldasDeTickets(definicionDeTickets({ esAdmin }), (id) => nombres.get(id) ?? null),
    [esAdmin, nombres]
  )
  const opcionesExtra = useMemo(
    () => ({ [CATALOGO_PROYECTOS_DE_TICKETS]: opcionesDeProyectoDeTickets(proyectos) }),
    [proyectos]
  )

  return (
    <>
      <PanelRecurso
        definicion={definicion}
        claveFila={(t) => t.id}
        revision={revision}
        board="tickets"
        opcionesExtra={opcionesExtra}
        barra={<FiltroEsperandoAlEquipo />}
        claseFila={claseDeFilaDeTicket}
        tarjeta={(t, catalogos) => (
          <TarjetaDeTicket
            ticket={t}
            catalogos={catalogos}
            proyecto={nombreDeEspacio(t.project_id, (id) => nombres.get(id))}
          />
        )}
        tarjetasEnMovil
        abrirEn={ABRIR_TICKET_EN_MODAL}
      />
      {/* `ModalTicket` lee `useSearchParams`; sin este limite falla el build de la ruta. */}
      <Suspense fallback={null}>
        <ModalTicket
          fuente={TICKET_DEL_PANEL}
          capacidades={TICKETS_DEL_EQUIPO}
          proyectos={proyectos}
        />
      </Suspense>
    </>
  )
}
