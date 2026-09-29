'use client'

import { useRef } from 'react'
import { stagger } from 'animejs'
import { sinHuecos, useSecuenciaDeObra } from './useSecuenciaDeObra'

const COLUMNAS = 6
const FILAS = 4
/** Separacion entre centros de piezas. */
const PASO = 22
/** Lado de cada pieza. */
const LADO = 16
/** Las piezas con color de marca: una diagonal, para que la grilla tenga una direccion. */
const DE_MARCA = new Set([2, 9, 14, 21])

/**
 * De donde llega cada pieza. Fijo y no sorteado en cada montaje: la escena se ve igual cada vez que
 * se repite en el laboratorio, y no depende de `Math.random()` durante el render.
 */
const ORIGENES = Array.from({ length: COLUMNAS * FILAS }, (_, i) => ({
  x: Math.cos(i * 2.39996) * (170 + (i % 5) * 18),
  y: Math.sin(i * 2.39996) * (90 + (i % 3) * 20),
  rotacion: (i % 2 === 0 ? 1 : -1) * (120 + (i % 4) * 60)
}))

/**
 * Piezas que llegan volando desde todos lados, encastran en una grilla, la grilla gira como un
 * bloque, late desde el centro y vuelve a su lugar con un rebote elastico.
 *
 * @returns Escena SVG decorativa; el mensaje accesible pertenece a la bienvenida.
 */
export function EscenaPiezas () {
  const grupoRef = useRef<SVGGElement | null>(null)
  const piezaRefs = useRef<Array<SVGRectElement | null>>([])

  useSecuenciaDeObra((linea) => {
    const grupo = grupoRef.current
    const piezas = sinHuecos(piezaRefs.current)
    const deMarca = piezas.filter((_, i) => DE_MARCA.has(i))

    if (grupo === null) return

    linea.set(piezas, { opacity: 0 }, 0)

    linea.add(piezas, {
      translateX: { from: (_: unknown, i = 0) => ORIGENES[i]?.x ?? 0, to: 0 },
      translateY: { from: (_: unknown, i = 0) => ORIGENES[i]?.y ?? 0, to: 0 },
      rotate: { from: (_: unknown, i = 0) => ORIGENES[i]?.rotacion ?? 0, to: 0 },
      scale: [0.2, 1],
      opacity: [0, 1],
      duration: 820,
      ease: 'outExpo',
      delay: stagger(28, { from: 'random' })
    }, 0)

    // El bloque entero gira y se achica: deja de ser una grilla y pasa a ser un rombo.
    linea.add(grupo, { rotate: [0, 45], scale: [1, 0.82], duration: 620, ease: 'inOutBack(1.6)' }, 1350)
    linea.add(piezas, { scale: [1, 0.25, 1], duration: 640, ease: 'inOutQuad', delay: stagger(36, { grid: [COLUMNAS, FILAS], from: 'center' }) }, 1750)

    linea.add(grupo, { rotate: [45, 0], scale: [0.82, 1], duration: 900, ease: 'outElastic(1, 0.55)' }, 2350)
    linea.add(deMarca, { scale: [1, 1.35, 1], duration: 420, ease: 'inOutQuad', delay: stagger(70) }, 2450)
  })

  return (
    <svg
      viewBox="-120 -60 240 120"
      className="block h-auto max-h-full w-[min(34rem,86vw)] max-w-full"
      aria-hidden="true"
    >
      <g ref={grupoRef} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
        {ORIGENES.map((_, i) => {
          const columna = i % COLUMNAS
          const fila = Math.floor(i / COLUMNAS)
          const x = (columna - (COLUMNAS - 1) / 2) * PASO
          const y = (fila - (FILAS - 1) / 2) * PASO

          return (
            <rect
              key={i}
              ref={(el) => { piezaRefs.current[i] = el }}
              className={DE_MARCA.has(i) ? 'fill-acento' : i % 2 === 0 ? 'fill-texto-tenue' : 'fill-linea-fuerte'}
              x={x - LADO / 2}
              y={y - LADO / 2}
              width={LADO}
              height={LADO}
              rx="3"
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            />
          )
        })}
      </g>
    </svg>
  )
}
