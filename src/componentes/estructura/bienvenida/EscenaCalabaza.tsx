'use client'

import { useRef } from 'react'
import { stagger } from 'animejs'
import { sinHuecos, useSecuenciaDeObra } from './useSecuenciaDeObra'

/** Colores de la calabaza con su respaldo: el laboratorio muestra la escena aunque el modo este apagado. */
const CUERPO = 'var(--calabaza, #FF7A00)'
const SOMBRA = 'var(--calabaza-sombra, #B34700)'
const TALLO = 'var(--calabaza-tallo, #3F7D1F)'
const CARA = 'var(--calabaza-cara, #2A1A00)'

/** Hacia donde sale volando cada murcielago al terminar de tallar. */
const MURCIELAGOS = [
  { x: -78, y: -48 },
  { x: 8, y: -62 },
  { x: 84, y: -40 }
]

/**
 * Tallando la novedad: una calabaza se queda sin cara, le van apareciendo los ojos y la boca como si
 * los tallaran, se enciende la vela por dentro y de la boca salen tres murcielagos.
 *
 * @returns Escena SVG decorativa; el mensaje accesible pertenece a la bienvenida.
 */
export function EscenaCalabaza () {
  const cuerpoRef = useRef<SVGGElement | null>(null)
  const talloRef = useRef<SVGPathElement | null>(null)
  const carasRef = useRef<Array<SVGPathElement | null>>([])
  const luzRef = useRef<SVGCircleElement | null>(null)
  const murcielagosRef = useRef<Array<SVGGElement | null>>([])

  useSecuenciaDeObra((linea) => {
    const cuerpo = cuerpoRef.current
    const tallo = talloRef.current
    const luz = luzRef.current
    const caras = sinHuecos(carasRef.current)
    const murcielagos = sinHuecos(murcielagosRef.current)

    if (cuerpo === null || tallo === null || luz === null) return

    linea.set(caras, { scale: 0, opacity: 0 }, 0)
    linea.set(luz, { opacity: 0 }, 0)
    linea.set(murcielagos, { opacity: 0 }, 0)

    linea.add(cuerpo, { scale: [0.6, 1], opacity: [0, 1], duration: 620, ease: 'outBack(1.6)' }, 0)
    linea.add(tallo, { rotate: [0, -8, 6, 0], duration: 700, ease: 'inOutSine' }, 500)
    // Ojos y boca aparecen de a uno, rapido: el que talla no se detiene.
    linea.add(caras, { scale: [0, 1], opacity: [0, 1], duration: 260, ease: 'outBack(2)', delay: stagger(240) }, 900)
    linea.add(luz, { opacity: [0, 0.85], scale: [0.7, 1.08], duration: 700, ease: 'outQuad' }, 1900)
    linea.add(murcielagos, {
      opacity: [0, 1],
      translateX: { from: 0, to: (_: unknown, i = 0) => MURCIELAGOS[i]?.x ?? 0 },
      translateY: { from: 18, to: (_: unknown, i = 0) => MURCIELAGOS[i]?.y ?? 0 },
      duration: 1100,
      ease: 'outQuart',
      delay: stagger(140)
    }, 2150)
  })

  return (
    <svg viewBox="-120 -60 240 120" className="block h-auto max-h-full w-[min(34rem,86vw)] max-w-full" fill="none" aria-hidden="true">
      <circle ref={luzRef} cx="0" cy="14" r="46" fill="rgb(255 154 61 / 0.35)" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
      <g ref={cuerpoRef} style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}>
        <path ref={talloRef} d="M0 -18 C0 -30 8 -34 16 -34" stroke={TALLO} strokeWidth="7" strokeLinecap="round" style={{ transformBox: 'fill-box', transformOrigin: '0% 100%' }} />
        <ellipse cx="0" cy="14" rx="44" ry="36" fill={CUERPO} />
        <ellipse cx="-24" cy="14" rx="14" ry="34" fill={SOMBRA} opacity="0.35" />
        <ellipse cx="24" cy="14" rx="14" ry="34" fill={SOMBRA} opacity="0.35" />
        <ellipse cx="0" cy="14" rx="9" ry="36" fill={SOMBRA} opacity="0.25" />
        {[
          'M-26 4 L-10 4 L-18 -10 Z',
          'M10 4 L26 4 L18 -10 Z',
          'M-28 28 L-18 36 L-10 28 L0 38 L10 28 L18 36 L28 28 L24 42 L-24 42 Z'
        ].map((d, i) => (
          <path key={d} ref={(el) => { carasRef.current[i] = el }} d={d} fill={CARA} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
        ))}
      </g>
      {MURCIELAGOS.map((_, i) => (
        <g key={i} ref={(el) => { murcielagosRef.current[i] = el }} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
          <path className="fill-texto-tenue" transform="translate(-9 24) scale(0.75)" d="M12 2 C10 6 6 6 1 4 C3 8 3 12 8 13 C9 11 11 11 12 13 C13 11 15 11 16 13 C21 12 21 8 23 4 C18 6 14 6 12 2 Z" />
        </g>
      ))}
      <line className="stroke-linea" x1="-100" y1="52" x2="100" y2="52" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
