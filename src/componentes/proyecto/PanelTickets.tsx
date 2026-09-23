'use client'

import { Suspense, useCallback, useMemo, useState, type ReactElement } from 'react'
import { PanelRecurso } from './PanelRecurso'
import { FiltroEsperandoAlEquipo } from '@/componentes/datos/FiltroEsperandoAlEquipo'
import { TarjetaDeTicket, claseDeFilaDeTicket, conCeldasDeTickets } from '@/componentes/datos/celdas-tickets'
import { useAlCambiarTickets, useAlCerrarTicket } from '@/componentes/datos/useAlCambiarTickets'
import { ModalTicket } from '@/componentes/tickets/ModalTicket'
import { definicionDeTicketsDelProyecto } from '@/definiciones/tickets'
import type { Capacidad } from '@/datos/tipos'
import { PARAMETRO_TICKET, TICKET_DEL_PANEL } from '@/dominio/ticket-vista'

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
  const [revision, setRevision] = useState(0)

  // Memoizada: `PanelRecurso` la usa como dependencia de su carga.
  const definicion = useMemo(() => conCeldasDeTickets(definicionDeTicketsDelProyecto(proyecto.id)), [proyecto.id])

  const proyectos = useMemo(() => [{ id: proyecto.id, name: proyecto.name }], [proyecto.id, proyecto.name])
  const alCambiar = useCallback(() => { setRevision((n) => n + 1) }, [])

  useAlCambiarTickets(alCambiar)
  // Abrir la ficha la marca como leida en la API: al cerrar se vuelve a pedir para quitar la marca.
  useAlCerrarTicket(alCambiar)

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
        abrirEn={{ clave: PARAMETRO_TICKET, valor: (t) => t.id, superficial: true }}
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
