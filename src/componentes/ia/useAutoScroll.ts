'use client'

import { useCallback, useEffect, useRef, type RefObject } from 'react'

/** Distancia al final bajo la cual la conversación sigue a la respuesta que va llegando. */
export const DISTANCIA_PEGADO_PX = 180

interface OpcionesAutoScroll {
  /** Si el contenedor scrollea por sí mismo. Sin acotar, scrollea la página y moverla sería quitarle el scroll al lector. */
  activo?: boolean
  /** Si el contenedor ya existe. Mientras la lista carga no hay nada que bajar, y la carga inicial se espera. */
  listo?: boolean
}

/**
 * Mantiene una conversación pegada al final sin arrebatarle el scroll a quien relee.
 *
 * Fuerza el fondo en la carga inicial y al enviar (`forzarFondo`); después solo acompaña a la
 * respuesta mientras el lector esté a menos de `DISTANCIA_PEGADO_PX` del final.
 *
 * @param contenido Valor que cambia cuando la conversación crece (la lista de mensajes).
 * @param opciones `activo` y `listo`, ver `OpcionesAutoScroll`.
 * @returns `ref` para el contenedor desplazable y `forzarFondo` para llamar al enviar.
 */
export function useAutoScroll (contenido: unknown, { activo = true, listo = true }: OpcionesAutoScroll = {}): { ref: RefObject<HTMLDivElement | null>, forzarFondo: () => void } {
  const ref = useRef<HTMLDivElement>(null)
  const forzar = useRef(true)

  useEffect(() => {
    if (!activo || !listo) return
    const caja = ref.current
    if (caja === null) return

    const cerca = caja.scrollHeight - caja.scrollTop - caja.clientHeight < DISTANCIA_PEGADO_PX
    if (!forzar.current && !cerca) return

    forzar.current = false
    caja.scrollTop = caja.scrollHeight
  }, [contenido, activo, listo])

  const forzarFondo = useCallback((): void => { forzar.current = true }, [])

  return { ref, forzarFondo }
}
