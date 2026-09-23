'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { ReactElement } from 'react'
import { cn } from '@/lib/clases'
import { alternarEsperandoAlEquipo, filtraEsperandoAlEquipo } from '@/dominio/tickets-listados'

/**
 * Filtro rapido "Esperando al equipo" de los listados de tickets del equipo.
 *
 * Es un atajo del selector de filtros, no un filtro aparte: escribe el mismo `filter[esperando]`
 * en la URL, asi que el selector lo muestra puesto y quitarlo desde ahi apaga este boton. Se ofrece
 * suelto porque es la pregunta con la que se abre la bandeja: que tengo que contestar.
 *
 * Es un boton con `aria-pressed` y no un enlace: alterna un estado de la vista, no navega.
 */
export function FiltroEsperandoAlEquipo (): ReactElement {
  const router = useRouter()
  const params = useSearchParams()
  const activo = filtraEsperandoAlEquipo(new URLSearchParams(params.toString()))

  /** Alterna el filtro conservando el resto de la vista. `replace`: no es un paso del historial. */
  function alternar (): void {
    router.replace(alternarEsperandoAlEquipo(new URLSearchParams(params.toString())), { scroll: false })
  }

  return (
    <div className="flex">
      <button
        type="button"
        aria-pressed={activo}
        onClick={alternar}
        className={cn(
          'rounded-control inline-flex h-8 items-center gap-2 border px-3 text-sm font-medium transition-colors duration-150 active:scale-[0.98]',
          activo
            ? 'border-acento bg-acento-suave text-acento'
            : 'border-control-borde bg-control text-texto-tenue hover:bg-hover hover:text-texto'
        )}
      >
        <span aria-hidden="true" className={cn('size-1.5 rounded-full', activo ? 'bg-acento' : 'bg-texto-aviso')} />
        Esperando al equipo
      </button>
    </div>
  )
}
