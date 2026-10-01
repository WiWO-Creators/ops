'use client'

import { useState } from 'react'
import { animate } from 'animejs'
import { Arana as DibujoDeArana } from './Dibujos'
import { useAnimacionDeModo } from './useAnimacionDeModo'

/** Largo del hilo del que cuelga, en px. */
const HILO_PX = 96
/** Cuanto tarda en bajar al entrar, y en volver a bajar despues de asustarse. */
const BAJADA_MS = 1600

/**
 * Una araña que baja por su hilo, se queda balanceandose, y si alguien le hace clic sube de golpe
 * y vuelve a bajar. Es lo unico de la decoracion que recibe el puntero.
 *
 * Con menos movimiento queda colgando quieta, ya abajo.
 */
export function Arana () {
  const [asustada, setAsustada] = useState(false)

  const raizRef = useAnimacionDeModo<HTMLDivElement>((raiz) => {
    const bajada = animate(raiz, { translateY: [-HILO_PX, 0], duration: BAJADA_MS, ease: 'outQuint' })
    const balanceo = animate(raiz, {
      rotate: [-4, 4],
      duration: 3200,
      ease: 'inOutSine',
      alternate: true,
      loop: true,
      delay: BAJADA_MS
    })

    return [bajada, balanceo]
  })

  function asustar (): void {
    const raiz = raizRef.current

    if (raiz === null || asustada) return
    setAsustada(true)
    animate(raiz, {
      translateY: [{ to: -HILO_PX, duration: 380, ease: 'outQuad' }, { to: 0, duration: BAJADA_MS, delay: 2400, ease: 'outQuint' }],
      onComplete: () => { setAsustada(false) }
    })
  }

  return (
    <div
      ref={raizRef}
      style={{ left: '72vw', transformOrigin: '50% 0' }}
      className="pointer-events-auto absolute top-0 hidden origin-top flex-col items-center md:flex"
    >
      <span aria-hidden className="decoracion-modo-hilo block w-px" style={{ height: HILO_PX }} />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={asustar}
        className="decoracion-modo-arana cursor-default"
      >
        <DibujoDeArana className="size-8" />
      </button>
    </div>
  )
}
