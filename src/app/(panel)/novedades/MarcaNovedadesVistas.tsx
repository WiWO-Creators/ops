'use client'

import { useEffect } from 'react'
import { marcarNovedadesVistas } from '@/lib/novedades-vistas'

interface PropsMarca {
  /** La fecha de la novedad más reciente, `YYYY-MM-DD`. */
  fecha: string
}

/**
 * No pinta nada: al abrir la página deja constancia de que las novedades se vieron, y el punto del
 * menú de la cuenta se apaga sin recargar.
 */
export function MarcaNovedadesVistas ({ fecha }: PropsMarca) {
  useEffect(() => {
    marcarNovedadesVistas(fecha)
  }, [fecha])

  return null
}
