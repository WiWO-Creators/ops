'use client'

import { useMemo } from 'react'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import {
  ABRIR_TICKET_EN_MODAL,
  ActividadDeTicket,
  AsuntoDeTicket,
  TarjetaDeSolicitud,
  claseDeFilaDeSolicitud,
  marcaDeSolicitud
} from '@/componentes/datos/celdas-tickets'
import { useRefrescoDeTickets } from '@/componentes/datos/useAlCambiarTickets'
import type { DefinicionRecurso } from '@/definiciones/tipos'
import { PORTAL_TICKETS } from '@/definiciones/portal-soporte'
import type { TicketPortal } from '@/datos/portal'
import type { Referencia } from '@/datos/recursos'
import { nombreDeEspacio, ultimaActividad } from '@/dominio/tickets-listados'
import type { DatosDeTablaDelPortal } from './seccion'

/** La columna de asunto: es el enlace que abre el modal del ticket. */
const CLAVE_ASUNTO = 'subject'

/** La columna de ultima actividad, que se pinta como en la bandeja del equipo. */
const CLAVE_ACTIVIDAD = 'last_reply'

/** La columna Proyecto, que se nombra con los {espacios} del contacto. */
const CLAVE_PROYECTO = 'project'

/**
 * La bandeja de Tickets del portal, del lado del cliente.
 *
 * Existe por la misma restriccion que `componentes/datos/vistas.tsx`: una `DefinicionRecurso` esta
 * llena de funciones, y **una funcion no cruza de un Server Component a uno cliente**. La pagina
 * manda datos serializables; la definicion se resuelve de este lado.
 *
 * El asunto y la fila abren el modal del ticket (`?ticket={id}`) sin salir de la bandeja, la fila con
 * una respuesta sin leer se resalta, en pantallas angostas se ve en tarjetas y la lista se vuelve a
 * pedir con los filtros puestos cuando el modal avisa que el ticket cambio.
 *
 * @param props.espacios los {espacios} del contacto, para nombrar la columna Proyecto; sin ellos queda `#id`
 */
export function TablaSolicitudes ({
  inicial,
  consultaDelInicial,
  opcionesDeFiltro,
  espacios
}: DatosDeTablaDelPortal<TicketPortal> & { espacios?: Referencia[] }) {
  const refresco = useRefrescoDeTickets()

  // Se memoiza porque `TablaRecurso` la usa como dependencia de sus efectos: una definicion nueva en
  // cada render volveria a pedir la pagina en bucle.
  const definicion = useMemo<DefinicionRecurso<TicketPortal>>(() => {
    const nombres = new Map((espacios ?? []).map((espacio) => [espacio.id, espacio.name]))

    return {
      ...PORTAL_TICKETS,
      columnas: PORTAL_TICKETS.columnas.map((columna) => {
        switch (columna.clave) {
          case CLAVE_ASUNTO:
            return {
              ...columna,
              presentar: (fila: TicketPortal) => (
                <AsuntoDeTicket id={fila.id} asunto={String(columna.presentar(fila))} marca={marcaDeSolicitud(fila)} />
              )
            }
          case CLAVE_ACTIVIDAD:
            return { ...columna, presentar: (fila: TicketPortal) => <ActividadDeTicket instante={ultimaActividad(fila)} /> }
          case CLAVE_PROYECTO:
            return { ...columna, presentar: (fila: TicketPortal) => nombreDeEspacio(fila.project_id, (id) => nombres.get(id)) }
          default:
            return columna
        }
      })
    }
  }, [espacios])

  return (
    <TablaRecurso
      definicion={definicion}
      inicial={inicial}
      consultaDelInicial={consultaDelInicial}
      refresco={refresco}
      claveFila={(fila) => fila.id}
      opcionesDeFiltro={opcionesDeFiltro}
      abrirEn={ABRIR_TICKET_EN_MODAL}
      claseFila={claseDeFilaDeSolicitud}
      tarjeta={(fila, catalogos) => <TarjetaDeSolicitud ticket={fila} catalogos={catalogos} />}
      tarjetasEnMovil
    />
  )
}
