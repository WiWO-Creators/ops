'use client'

import { useLayoutEffect, type RefObject } from 'react'
import { animate, stagger } from 'animejs'
import { cumpleConsulta, MENOS_MOVIMIENTO } from '@/lib/useConsultaDeMedios'

/**
 * Coreografia de entrada del bloque Scope: el resumen primero y despues las tres columnas
 * (incluye, excluye, supuestos), escalonadas y con sus items detras.
 *
 * Es UN momento por vista: corre al montar el bloque y no al reordenar ni al editar. Marca con
 * `data-scope="resumen"`, `"columna"` y `"item"` dentro de la raiz. Solo mueve `opacity` y
 * `translateY`, que van al compositor; con `prefers-reduced-motion` no hace nada y el contenido
 * queda en su estado final, que es tambien lo que se ve sin JavaScript.
 *
 * @param raiz ref del contenedor que tiene los marcadores
 * @param clave cambia cuando hay que revelar de nuevo (otro Scope): un `updated_at`, por ejemplo
 */
export function useRevelarScope (raiz: RefObject<HTMLElement | null>, clave: string): void {
  useLayoutEffect(() => {
    const contenedor = raiz.current

    if (contenedor === null || cumpleConsulta(MENOS_MOVIMIENTO)) return

    const resumen = contenedor.querySelectorAll('[data-scope="resumen"]')
    const columnas = contenedor.querySelectorAll('[data-scope="columna"]')
    const items = contenedor.querySelectorAll('[data-scope="item"]')

    const animaciones = [
      animate(resumen, { opacity: [0, 1], translateY: [-6, 0], duration: 300, ease: 'outQuad' }),
      animate(columnas, {
        opacity: [0, 1],
        translateY: [10, 0],
        duration: 360,
        ease: 'outQuad',
        delay: stagger(90, { start: 120 })
      }),
      animate(items, {
        opacity: [0, 1],
        translateX: [-6, 0],
        duration: 260,
        ease: 'outQuad',
        delay: stagger(24, { start: 300 })
      })
    ]

    return () => { animaciones.forEach((animacion) => { animacion.cancel() }) }
  }, [raiz, clave])
}
