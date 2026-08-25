'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { ReactElement } from 'react'
import { PARAMETRO_TAREA } from '@/componentes/proyecto/CajonTarea'
import { PROCESOS } from '@/definiciones/procesos'
import type { Proceso } from '@/datos/recursos'
import type { DefinicionRecurso } from '@/definiciones/tipos'
import { urlConParametro } from './tabla'

/**
 * La definicion de Procesos con las dos celdas que llevan a algun lado.
 *
 * Vive aparte de `src/definiciones/procesos.ts` porque ese archivo es un `.ts`: las pruebas lo corren
 * con el runner de Node, que despoja tipos pero **no** JSX. Un enlace no cabe alli.
 *
 * Son dos destinos distintos en la misma fila y confundirlos es peor que no tener el enlace: el
 * nombre abre el detalle de la tarea sin salir del listado, el espacio navega a su pantalla. El clic
 * de la fila entera lo maneja el motor, que se abstiene cuando el clic nacio en uno de estos enlaces.
 *
 * Se arma una sola vez a nivel de modulo: `TablaRecurso` memoiza contra la identidad de la definicion,
 * y reconstruirla en cada render volveria a pintar todas las celdas.
 */
export const PROCESOS_NAVEGABLES: DefinicionRecurso<Proceso> = {
  ...PROCESOS,
  columnas: PROCESOS.columnas.map((columna) => {
    if (columna.clave === 'name') {
      return { ...columna, presentar: (proceso: Proceso) => <EnlaceTarea proceso={proceso} /> }
    }

    if (columna.clave === 'project') {
      return { ...columna, presentar: (proceso: Proceso) => <EnlaceEspacio proceso={proceso} /> }
    }

    return columna
  })
}

/**
 * El nombre de la tarea, como enlace al detalle.
 *
 * Lee `useSearchParams` por su cuenta en vez de recibir la URL por prop: `presentar` solo recibe la
 * fila, y un componente propio es la unica forma de que el enlace conserve los parametros vigentes
 * —filtros, orden, pagina— sin atar la definicion memoizada al estado.
 *
 * Es un `<a>` de verdad y no un `div` con `onClick`: asi el detalle se abre con el teclado, se copia
 * el enlace y se abre en otra pestaña. El clic de la fila es comodidad encima de esto, no en su lugar.
 */
function EnlaceTarea ({ proceso }: { proceso: Proceso }): ReactElement {
  const params = useSearchParams()

  return (
    <Link
      href={urlConParametro(new URLSearchParams(params.toString()), PARAMETRO_TAREA, String(proceso.id))}
      scroll={false}
      className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
    >
      {proceso.name}
    </Link>
  )
}

/**
 * El espacio de la tarea, como enlace a su pantalla.
 *
 * Una tarea puede no tener espacio: ahi va una raya y no una celda vacia, que se confunde con un dato
 * que no cargo.
 */
function EnlaceEspacio ({ proceso }: { proceso: Proceso }): ReactElement {
  if (proceso.project === null) return <span className="text-texto-sutil">—</span>

  return (
    <Link
      href={`/espacios/${proceso.project.id}`}
      className="text-texto-tenue hover:text-acento underline-offset-4 hover:underline"
    >
      {proceso.project.name}
    </Link>
  )
}
