'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import type { DefinicionRecurso, OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import { PORTAL_PROYECTOS } from '@/definiciones/portal-proyectos'

/**
 * Las tablas del portal, del lado del cliente.
 *
 * Existe por la misma restriccion que `componentes/datos/vistas.tsx`: una `DefinicionRecurso` esta
 * llena de funciones, y **una funcion no cruza de un Server Component a uno cliente**. La pagina
 * manda una clave y datos serializables; la definicion se resuelve de este lado.
 *
 * Hoy queda una sola seccion con listado —Proyectos—: la de Soporte se retiro cuando los tickets
 * pasaron a pedirse y leerse dentro del {espacio}. El mapa sigue siendo un mapa igual: es lo que
 * permite que una `page.tsx` del portal se resuelva en tres lineas, y agregar la proxima seccion
 * es una entrada acá y otra en `ENLACES`.
 */

const DEFINICIONES = {
  proyectos: PORTAL_PROYECTOS
} as const

export type SeccionPortalListado = keyof typeof DEFINICIONES

/** Secciones cuyo listado abre un detalle, y por que columna se entra. */
const ENLACES: Partial<Record<SeccionPortalListado, string>> = {
  proyectos: 'name'
}

export function TablaPortal<T extends { id: number }> ({
  seccion,
  inicial,
  opcionesDeFiltro
}: {
  seccion: SeccionPortalListado
  inicial: ResultadoLista<T>
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
}) {
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
                <Link
                  href={`/portal/${seccion}/${fila.id}`}
                  className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
                >
                  {columna.presentar(fila)}
                </Link>
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
      claveFila={(fila) => fila.id}
      opcionesDeFiltro={opcionesDeFiltro}
    />
  )
}
