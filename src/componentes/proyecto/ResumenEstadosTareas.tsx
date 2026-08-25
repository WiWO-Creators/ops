'use client'

import type { ReactElement } from 'react'
import { cn } from '@/lib/clases'
import type { ResumenEstadoTareas } from '@/datos/recursos'

/**
 * Las tarjetas de resumen de tareas por estado.
 *
 * Cada tarjeta es un boton de verdad y no un `div` con `onClick`: filtra la tabla por ese estado, se
 * alcanza con el teclado y anuncia si esta activa. Volver a tocar la tarjeta activa quita el filtro,
 * que es la unica forma de deshacerlo sin ir al selector de filtros.
 *
 * Los totales los cuenta el backend sobre el proyecto entero, no sobre la pagina visible: sumar las
 * filas de la tabla daria "3 en progreso" cuando hay treinta.
 */

interface PropsResumen {
  resumen: ResumenEstadoTareas[]
  /** Estado por el que la tabla esta filtrada ahora, o `null` si no hay filtro. */
  estadoActivo: number | null
  onElegir: (status: number | null) => void
}

export function ResumenEstadosTareas ({ resumen, estadoActivo, onElegir }: PropsResumen): ReactElement {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
      {resumen.map((estado) => {
        const activa = estadoActivo === estado.status

        return (
          <button
            key={estado.status}
            type="button"
            aria-pressed={activa}
            onClick={() => onElegir(activa ? null : estado.status)}
            className={cn(
              'border-linea bg-superficie-elevada rounded-tarjeta hover:bg-hover',
              'flex flex-col gap-1 border p-3 text-left transition-colors duration-150',
              activa && 'border-linea-fuerte bg-seleccionado'
            )}
          >
            <span className="flex items-center gap-2">
              {estado.color !== null && (
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  // El color lo administra quien configura los estados en Perfex: es un dato, no un
                  // token del sistema, y por eso va en `style`.
                  style={{ backgroundColor: estado.color }}
                />
              )}
              <span className="text-texto-tenue truncate text-xs font-medium">{estado.name}</span>
            </span>

            <span className="text-texto text-2xl leading-none font-semibold tabular-nums">
              {estado.total}
            </span>

            <span className="text-texto-sutil text-xs tabular-nums">
              Mis tareas: {estado.mias}
            </span>
          </button>
        )
      })}
    </div>
  )
}
