'use client'

import { useRef } from 'react'
import { stagger } from 'animejs'
import { sinHuecos, useSecuenciaDeObra } from './useSecuenciaDeObra'

/** Los bichos que quedaban: donde estan. El fantasma los va aspirando de izquierda a derecha. */
const BICHOS = [
  { x: 22, y: 18 },
  { x: 44, y: 34 },
  { x: 62, y: 14 },
  { x: 80, y: 38 },
  { x: 98, y: 22 }
]
/** Donde empieza el fantasma y donde se queda al terminar. */
const FANTASMA = { desde: -92, hasta: 8, y: 6 }

/**
 * Cazando los ultimos bugs: un fantasma cruza flotando y aspira, uno tras otro, los cinco bichos que
 * quedaban; el contador baja a cero y al final el fantasma guiña un ojo.
 *
 * @returns Escena SVG decorativa; el mensaje accesible pertenece a la bienvenida.
 */
export function EscenaFantasma () {
  const fantasmaRef = useRef<SVGGElement | null>(null)
  const ojosRef = useRef<SVGGElement | null>(null)
  const bichosRef = useRef<Array<SVGGElement | null>>([])
  const contadorRef = useRef<SVGTextElement | null>(null)

  useSecuenciaDeObra((linea) => {
    const fantasma = fantasmaRef.current
    const ojos = ojosRef.current
    const contador = contadorRef.current
    const bichos = sinHuecos(bichosRef.current)

    if (fantasma === null || ojos === null || contador === null) return

    const cuenta = { valor: BICHOS.length }
    contador.textContent = `bugs: ${BICHOS.length}`

    linea.add(bichos, { opacity: [0, 1], scale: [0.4, 1], duration: 360, ease: 'outBack(2)', delay: stagger(70) }, 0)
    linea.add(fantasma, { opacity: [0, 1], translateX: [FANTASMA.desde, FANTASMA.hasta], duration: 2000, ease: 'inOutSine' }, 300)
    // Cada bicho sale hacia el fantasma cuando este le pasa por al lado.
    linea.add(bichos, {
      translateX: (_: unknown, i = 0) => -(BICHOS[i]?.x ?? 0) + FANTASMA.hasta + 14,
      translateY: (_: unknown, i = 0) => FANTASMA.y - (BICHOS[i]?.y ?? 0),
      scale: [1, 0.1],
      opacity: [1, 0],
      duration: 420,
      ease: 'inQuad',
      delay: stagger(300)
    }, 900)
    linea.add(cuenta, {
      valor: 0,
      duration: 1500,
      ease: 'linear',
      onUpdate: () => { contador.textContent = `bugs: ${Math.ceil(cuenta.valor)}` }
    }, 900)
    // El guiño: los ojos se cierran un instante.
    linea.add(ojos, { scaleY: [1, 0.1, 1], duration: 360, ease: 'inOutSine' }, 2700)
    linea.add(fantasma, { translateY: [{ to: -6, duration: 220 }, { to: 0, duration: 260 }] }, 2700)
  })

  return (
    <svg viewBox="-120 -60 240 120" className="block h-auto max-h-full w-[min(34rem,86vw)] max-w-full" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <text ref={contadorRef} className="fill-texto-tenue" x="0" y="-38" fontSize="10" fontWeight="600" textAnchor="middle">bugs: {BICHOS.length}</text>
      {BICHOS.map((b, i) => (
        <g key={i} ref={(el) => { bichosRef.current[i] = el }} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
          <ellipse className="fill-texto-peligro" cx={b.x} cy={b.y} rx="5" ry="3.4" />
          <path className="stroke-texto-peligro" d={`M${b.x - 4} ${b.y - 2} l-4 -3 M${b.x + 4} ${b.y - 2} l4 -3 M${b.x - 4} ${b.y + 2} l-4 3 M${b.x + 4} ${b.y + 2} l4 3`} strokeWidth="1.2" />
        </g>
      ))}
      <g transform={`translate(0 ${FANTASMA.y})`}>
      <g ref={fantasmaRef} style={{ transform: `translateX(${FANTASMA.desde}px)`, opacity: 0 }}>
        <path
          d="M-14 8 L-14 -10 C-14 -26 14 -26 14 -10 L14 8 L9 4 L4.5 8 L0 4 L-4.5 8 L-9 4 Z"
          fill="#F4EEFF"
          stroke="#C9A0FF"
          strokeWidth="1.6"
        />
        <g ref={ojosRef} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
          <circle cx="-5" cy="-11" r="2" fill="#2A1A3D" />
          <circle cx="5" cy="-11" r="2" fill="#2A1A3D" />
        </g>
        <ellipse cx="0" cy="-4" rx="2.4" ry="3" fill="#2A1A3D" />
      </g>
      </g>
      <line className="stroke-linea" x1="-100" y1="52" x2="100" y2="52" strokeWidth="2" />
    </svg>
  )
}
