'use client'

import { Suspense, useCallback, useMemo, useState, type ReactElement } from 'react'
import { FiltroEsperandoAlEquipo } from '@/componentes/datos/FiltroEsperandoAlEquipo'
import { TarjetaDeTicket, claseDeFilaDeTicket, conCeldasDeTickets } from '@/componentes/datos/celdas-tickets'
import { useAlCambiarTickets, useAlCerrarTicket } from '@/componentes/datos/useAlCambiarTickets'
import { PanelRecurso } from '@/componentes/proyecto/PanelRecurso'
import { ModalTicket } from '@/componentes/tickets/ModalTicket'
import type { Referencia } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import {
  CATALOGO_PROYECTOS_DE_TICKETS,
  definicionDeTickets,
  opcionesDeProyectoDeTickets
} from '@/definiciones/tickets'
import { GLOSARIO } from '@/dominio/glosario'
import { PARAMETRO_TICKET, TICKET_DEL_PANEL } from '@/dominio/ticket-vista'

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
 * @param props.proyectos los Proyectos visibles, para nombrarlos y filtrar
 */
export function BandejaTickets ({ esAdmin, proyectos }: { esAdmin: boolean, proyectos: Referencia[] }): ReactElement {
  const [revision, setRevision] = useState(0)

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
        board="tickets"
        opcionesExtra={opcionesExtra}
        barra={<FiltroEsperandoAlEquipo />}
        claseFila={claseDeFilaDeTicket}
        tarjeta={(t, catalogos) => (
          <TarjetaDeTicket
            ticket={t}
            catalogos={catalogos}
            proyecto={t.project_id === null || t.project_id === undefined
              ? `Sin ${GLOSARIO.espacio.singular.toLowerCase()}`
              : nombres.get(t.project_id) ?? `#${t.project_id}`}
          />
        )}
        tarjetasEnMovil
        abrirEn={{ clave: PARAMETRO_TICKET, valor: (t) => t.id }}
      />
      {/* `ModalTicket` lee `useSearchParams`; sin este limite falla el build de la ruta. */}
      <Suspense fallback={null}>
        <ModalTicket
          fuente={TICKET_DEL_PANEL}
          capacidades={TICKETS_DEL_EQUIPO}
          proyectos={proyectos}
          onCambiado={alCambiar}
        />
      </Suspense>
    </>
  )
}
