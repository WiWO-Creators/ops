'use client'

import { useRef, useState } from 'react'
import { animate, stagger } from 'animejs'
import { Arana as DibujoDeArana } from './Dibujos'
import { useAnimacionDeModo } from './useAnimacionDeModo'

/** Largo del hilo del que cuelga, en px. */
const HILO_PX = 96
/** Cuanto tarda en bajar al entrar, y en volver a bajar despues de asustarse. */
const BAJADA_MS = 1600

/** Clics seguidos que la hacen bailar, y el tiempo en que tienen que darse. */
const CLICS_BAILE = 3
const VENTANA_MS = 1400
/** Cuantas aranitas salen corriendo cuando baila. */
const CRIAS = 6

/**
 * Una araña que baja por su hilo, se queda balanceandose, y si alguien le hace clic sube de golpe
 * y vuelve a bajar. Si le hacen tres clics seguidos en vez de asustarse baila, y salen corriendo sus
 * crias por el borde de arriba.
 *
 * Con menos movimiento queda colgando quieta, ya abajo.
 */
export function Arana () {
  const [asustada, setAsustada] = useState(false)
  const [crias, setCrias] = useState(false)
  const clicsRef = useRef<number[]>([])

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

  /** Gira dos vueltas dando saltitos y suelta a sus crias. */
  function bailar (): void {
    const raiz = raizRef.current

    if (raiz === null) return
    setAsustada(true)
    setCrias(true)
    animate(raiz, {
      rotate: [0, 720],
      translateY: [{ to: 18, duration: 250 }, { to: 0, duration: 250 }, { to: 14, duration: 250 }, { to: 0, duration: 250 }],
      duration: 1000,
      ease: 'inOutSine',
      onComplete: () => { setAsustada(false) }
    })
  }

  function asustar (): void {
    const raiz = raizRef.current
    const ahora = Date.now()

    clicsRef.current = [...clicsRef.current.filter((t) => ahora - t < VENTANA_MS), ahora]
    if (clicsRef.current.length >= CLICS_BAILE) {
      clicsRef.current = []
      bailar()
      return
    }

    if (raiz === null || asustada) return
    setAsustada(true)
    animate(raiz, {
      translateY: [{ to: -HILO_PX, duration: 380, ease: 'outQuad' }, { to: 0, duration: BAJADA_MS, delay: 2400, ease: 'outQuint' }],
      onComplete: () => { setAsustada(false) }
    })
  }

  return (
    <>
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
      {crias && <CriasDeArana onTerminar={() => { setCrias(false) }} />}
    </>
  )
}

/** Las crias: aranitas que cruzan el borde de arriba de la pantalla, cada una a su paso. */
function CriasDeArana ({ onTerminar }: { onTerminar: () => void }) {
  const raizRef = useAnimacionDeModo<HTMLDivElement>((raiz) => [
    animate(raiz.querySelectorAll('[data-cria]'), {
      translateX: ['0vw', '-100vw'],
      duration: 4200,
      ease: 'linear',
      delay: stagger(280),
      onComplete: onTerminar
    }),
    animate(raiz.querySelectorAll('[data-cria] svg'), { rotate: [-6, 6], duration: 160, alternate: true, loop: true, ease: 'inOutSine' })
  ])

  return (
    <div ref={raizRef} aria-hidden className="pointer-events-none fixed inset-x-0 top-1">
      {Array.from({ length: CRIAS }, (_, i) => (
        <span
          key={i}
          data-cria=""
          style={{ left: '100vw', top: `${(i % 3) * 7}px` }}
          className="decoracion-modo-arana absolute block"
        >
          <DibujoDeArana className="size-3.5" />
        </span>
      ))}
    </div>
  )
}
