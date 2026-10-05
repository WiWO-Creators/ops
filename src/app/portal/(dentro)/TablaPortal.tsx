'use client'

import Link from 'next/link'
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
import type { DefinicionRecurso, OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import { PORTAL_TICKETS } from '@/definiciones/portal-soporte'
import { PORTAL_PROYECTOS } from '@/definiciones/portal-proyectos'
import type { TicketPortal } from '@/datos/portal'
import type { Referencia } from '@/datos/recursos'
import { GLOSARIO } from '@/dominio/glosario'
import { ultimaActividad } from '@/dominio/tickets-listados'

/**
 * Las tablas del portal, del lado del cliente.
 *
 * Existe por la misma restriccion que `componentes/datos/vistas.tsx`: una `DefinicionRecurso` esta
 * llena de funciones, y **una funcion no cruza de un Server Component a uno cliente**. La pagina
 * manda una clave y datos serializables; la definicion se resuelve de este lado.
 *
 * Las dos comparten componente porque son la misma tabla con otra definicion. Soporte agrega algo
 * mas: el asunto y la fila abren el modal del ticket (`?ticket={id}`) sin salir de la bandeja, la
 * fila con una respuesta sin leer se resalta, en pantallas angostas se ve en tarjetas y la lista se
 * vuelve a pedir con los filtros puestos cuando el modal avisa que el ticket cambio. Proyectos navega
 * a su ficha.
 */

const DEFINICIONES = {
  soporte: PORTAL_TICKETS,
  proyectos: PORTAL_PROYECTOS
} as const

/** La columna de ultima actividad del listado de soporte, que se pinta como en la bandeja del equipo. */
const CLAVE_ACTIVIDAD = 'last_reply'

/** La columna Proyecto del listado de soporte, que se nombra con los {espacios} del contacto. */
const CLAVE_PROYECTO = 'project'

/**
 * El nombre del {espacio} de un ticket, o el texto de la definicion si no se conoce.
 *
 * @param ticket la fila
 * @param nombres nombres de los {espacios} del contacto, por id
 * @returns el nombre, `#id` si no se conoce, o "Sin proyecto"
 */
function nombreDelEspacio (ticket: TicketPortal, nombres: Map<number, string>): string {
  if (ticket.project_id === null) return `Sin ${GLOSARIO.espacio.singular.toLowerCase()}`

  return nombres.get(ticket.project_id) ?? `#${ticket.project_id}`
}

export type SeccionPortalListado = keyof typeof DEFINICIONES

/** Secciones cuyo listado abre un detalle, y por que columna se entra. */
const ENLACES: Partial<Record<SeccionPortalListado, string>> = {
  soporte: 'subject',
  proyectos: 'name'
}

export function TablaPortal<T extends { id: number }> ({
  seccion,
  inicial,
  consultaDelInicial,
  opcionesDeFiltro,
  espacios
}: {
  seccion: SeccionPortalListado
  inicial: ResultadoLista<T>
  /** La consulta con la que el servidor armo `inicial`; ver `TablaRecurso`. */
  consultaDelInicial?: string
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
  /** Los {espacios} del contacto, para nombrar la columna Proyecto de Soporte. Sin ellos queda `#id`. */
  espacios?: Referencia[]
}) {
  const esSoporte = seccion === 'soporte'
  // Solo la bandeja de soporte escucha: un ticket que cambio no mueve la lista de Proyectos.
  const refresco = useRefrescoDeTickets(esSoporte)

  // Se memoiza porque `TablaRecurso` la usa como dependencia de sus efectos: una definicion nueva en
  // cada render volveria a pedir la pagina en bucle.
  const definicion = useMemo(() => {
    const nombres = new Map((espacios ?? []).map((espacio) => [espacio.id, espacio.name]))
    const base = DEFINICIONES[seccion] as unknown as DefinicionRecurso<T>
    const claveEnlace = ENLACES[seccion]

    if (claveEnlace === undefined) return base

    return {
      ...base,
      columnas: base.columnas.map((columna) => (
        columna.clave === claveEnlace
          ? {
              ...columna,
              presentar: (fila: T) => (
                seccion === 'soporte'
                  ? (
                    <AsuntoDeTicket
                      id={fila.id}
                      asunto={String(columna.presentar(fila))}
                      marca={marcaDeSolicitud(fila as unknown as TicketPortal)}
                    />
                    )
                  : (
                    <Link
                      href={`/portal/${seccion}/${fila.id}`}
                      className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
                    >
                      {columna.presentar(fila)}
                    </Link>
                    )
              )
            }
          : esSoporte && columna.clave === CLAVE_ACTIVIDAD
            ? {
                ...columna,
                presentar: (fila: T) => <ActividadDeTicket instante={ultimaActividad(fila as unknown as TicketPortal)} />
              }
            : esSoporte && columna.clave === CLAVE_PROYECTO
              ? { ...columna, presentar: (fila: T) => nombreDelEspacio(fila as unknown as TicketPortal, nombres) }
              : columna
      ))
    }
  }, [seccion, esSoporte, espacios])

  return (
    <TablaRecurso
      definicion={definicion}
      inicial={inicial}
      consultaDelInicial={consultaDelInicial}
      refresco={refresco}
      claveFila={(fila) => fila.id}
      opcionesDeFiltro={opcionesDeFiltro}
      abrirEn={esSoporte ? ABRIR_TICKET_EN_MODAL : undefined}
      claseFila={esSoporte ? (fila) => claseDeFilaDeSolicitud(fila as unknown as TicketPortal) : undefined}
      tarjeta={esSoporte
        ? (fila, catalogos) => <TarjetaDeSolicitud ticket={fila as unknown as TicketPortal} catalogos={catalogos} />
        : undefined}
      tarjetasEnMovil={esSoporte}
    />
  )
}
