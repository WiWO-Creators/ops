'use client'

import { useRef } from 'react'
import { stagger } from 'animejs'
import { sinHuecos, useSecuenciaDeObra } from './useSecuenciaDeObra'

/** Columnas y filas de la grilla de puntos. */
const COLUMNAS = 23
const FILAS = 9
/** Separacion entre centros de puntos, en unidades del SVG. */
const PASO = 10

/**
 * "OPS" en una tipografia de puntos de 5 x 7. Una fila por renglon, `#` es punto encendido.
 * Va separada por una columna entre letras y centrada en la grilla.
 */
const LETRAS = [
  ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  ['.####', '#....', '#....', '.###.', '....#', '....#', '####.']
]

/** Los puntos de la grilla, con su posicion y si forman parte de las letras. */
const PUNTOS = armarPuntos()

/**
 * Una grilla de puntos que despierta desde el centro, recibe dos olas y termina escribiendo "OPS".
 *
 * Es la idea de la portada de anime.js —muchas piezas que se reordenan en fases— llevada a la
 * bienvenida: la grilla entera late y, de golpe, la mitad se apaga y la otra mitad forma la palabra.
 *
 * @returns Escena SVG decorativa; el mensaje accesible pertenece a la bienvenida.
 */
export function EscenaGrilla () {
  const puntoRefs = useRef<Array<SVGCircleElement | null>>([])
  const letraRefs = useRef<Array<SVGCircleElement | null>>([])

  useSecuenciaDeObra((linea) => {
    const puntos = sinHuecos(puntoRefs.current)
    const letras = sinHuecos(letraRefs.current)
    const apagados = puntos.filter((_, i) => PUNTOS[i]?.letra !== true)
    const grilla = [COLUMNAS, FILAS]

    linea.set(puntos, { scale: 0, opacity: 0 }, 0)
    linea.set(letras, { scale: 0 }, 0)

    // Despierta desde el centro: cada punto espera segun su distancia, que es lo que dibuja el circulo.
    linea.add(puntos, { scale: [0, 1], opacity: [0, 1], duration: 420, ease: 'outBack(2)', delay: stagger(16, { grid: grilla, from: 'center' }) }, 0)

    // Primera ola, radial; la segunda barre de izquierda a derecha para que no se lean iguales.
    linea.add(puntos, { scale: [1, 2.1, 1], duration: 560, ease: 'inOutSine', delay: stagger(22, { grid: grilla, from: 'center' }) }, 620)
    linea.add(puntos, { translateY: [0, -7, 0], duration: 520, ease: 'inOutSine', delay: stagger(26, { grid: grilla, from: 'first', axis: 'x' }) }, 1180)

    // La palabra: lo que no es letra se achica y se apaga, las letras se encienden encima.
    linea.add(apagados, { scale: 0.55, opacity: 0.22, duration: 480, delay: stagger(4, { from: 'random' }) }, 1850)
    linea.add(letras, { scale: [0, 1], duration: 520, ease: 'outBack(3)', delay: stagger(12, { from: 'center' }) }, 1900)
    linea.add(letras, { scale: [1, 1.3, 1], duration: 420, ease: 'inOutQuad', delay: stagger(8) }, 2550)
  })

  return (
    <svg
      viewBox="-120 -60 240 120"
      className="block h-auto max-h-full w-[min(34rem,86vw)] max-w-full"
      aria-hidden="true"
    >
      <g className="fill-texto-sutil">
        {PUNTOS.map((punto, i) => (
          <circle
            key={i}
            ref={(el) => { puntoRefs.current[i] = el }}
            cx={punto.x}
            cy={punto.y}
            r="2"
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          />
        ))}
      </g>
      {/* Las letras van encima y aparte: asi se encienden sin tocar el color del punto de abajo. */}
      <g className="fill-acento">
        {PUNTOS.filter((punto) => punto.letra).map((punto, i) => (
          <circle
            key={i}
            ref={(el) => { letraRefs.current[i] = el }}
            cx={punto.x}
            cy={punto.y}
            r="3.6"
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          />
        ))}
      </g>
    </svg>
  )
}

/**
 * Arma la grilla de puntos marcando cuales dibujan "OPS".
 *
 * @returns un punto por celda, de izquierda a derecha y de arriba hacia abajo
 */
function armarPuntos (): Array<{ x: number, y: number, letra: boolean }> {
  const anchoPalabra = LETRAS.length * 6 - 1
  const desdeColumna = Math.floor((COLUMNAS - anchoPalabra) / 2)
  const encendidos = new Set<number>()

  for (const [indiceLetra, renglones] of LETRAS.entries()) {
    for (const [fila, renglon] of renglones.entries()) {
      for (const [columna, caracter] of [...renglon].entries()) {
        if (caracter !== '#') continue

        encendidos.add((fila + 1) * COLUMNAS + desdeColumna + indiceLetra * 6 + columna)
      }
    }
  }

  return Array.from({ length: COLUMNAS * FILAS }, (_, i) => ({
    x: ((i % COLUMNAS) - (COLUMNAS - 1) / 2) * PASO,
    y: (Math.floor(i / COLUMNAS) - (FILAS - 1) / 2) * PASO,
    letra: encendidos.has(i)
  }))
}
