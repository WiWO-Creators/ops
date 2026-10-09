'use client'

import { useRef } from 'react'
import { stagger } from 'animejs'
import { Personaje } from './Personaje'
import { sinHuecos, useSecuenciaDeObra } from './useSecuenciaDeObra'

const POCION = '#7A3FB0'
/** Las burbujas: donde nacen dentro del caldero y cuanto suben. */
const BURBUJAS = [
  { x: -14, r: 4, sube: 30 },
  { x: -2, r: 5.5, sube: 40 },
  { x: 11, r: 3.5, sube: 34 },
  { x: 4, r: 3, sube: 26 },
  { x: -9, r: 3, sube: 24 }
]

/**
 * Cocinando la actualizacion: una persona revuelve un caldero que burbujea, una tarjeta cae adentro,
 * la pocion brilla y del caldero sube una marca de listo.
 *
 * @returns Escena SVG decorativa; el mensaje accesible pertenece a la bienvenida.
 */
export function EscenaCaldero () {
  const calderoRef = useRef<SVGGElement | null>(null)
  const pocionRef = useRef<SVGEllipseElement | null>(null)
  const burbujasRef = useRef<Array<SVGCircleElement | null>>([])
  const tarjetaRef = useRef<SVGRectElement | null>(null)
  const listoRef = useRef<SVGGElement | null>(null)
  const cuerpoRef = useRef<SVGGElement | null>(null)
  const brazoRef = useRef<SVGGElement | null>(null)

  useSecuenciaDeObra((linea) => {
    const caldero = calderoRef.current
    const pocion = pocionRef.current
    const tarjeta = tarjetaRef.current
    const listo = listoRef.current
    const cuerpo = cuerpoRef.current
    const brazo = brazoRef.current
    const burbujas = sinHuecos(burbujasRef.current)

    if (caldero === null || pocion === null || tarjeta === null || listo === null || cuerpo === null || brazo === null) return

    linea.set(burbujas, { opacity: 0 }, 0)
    linea.set(tarjeta, { opacity: 0 }, 0)
    linea.set(listo, { scale: 0, opacity: 0 }, 0)

    linea.add([caldero, cuerpo], { opacity: [0, 1], translateY: [12, 0], duration: 480, ease: 'outExpo', delay: stagger(90) }, 0)
    // Revolver: el brazo va y viene todo el rato, mientras suben las burbujas.
    linea.add(brazo, { rotate: [-30, 30, -30, 30, -30], duration: 2000, ease: 'inOutSine' }, 450)
    linea.add(burbujas, {
      opacity: [{ to: 0.9, duration: 120 }, { to: 0, duration: 520 }],
      translateY: (_: unknown, i = 0) => [0, -(BURBUJAS[i]?.sube ?? 28)],
      duration: 760,
      ease: 'outQuad',
      delay: stagger(200)
    }, 600)
    linea.add(tarjeta, { opacity: [0, 1, 1, 0], translateY: [-46, 0], scale: [1, 1, 1, 0.3], duration: 760, ease: 'inQuad' }, 1500)
    linea.add(pocion, { fill: [POCION, '#C9A0FF', POCION], duration: 700, ease: 'inOutSine' }, 2200)
    linea.add(listo, { scale: [0, 1.25, 1], opacity: [0, 1], translateY: [8, -6], duration: 520, ease: 'outBack(2)' }, 2250)
  })

  return (
    <svg viewBox="-120 -60 240 120" className="block h-auto max-h-full w-[min(34rem,86vw)] max-w-full" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g ref={calderoRef} style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}>
        <line className="stroke-texto-tenue" x1="-22" y1="46" x2="-26" y2="52" strokeWidth="3" />
        <line className="stroke-texto-tenue" x1="22" y1="46" x2="26" y2="52" strokeWidth="3" />
        <path fill="#2A1F38" stroke="#8A6FB0" d="M-34 6 C-40 30 -30 46 0 46 C30 46 40 30 34 6 Z" strokeWidth="2" />
        <ellipse fill="#2A1F38" stroke="#8A6FB0" cx="0" cy="6" rx="34" ry="8" strokeWidth="2" />
        <ellipse ref={pocionRef} cx="0" cy="6" rx="29" ry="5.5" fill={POCION} />
        {BURBUJAS.map((b, i) => (
          <circle key={i} ref={(el) => { burbujasRef.current[i] = el }} cx={b.x} cy="5" r={b.r} fill="#C9A0FF" />
        ))}
      </g>
      <rect ref={tarjetaRef} className="fill-acento" x="-9" y="-30" width="18" height="12" rx="3" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
      <g ref={listoRef} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
        <circle className="fill-texto-exito" cx="0" cy="-34" r="9" />
        <path className="stroke-superficie" d="M-4 -34 l3 3 l6 -7" strokeWidth="2.2" />
      </g>
      <line className="stroke-linea" x1="-100" y1="52" x2="100" y2="52" strokeWidth="2" />
      <Personaje x={-62} y={52} mirando="derecha" camisa="fill-acento" cuerpoRef={cuerpoRef} brazoRef={brazoRef} />
    </svg>
  )
}
