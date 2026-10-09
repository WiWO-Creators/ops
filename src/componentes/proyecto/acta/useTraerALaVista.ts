'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { useLenis } from 'lenis/react'

/**
 * Trae una sección a la vista una sola vez, cuando está lista.
 *
 * El scroll es de Lenis y no del `body` —ver `ScrollSuave`—: sin él, `scrollIntoView` mueve el
 * contenedor por debajo y Lenis lo devuelve a donde estaba en el siguiente fotograma. `resize()` va
 * antes porque la pantalla anterior era el asistente, mucho más corto: Lenis todavía tiene su alto
 * y recortaría el destino a ese tope.
 *
 * @param destacar si hay que traerla
 * @param lista si su contenido ya cargó
 * @returns la referencia que se cuelga de la sección
 */
export function useTraerALaVista<T extends HTMLElement> (destacar: boolean, lista: boolean): RefObject<T | null> {
  const seccion = useRef<T>(null)
  const lenis = useLenis()
  const destacada = useRef(false)

  useEffect(() => {
    const destino = seccion.current
    if (!destacar || destacada.current || !lista || destino === null) return

    const fotograma = requestAnimationFrame(() => {
      destacada.current = true
      if (lenis === undefined) {
        destino.scrollIntoView({ behavior: 'smooth', block: 'start' })

        return
      }
      lenis.resize()
      lenis.scrollTo(destino, { offset: -24 })
    })

    return () => { cancelAnimationFrame(fotograma) }
  }, [destacar, lista, lenis])

  return seccion
}
