'use client'

import { useEffect, type RefObject } from 'react'
import { animate } from 'animejs'
import { cumpleConsulta, MENOS_MOVIMIENTO } from '@/lib/useConsultaDeMedios'

/**
 * Anima con anime.js el paso del plan que se está ejecutando: su marcador late (escala y opacidad
 * del halo) mientras dure el paso.
 *
 * Solo toca `transform` y `opacity`. Con `prefers-reduced-motion` no anima nada: el estado «En
 * curso» ya se dice con el texto y el icono. Al terminar el paso, o al desmontar, la animación se
 * revierte para no dejar el halo a medias.
 *
 * @param halo Elemento del halo que late; vive dentro del marcador del paso.
 * @param activo Si el paso está en curso.
 */
export function useAnimacionPasoActivo (halo: RefObject<HTMLElement | null>, activo: boolean): void {
  useEffect(() => {
    const elemento = halo.current
    if (!activo || elemento === null) return
    if (cumpleConsulta(MENOS_MOVIMIENTO)) return

    const animacion = animate(elemento, {
      scale: [1, 1.8],
      opacity: [0.6, 0],
      duration: 1100,
      ease: 'outQuad',
      loop: true,
      loopDelay: 200
    })

    return () => { animacion.revert() }
  }, [halo, activo])
}
