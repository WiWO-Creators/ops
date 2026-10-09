'use client'

import { useCallback, useState, type AnimationEvent } from 'react'

interface Presencia {
  /** Si el elemento tiene que estar en el DOM: mientras está presente y mientras dura su salida. */
  montado: boolean
  /** `true` entre el pedido de cierre y el fin de la animación de salida. */
  saliendo: boolean
  /** Va en el `onAnimationEnd` del elemento que sale: lo desmonta cuando termina su salida. */
  alTerminarAnimacion: (evento: AnimationEvent<HTMLElement>) => void
}

/**
 * Sostiene montado algo flotante mientras corre su animación de salida.
 *
 * Sin esto, un `{abierto && …}` desmonta en el acto y la clase `animate-salir-*` nunca llega a
 * pintarse: lo que entró con una animación se va de golpe. Es lo que hace `Presence` en Radix para
 * `Dialogo` y `Cajon`, para las superficies que no son de Radix.
 *
 * El elemento que sale TIENE que llevar una animación mientras `saliendo` es `true`: el desmontaje
 * espera a su `animationend`. Con movimiento reducido la animación dura 0.01ms (`neo.css`), así que
 * el evento llega igual y se desmonta sin espera visible.
 *
 * @param presente si el elemento se pidió abierto
 * @returns `montado`, `saliendo` y el manejador de fin de animación
 */
export function usePresencia (presente: boolean): Presencia {
  const [montado, setMontado] = useState(presente)

  // Abrir se resuelve en el mismo render y no en un efecto: un efecto pintaría un fotograma con el
  // elemento todavía ausente, y la entrada arrancaría tarde.
  if (presente && !montado) setMontado(true)

  const alTerminarAnimacion = useCallback((evento: AnimationEvent<HTMLElement>): void => {
    // Las animaciones de los hijos también burbujean hasta acá; solo cuenta la del propio elemento.
    if (evento.target !== evento.currentTarget || presente) return
    setMontado(false)
  }, [presente])

  return { montado: montado || presente, saliendo: montado && !presente, alTerminarAnimacion }
}
