'use client'

import { Suspense, useCallback, useMemo, useState, type ReactElement } from 'react'
import { PanelRecurso } from './PanelRecurso'
import { EnlaceATicket } from '@/componentes/tickets/EnlaceATicket'
import { ModalTicket } from '@/componentes/tickets/ModalTicket'
import { definicionDeTicketsDelProyecto } from '@/definiciones/tickets'
import type { DefinicionRecurso } from '@/definiciones/tipos'
import type { TicketDelProyecto } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { PARAMETRO_TICKET, TICKET_DEL_PANEL } from '@/dominio/ticket-vista'

/**
 * Pestaña Tickets de la ficha del Proyecto: la lista y, encima, el modal del ticket abierto.
 *
 * El modal es el mismo que abre el cliente desde su portal; aca llega con la fuente del equipo y
 * con capacidad de edicion, que es lo que enciende los menus de estado y prioridad. El `revision`
 * vuelve a pedir la lista despues de responder o de cambiar un estado: la tabla se pide desde el
 * navegador y un `router.refresh()` no la alcanza.
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
  const definicion = useMemo((): DefinicionRecurso<TicketDelProyecto> => {
    const base = definicionDeTicketsDelProyecto(proyecto.id)

    return {
      ...base,
      columnas: base.columnas.map((columna) => (
        columna.clave === 'subject'
          ? { ...columna, presentar: (t: TicketDelProyecto) => <EnlaceATicket id={t.id}>{t.subject}</EnlaceATicket> }
          : columna
      ))
    }
  }, [proyecto.id])

  const proyectos = useMemo(() => [{ id: proyecto.id, name: proyecto.name }], [proyecto.id, proyecto.name])
  const alCambiar = useCallback(() => { setRevision((n) => n + 1) }, [])

  return (
    <>
      <PanelRecurso
        definicion={definicion}
        claveFila={(t) => t.id}
        revision={revision}
        abrirEn={{ clave: PARAMETRO_TICKET, valor: (t) => t.id }}
      />
      {/* `ModalTicket` lee `useSearchParams`; sin este limite falla el build de la ruta. */}
      <Suspense fallback={null}>
        <ModalTicket
          fuente={TICKET_DEL_PANEL}
          capacidades={capacidades}
          proyectos={proyectos}
          onCambiado={alCambiar}
        />
      </Suspense>
    </>
  )
}
