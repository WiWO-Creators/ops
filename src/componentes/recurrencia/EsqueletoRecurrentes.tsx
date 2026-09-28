import type { ReactElement } from 'react'
import { Hueso } from '@/componentes/estado/Estados'
import { cn } from '@/lib/clases'
import './recurrencia.css'

/** Anchos de la columna de nombre, variados para que el esqueleto no parezca una grilla de ladrillos. */
const ANCHOS = ['w-3/5', 'w-2/5', 'w-4/5', 'w-1/2', 'w-2/3']

/**
 * Lo que ocupa la lista de reglas mientras llega: filas con la forma de las de verdad.
 *
 * No es el `Cargando` del orbe a proposito. El orbe dice "todavia no hay nada"; aca la pantalla ya
 * tiene su encabezado y sus filtros, y lo que cambia es solo la lista —al filtrar, al volver de otra
 * pestaña—. Un esqueleto con el mismo alto de fila evita que la pagina salte cuando llegan los datos.
 *
 * @param filas cuantas filas dibujar
 * @returns la lista de huesos, anunciada como estado de carga
 */
export function EsqueletoRecurrentes ({ filas = 5 }: { filas?: number }): ReactElement {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando las tareas recurrentes" className="flex flex-col gap-2">
      {Array.from({ length: filas }, (_, i) => (
        <div
          key={i}
          style={{ '--i': i } as React.CSSProperties}
          className="rec-escalonada border-linea bg-superficie rounded-tarjeta grid grid-cols-1 items-center gap-3 border px-4 py-3 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <div className="flex flex-col gap-2">
            <Hueso className={cn('h-4 rounded-chico', ANCHOS[i % ANCHOS.length])} />
            <Hueso className="h-3 w-1/3 rounded-chico" />
          </div>
          <Hueso className="hidden h-4 w-24 rounded-chico md:block" />
          <Hueso className="hidden h-4 w-20 rounded-chico md:block" />
          <Hueso className="hidden h-7 w-24 md:block" />
        </div>
      ))}
    </div>
  )
}
