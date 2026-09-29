'use client'

import { useRef } from 'react'
import { stagger } from 'animejs'
import { Personaje } from './Personaje'
import { sinHuecos, useSecuenciaDeObra } from './useSecuenciaDeObra'

/** Centro de cada columna del tablero y el color del punto de su estado. */
const COLUMNAS = [
  { x: -90, punto: 'fill-texto-sutil' },
  { x: -32, punto: 'fill-acento' },
  { x: 26, punto: 'fill-texto-exito' }
]
const ANCHO_COLUMNA = 50
const ANCHO_TARJETA = 42
/** Altura de cada fila de tarjetas dentro de una columna. */
const FILAS = [-24, -7, 10, 27]

/**
 * Las tarjetas en su lugar final: una columna por estado. `desde` es cuantas columnas mas a la
 * izquierda arranca: la escena las hace caer ahi y despues avanzar hasta donde estan escritas.
 */
const TARJETAS = [
  { columna: 0, fila: 0, desde: 0 },
  { columna: 1, fila: 0, desde: 0 },
  { columna: 1, fila: 1, desde: 1 },
  { columna: 2, fila: 0, desde: 1 },
  { columna: 2, fila: 1, desde: 2 },
  { columna: 2, fila: 2, desde: 1 }
]

/**
 * Un tablero de tareas en movimiento: las columnas aparecen, las tarjetas caen en su estado,
 * alguien del equipo las empuja una columna a la derecha y las que llegan a Completado se marcan.
 *
 * @returns Escena SVG decorativa; el mensaje accesible pertenece a la bienvenida.
 */
export function EscenaTablero () {
  const columnaRefs = useRef<Array<SVGGElement | null>>([])
  const tarjetaRefs = useRef<Array<SVGGElement | null>>([])
  const vistoRefs = useRef<Array<SVGGElement | null>>([])
  const cuerpoRef = useRef<SVGGElement | null>(null)
  const brazoRef = useRef<SVGGElement | null>(null)

  useSecuenciaDeObra((linea) => {
    const columnas = sinHuecos(columnaRefs.current)
    const tarjetas = sinHuecos(tarjetaRefs.current)
    const vistos = sinHuecos(vistoRefs.current)
    const cuerpo = cuerpoRef.current
    const brazo = brazoRef.current

    if (cuerpo === null || brazo === null) return

    const corrimiento = (_: unknown, i = 0) => -(TARJETAS[i]?.desde ?? 0) * (ANCHO_COLUMNA + 8)

    linea.set(tarjetas, { opacity: 0, translateX: corrimiento }, 0)
    linea.set(vistos, { scale: 0 }, 0)

    linea.add(columnas, { opacity: [0, 1], translateY: [12, 0], duration: 420, ease: 'outExpo', delay: stagger(90) }, 0)
    linea.add(cuerpo, { opacity: [0, 1], translateX: [24, 0], duration: 500, ease: 'outExpo' }, 150)

    // Caen en la columna de donde arrancan, no en la final.
    linea.add(tarjetas, { opacity: [0, 1], translateY: [-60, 0], duration: 520, ease: 'outBack(1.4)', delay: stagger(80) }, 350)

    // El empujon: el brazo se estira, el cuerpo acompaña y las tarjetas avanzan en cascada.
    linea.add(brazo, { rotate: [0, -70, -20, -70, 0], duration: 1300, ease: 'inOutSine' }, 1150)
    linea.add(cuerpo, { rotate: [0, -4, 0, -4, 0], duration: 1300, ease: 'inOutSine' }, 1150)
    linea.add(tarjetas, { translateX: 0, duration: 620, ease: 'inOutQuart', delay: stagger(110) }, 1300)

    linea.add(vistos, { scale: [0, 1.25, 1], duration: 420, ease: 'outQuad', delay: stagger(120) }, 2350)
    linea.add(cuerpo, { translateY: [0, -6, 0], duration: 360, ease: 'outQuad' }, 2750)
  })

  return (
    <svg
      viewBox="-120 -60 240 120"
      className="block h-auto max-h-full w-[min(34rem,86vw)] max-w-full"
      aria-hidden="true"
    >
      {COLUMNAS.map((columna, i) => (
        <g key={columna.x} ref={(el) => { columnaRefs.current[i] = el }}>
          <rect
            className="fill-superficie-hundida stroke-linea"
            x={columna.x - ANCHO_COLUMNA / 2}
            y="-48"
            width={ANCHO_COLUMNA}
            height="100"
            rx="6"
            strokeWidth="1"
          />
          <circle className={columna.punto} cx={columna.x - 17} cy="-39" r="2.4" />
          <rect className="fill-linea-fuerte" x={columna.x - 12} y="-40.5" width="22" height="3" rx="1.5" />
        </g>
      ))}

      {TARJETAS.map((tarjeta, i) => {
        const x = (COLUMNAS[tarjeta.columna]?.x ?? 0) - ANCHO_TARJETA / 2
        const y = FILAS[tarjeta.fila] ?? 0
        const completada = tarjeta.columna === 2

        return (
          <g key={i} ref={(el) => { tarjetaRefs.current[i] = el }}>
            <rect className="fill-superficie-elevada stroke-linea" x={x} y={y - 6.5} width={ANCHO_TARJETA} height="13" rx="3" strokeWidth="1" />
            <rect className={completada ? 'fill-texto-exito' : 'fill-acento'} x={x + 4} y={y - 2.5} width="14" height="2" rx="1" />
            <rect className="fill-linea-fuerte" x={x + 4} y={y + 1} width="22" height="2" rx="1" />
            {completada && (
              <g
                ref={(el) => { vistoRefs.current[TARJETAS.slice(0, i).filter((t) => t.columna === 2).length] = el }}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              >
                <circle className="fill-texto-exito" cx={x + ANCHO_TARJETA - 7} cy={y} r="4" />
                <path
                  d={`M${x + ANCHO_TARJETA - 9} ${y}l1.6 1.6l3 -3.2`}
                  className="stroke-superficie"
                  fill="none"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            )}
          </g>
        )
      })}

      <line className="stroke-linea" x1="64" y1="52" x2="118" y2="52" strokeWidth="2" strokeLinecap="round" />
      <Personaje x={88} y={52} mirando="izquierda" camisa="fill-acento" cuerpoRef={cuerpoRef} brazoRef={brazoRef} />
    </svg>
  )
}
