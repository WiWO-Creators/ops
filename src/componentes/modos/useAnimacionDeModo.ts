'use client'

import { useLayoutEffect, useRef, type RefObject } from 'react'
import { cumpleConsulta, MENOS_MOVIMIENTO } from '@/lib/useConsultaDeMedios'

/** Lo minimo que se le pide a una animacion o timeline de anime.js para poder limpiarla. */
export interface AnimacionRevertible {
  revert: () => unknown
}

/**
 * Monta las animaciones de anime.js de una pieza decorativa y las revierte al desmontar.
 *
 * El marcado de la pieza ya es su estado final y quieto: con `prefers-reduced-motion` no se arma
 * nada y se queda tal cual. Corre en `useLayoutEffect` para esconder lo que va a entrar antes del
 * primer pintado y no dejar ver un fotograma de mas.
 *
 * @param armar recibe la raiz de la pieza y devuelve lo que creo, para revertirlo
 * @returns el ref que va en la raiz de la pieza
 */
export function useAnimacionDeModo<T extends HTMLElement | SVGElement> (
  armar: (raiz: T) => AnimacionRevertible[]
): RefObject<T | null> {
  const raizRef = useRef<T | null>(null)

  useLayoutEffect(() => {
    const raiz = raizRef.current

    if (raiz === null || cumpleConsulta(MENOS_MOVIMIENTO)) return

    const creadas = armar(raiz)

    return () => { for (const animacion of creadas) animacion.revert() }
    // Corre una vez por montaje: la pieza no cambia de armador en caliente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return raizRef
}
