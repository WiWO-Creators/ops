'use client'

import type { EstadisticaEstado } from '@/datos/recursos'
import { cn } from '@/lib/clases'

interface PropsPastillasEstado {
  /** Contadores de `GET /projects/stats`, ya ordenados por el backend. `null` si no se pudieron leer. */
  estadisticas: EstadisticaEstado[] | null
  /** Motivo por el que no hay contadores. Se muestra en vez de inventar ceros. */
  error?: string | null
  /** Estados activos en el filtro, como los guarda la consulta (ids en texto). */
  seleccion: string[]
  onCambiar: (estados: string[]) => void
}

/**
 * Pastillas de estado con el conteo de Espacios de cada uno.
 *
 * Son botones y no enlaces: no navegan a ningun lado, alternan el filtro de estado de la vista que ya
 * esta abierta. Alternan en vez de reemplazar para que se puedan combinar dos estados, que es lo que
 * el filtro multiple permite; `aria-pressed` dice cual esta activa sin depender del color.
 *
 * Cuando el backend no responde no se pinta nada parecido a un contador: un cero que no se conto es
 * peor que la ausencia del numero.
 */
export function PastillasEstado ({ estadisticas, error = null, seleccion, onCambiar }: PropsPastillasEstado) {
  if (error !== null) {
    return (
      <p role="status" className="text-texto-tenue border-linea rounded-medio border border-dashed px-3 py-2 text-xs">
        No se pudieron cargar los contadores por estado: {error}
      </p>
    )
  }

  if (estadisticas === null || estadisticas.length === 0) return null

  /** Alterna un estado del filtro y deja los demas como estaban. */
  function alternar (status: number) {
    const clave = String(status)

    onCambiar(seleccion.includes(clave) ? seleccion.filter((v) => v !== clave) : [...seleccion, clave])
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {estadisticas.map((estadistica) => {
        const activa = seleccion.includes(String(estadistica.status))

        return (
          <li key={estadistica.status}>
            <button
              type="button"
              aria-pressed={activa}
              onClick={() => { alternar(estadistica.status) }}
              className={cn(
                'rounded-tarjeta ease-neo flex items-center gap-2 border px-3 py-2 text-left',
                'transition-[background-color,border-color] duration-150',
                activa
                  ? 'border-control-borde bg-seleccionado text-texto'
                  : 'border-linea bg-superficie-elevada text-texto-tenue hover:bg-hover'
              )}
            >
              {/* El color lo administra Perfex: es dato de la fila, no un token del sistema. */}
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: estadistica.color ?? 'currentColor' }}
              />
              <span className="text-xs font-medium">{estadistica.name}</span>
              <span data-numerico className="text-texto text-sm font-semibold tabular-nums">
                {estadistica.total}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
