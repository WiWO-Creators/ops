'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import type { DefinicionRecurso } from '@/definiciones/tipos'
import { PORTAL_PROYECTOS } from '@/definiciones/portal-proyectos'
import type { EspacioPortal } from '@/datos/portal'
import type { DatosDeTablaDelPortal } from './seccion'
import { TarjetaDeProyectoPortal } from './TarjetaDeProyectoPortal'

/** La columna por la que se entra a la ficha del {espacio}. */
const CLAVE_ENLACE = 'name'

/**
 * La tabla de Proyectos del portal, del lado del cliente.
 *
 * Existe por la misma restriccion que `componentes/datos/vistas.tsx`: una `DefinicionRecurso` esta
 * llena de funciones, y **una funcion no cruza de un Server Component a uno cliente**. La pagina
 * manda datos serializables; la definicion se resuelve de este lado. El nombre navega a la ficha del
 * {espacio}; en pantallas angostas se ve en tarjetas. La tabla de Tickets es `TablaSolicitudes`: tiene modal, marcas de lectura y refresco.
 */
export function TablaProyectos ({ inicial, consultaDelInicial, opcionesDeFiltro }: DatosDeTablaDelPortal<EspacioPortal>) {
  // Se memoiza porque `TablaRecurso` la usa como dependencia de sus efectos: una definicion nueva en
  // cada render volveria a pedir la pagina en bucle.
  const definicion = useMemo<DefinicionRecurso<EspacioPortal>>(() => ({
    ...PORTAL_PROYECTOS,
    columnas: PORTAL_PROYECTOS.columnas.map((columna) => (
      columna.clave === CLAVE_ENLACE
        ? {
            ...columna,
            presentar: (fila: EspacioPortal) => (
              <Link
                href={`/portal/proyectos/${fila.id}`}
                className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
              >
                {columna.presentar(fila)}
              </Link>
            )
          }
        : columna
    ))
  }), [])

  return (
    <TablaRecurso
      definicion={definicion}
      inicial={inicial}
      consultaDelInicial={consultaDelInicial}
      claveFila={(fila) => fila.id}
      opcionesDeFiltro={opcionesDeFiltro}
      tarjeta={(fila, catalogos) => <TarjetaDeProyectoPortal proyecto={fila} catalogos={catalogos} />}
      tarjetasEnMovil
    />
  )
}
