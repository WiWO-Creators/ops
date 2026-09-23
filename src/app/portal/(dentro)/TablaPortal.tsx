'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import {
  AsuntoDeTicket,
  TarjetaDeSolicitud,
  claseDeFilaDeSolicitud,
  marcaDeSolicitud
} from '@/componentes/datos/celdas-tickets'
import { useAlCambiarTickets, useAlCerrarTicket } from '@/componentes/datos/useAlCambiarTickets'
import type { DefinicionRecurso, OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import { PORTAL_TICKETS } from '@/definiciones/portal-soporte'
import { PORTAL_PROYECTOS } from '@/definiciones/portal-proyectos'
import type { TicketPortal } from '@/datos/portal'
import { PARAMETRO_TICKET } from '@/dominio/ticket-vista'

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
  opcionesDeFiltro
}: {
  seccion: SeccionPortalListado
  inicial: ResultadoLista<T>
  /** La consulta con la que el servidor armo `inicial`; ver `TablaRecurso`. */
  consultaDelInicial?: string
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
}) {
  const esSoporte = seccion === 'soporte'
  const [refresco, setRefresco] = useState(0)

  // Solo la bandeja de soporte escucha: un ticket que cambio no mueve la lista de Proyectos.
  const alCambiar = useCallback(() => { if (esSoporte) setRefresco((n) => n + 1) }, [esSoporte])
  useAlCambiarTickets(alCambiar)
  // Abrir la ficha la marca como leida en la API: al cerrar se vuelve a pedir para quitar la marca.
  useAlCerrarTicket(alCambiar)

  // Se memoiza porque `TablaRecurso` la usa como dependencia de sus efectos: una definicion nueva en
  // cada render volveria a pedir la pagina en bucle.
  const definicion = useMemo(() => {
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
          : columna
      ))
    }
  }, [seccion])

  return (
    <TablaRecurso
      definicion={definicion}
      inicial={inicial}
      consultaDelInicial={consultaDelInicial}
      refresco={refresco}
      claveFila={(fila) => fila.id}
      opcionesDeFiltro={opcionesDeFiltro}
      abrirEn={esSoporte ? { clave: PARAMETRO_TICKET, valor: (fila) => fila.id } : undefined}
      claseFila={esSoporte ? (fila) => claseDeFilaDeSolicitud(fila as unknown as TicketPortal) : undefined}
      tarjeta={esSoporte
        ? (fila, catalogos) => <TarjetaDeSolicitud ticket={fila as unknown as TicketPortal} catalogos={catalogos} />
        : undefined}
      tarjetasEnMovil={esSoporte}
    />
  )
}
