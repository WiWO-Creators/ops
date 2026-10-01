'use client'

import { useEffect } from 'react'
import { diaLocal } from '@/dominio/modos-especiales'
import { retirarModo } from '@/lib/modo-especial'

/** Cada cuanto se revisa si el modo ya vencio. Un minuto alcanza: el cambio es de un dia al otro. */
const REVISION_MS = 60_000

/**
 * Retira el modo especial si vence con la pestaña abierta, sin esperar a que se recargue.
 *
 * El servidor pinta `data-modo-hasta` con el ultimo dia vigente (inclusive). No pinta nada: solo
 * quita los atributos cuando el dia local ya pasó de ese.
 */
export function VigiladorDeModo (): null {
  useEffect(() => {
    const revisar = () => {
      const hasta = document.documentElement.getAttribute('data-modo-hasta')

      if (hasta !== null && diaLocal(new Date()) > hasta) retirarModo()
    }
    const reloj = window.setInterval(revisar, REVISION_MS)

    revisar()
    return () => { window.clearInterval(reloj) }
  }, [])

  return null
}
