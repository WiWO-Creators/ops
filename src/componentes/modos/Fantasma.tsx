'use client'

import { Ghost } from 'lucide-react'
import { animate } from 'animejs'
import { useAnimacionDeModo } from './useAnimacionDeModo'

/** Lo que tarda en cruzar, y cuanto espera para volver a aparecer. */
const CRUCE_MS = 18_000
const PAUSA_MS = 52_000

/**
 * Un fantasma que cruza de derecha a izquierda flotando, aparece y se desvanece, y no vuelve en casi
 * un minuto. Es lo mas raro de ver de toda la decoracion, a proposito: si estuviera siempre se
 * volveria parte del fondo.
 */
export function Fantasma () {
  const raizRef = useAnimacionDeModo<HTMLDivElement>((raiz) => [
    animate(raiz, {
      translateX: ['112vw', '-16vw'],
      translateY: [
        { to: -26, duration: CRUCE_MS / 4, ease: 'inOutSine' },
        { to: 20, duration: CRUCE_MS / 4, ease: 'inOutSine' },
        { to: -22, duration: CRUCE_MS / 4, ease: 'inOutSine' },
        { to: 14, duration: CRUCE_MS / 4, ease: 'inOutSine' }
      ],
      opacity: [
        { to: 0.4, duration: CRUCE_MS * 0.12 },
        { to: 0.4, duration: CRUCE_MS * 0.76 },
        { to: 0, duration: CRUCE_MS * 0.12 }
      ],
      duration: CRUCE_MS,
      ease: 'linear',
      loop: true,
      loopDelay: PAUSA_MS,
      delay: 9000
    })
  ])

  return (
    <div
      ref={raizRef}
      style={{ top: '38vh', left: 0 }}
      className="decoracion-modo-fantasma decoracion-modo-vuelo absolute hidden opacity-0 md:block"
    >
      <Ghost aria-hidden strokeWidth={1.4} className="size-14" />
    </div>
  )
}
