'use client'

import { useEffect, useState, type RefObject } from 'react'

/** Ancho y alto de un elemento, en pixeles CSS. */
export interface Medida {
  ancho: number
  alto: number
}

/** Lo que vale una medida antes del primer `ResizeObserver`. */
const SIN_MEDIR: Medida = { ancho: 0, alto: 0 }

/**
 * Mide un elemento y vuelve a medirlo cuando cambia de tamaño.
 *
 * Hay layouts que no se pueden decidir en CSS porque dependen de dos cosas a la vez: cuanto espacio
 * hay y cuantas piezas entran. El mosaico de la videollamada es uno —el reparto en columnas y filas
 * cambia si se abre el chat, si alguien se suma o si la ventana se angosta— y `auto-fit` no llega:
 * conoce el ancho, pero nunca la cantidad de filas.
 *
 * Devuelve `{ ancho: 0, alto: 0 }` hasta la primera medicion. Quien lo use tiene que tratar ese
 * caso como "todavia no se", no como "mide cero".
 *
 * @param referencia Ref al elemento que se quiere medir.
 * @returns La ultima medida conocida.
 */
export function useMedida (referencia: RefObject<HTMLElement | null>): Medida {
  const [medida, setMedida] = useState<Medida>(SIN_MEDIR)

  useEffect(() => {
    const elemento = referencia.current
    if (elemento === null) return

    const observador = new ResizeObserver((entradas) => {
      const caja = entradas[0]?.contentRect
      if (caja === undefined) return

      // Solo se actualiza el estado si la medida cambio de verdad. `ResizeObserver` dispara tambien
      // cuando el contenido interno se reacomoda; sin esta guarda, un cambio de layout que este
      // hook provoca vuelve a entrar por aca y el render se repite sin necesidad.
      setMedida((anterior) => (
        anterior.ancho === caja.width && anterior.alto === caja.height
          ? anterior
          : { ancho: caja.width, alto: caja.height }
      ))
    })

    observador.observe(elemento)

    return () => { observador.disconnect() }
  }, [referencia])

  return medida
}
