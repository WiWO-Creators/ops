'use client'

import { useLayoutEffect, useRef } from 'react'
import { animate, stagger } from 'animejs'
import { cumpleConsulta, MENOS_MOVIMIENTO } from '@/lib/useConsultaDeMedios'
import { Murcielago, Telarana } from './Dibujos'

/** Cuantos murcielagos cruzan la pantalla. Pocos y lentos: es un adorno, no una animacion de fondo. */
const MURCIELAGOS = 3
/** Lo que tarda cada cruce, en milisegundos. Lento a proposito: movimiento constante, no llamativo. */
const CRUCE_MS = 40_000
/** Altura de la banda por la que vuelan, en px desde el borde superior: la franja de la cabecera, nunca el contenido. */
const BANDA_PX = 40

/**
 * La decoracion de Halloween: telarañas en las esquinas de arriba y unos pocos murcielagos que
 * cruzan despacio. Capa fija, sin eventos de puntero, debajo de los dialogos.
 *
 * Con `prefers-reduced-motion` los murcielagos se quedan quietos, colgando arriba: el marcado ya es
 * su estado final y la animacion solo se agrega encima.
 */
export function DecoracionHalloween () {
  const raizRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const raiz = raizRef.current

    if (raiz === null || cumpleConsulta(MENOS_MOVIMIENTO)) return

    const animacion = animate(raiz.querySelectorAll('[data-murcielago]'), {
      translateX: ['-12vw', '112vw'],
      translateY: [
        { to: 6, duration: CRUCE_MS / 4 },
        { to: -4, duration: CRUCE_MS / 2 },
        { to: 0, duration: CRUCE_MS / 4 }
      ],
      duration: CRUCE_MS,
      ease: 'linear',
      loop: true,
      delay: stagger(CRUCE_MS / MURCIELAGOS)
    })

    return () => { animacion.revert() }
  }, [])

  return (
    <div ref={raizRef} aria-hidden className="decoracion-modo pointer-events-none fixed inset-0 z-30 overflow-hidden">
      <Telarana className="decoracion-modo-tela absolute top-0 left-0 size-24 sm:size-32" />
      <Telarana className="decoracion-modo-tela absolute top-0 right-0 size-24 -scale-x-100 sm:size-32" />
      {Array.from({ length: MURCIELAGOS }, (_, i) => (
        <span
          key={i}
          data-murcielago=""
          // Cada uno a su altura dentro de la banda, para que no vuelen en fila. Sin movimiento quedan ahi.
          style={{ top: `${6 + (i * BANDA_PX) / MURCIELAGOS}px`, left: `${10 + i * 30}vw` }}
          className="decoracion-modo-murcielago absolute block h-4 w-6 sm:h-5 sm:w-8"
        >
          <Murcielago className="size-full" />
        </span>
      ))}
    </div>
  )
}
