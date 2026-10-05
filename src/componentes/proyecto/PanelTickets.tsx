'use client'

import { Suspense, useMemo, type ReactElement } from 'react'
import { PanelRecurso } from './PanelRecurso'
import { FiltroEsperandoAlEquipo } from '@/componentes/datos/FiltroEsperandoAlEquipo'
import { ABRIR_TICKET_EN_MODAL, TarjetaDeTicket, claseDeFilaDeTicket, conCeldasDeTickets } from '@/componentes/datos/celdas-tickets'
import { useRefrescoDeTickets } from '@/componentes/datos/useAlCambiarTickets'
import { ModalTicket } from '@/componentes/tickets/ModalTicket'
import { definicionDeTicketsDelProyecto } from '@/definiciones/tickets'
import type { Capacidad } from '@/datos/tipos'
import { TICKET_DEL_PANEL } from '@/dominio/ticket-vista'

/**
 * Pestaña Tickets de la ficha del Proyecto: la lista y, encima, el modal del ticket abierto.
 *
 * El modal es el mismo que abre el cliente desde su portal; aca llega con la fuente del equipo y
 * con capacidad de edicion, que es lo que enciende los menus de estado y prioridad.
 *
 * La lista se vuelve a pedir **con los filtros, el orden y la pagina puestos** cuando el modal
 * escribe, por el aviso de ventana `ops:tickets-cambiados`, que es el mismo que mueve el contador de
 * la pestaña.
 */
export function PanelTickets ({
  proyecto,
  capacidades
}: {
  proyecto: { id: number, name: string }
  capacidades: Capacidad[]
}): ReactElement {
  const revision = useRefrescoDeTickets()

  // Memoizada: `PanelRecurso` la usa como dependencia de su carga.
  const definicion = useMemo(() => conCeldasDeTickets(definicionDeTicketsDelProyecto(proyecto.id)), [proyecto.id])

  const proyectos = useMemo(() => [{ id: proyecto.id, name: proyecto.name }], [proyecto.id, proyecto.name])

  return (
    <>
      <PanelRecurso
        definicion={definicion}
        claveFila={(t) => t.id}
        revision={revision}
        barra={<FiltroEsperandoAlEquipo />}
        claseFila={claseDeFilaDeTicket}
        tarjeta={(t, catalogos) => <TarjetaDeTicket ticket={t} catalogos={catalogos} />}
        tarjetasEnMovil
        abrirEn={ABRIR_TICKET_EN_MODAL}
      />
      {/* `ModalTicket` lee `useSearchParams`; sin este limite falla el build de la ruta. */}
      <Suspense fallback={null}>
        <ModalTicket
          fuente={TICKET_DEL_PANEL}
          capacidades={capacidades}
          proyectos={proyectos}
        />
      </Suspense>
    </>
  )
}
