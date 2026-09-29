'use client'

import { useRef } from 'react'
import { stagger, svg } from 'animejs'
import { sinHuecos, useSecuenciaDeObra } from './useSecuenciaDeObra'

/** Las tres orbitas: radio, cuantos satelites lleva y cuantos grados gira durante la escena. */
const ORBITAS = [
  { radio: 22, satelites: 2, giro: 540 },
  { radio: 36, satelites: 3, giro: -360 },
  { radio: 50, satelites: 4, giro: 270 }
]

/** Los satelites ya ubicados, con la orbita a la que pertenecen. El primero de cada una es de marca. */
const SATELITES = ORBITAS.flatMap((orbita, i) => Array.from({ length: orbita.satelites }, (_, j) => {
  const angulo = (j / orbita.satelites) * Math.PI * 2 + i

  return { orbita: i, x: Math.cos(angulo) * orbita.radio, y: Math.sin(angulo) * orbita.radio, destacado: j === 0 }
}))

/**
 * Tres orbitas que se trazan de a una, sus satelites giran a velocidades distintas y el nucleo da
 * media vuelta antes de que todo el sistema se contraiga y estalle hacia afuera.
 *
 * Los grupos de satelites giran alrededor del origen del SVG, que es el centro del encuadre: por eso
 * no llevan `transformBox` propio y el nucleo si.
 *
 * @returns Escena SVG decorativa; el mensaje accesible pertenece a la bienvenida.
 */
export function EscenaOrbitas () {
  const anilloRefs = useRef<Array<SVGCircleElement | null>>([])
  const giroRefs = useRef<Array<SVGGElement | null>>([])
  const sateliteRefs = useRef<Array<SVGCircleElement | null>>([])
  const nucleoRef = useRef<SVGRectElement | null>(null)

  useSecuenciaDeObra((linea) => {
    const anillos = sinHuecos(anilloRefs.current)
    const giros = sinHuecos(giroRefs.current)
    const satelites = sinHuecos(sateliteRefs.current)
    const nucleo = nucleoRef.current

    if (nucleo === null) return

    linea.set(satelites, { scale: 0 }, 0)
    linea.set(nucleo, { scale: 0 }, 0)

    linea.add(svg.createDrawable(anillos), { draw: ['0 0', '0 1'], duration: 700, ease: 'inOutQuad', delay: stagger(160) }, 0)
    linea.add(nucleo, { scale: [0, 1], rotate: [-90, 0], duration: 800, ease: 'outElastic(1, 0.5)' }, 200)
    linea.add(satelites, { scale: [0, 1], duration: 360, ease: 'outBack(3)', delay: stagger(50) }, 450)

    for (const [i, giro] of giros.entries()) {
      linea.add(giro, { rotate: [0, ORBITAS[i]?.giro ?? 360], duration: 2300, ease: 'inOutQuart' }, 400)
    }

    linea.add(nucleo, { rotate: [0, 225], scale: [1, 1.5, 1], duration: 900, ease: 'inOutBack(1.4)' }, 1400)

    // Contraccion y estallido: todo el sistema se encoge un instante y sale disparado hacia afuera.
    linea.add(anillos, { scale: [1, 0.72, 1.1, 1], duration: 760, ease: 'inOutQuad', delay: stagger(40, { reversed: true }) }, 2250)
    linea.add(satelites, { scale: [1, 2.2, 1], duration: 600, ease: 'outQuad', delay: stagger(20) }, 2450)
  })

  return (
    <svg
      viewBox="-120 -60 240 120"
      className="block h-auto max-h-full w-[min(34rem,86vw)] max-w-full"
      fill="none"
      aria-hidden="true"
    >
      <g className="stroke-linea-fuerte" strokeWidth="1.5">
        {ORBITAS.map((orbita, i) => (
          <circle
            key={orbita.radio}
            ref={(el) => { anilloRefs.current[i] = el }}
            r={orbita.radio}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          />
        ))}
      </g>

      {ORBITAS.map((orbita, i) => (
        <g key={orbita.radio} ref={(el) => { giroRefs.current[i] = el }}>
          {SATELITES.map((satelite, indice) => satelite.orbita === i && (
            <circle
              key={indice}
              ref={(el) => { sateliteRefs.current[indice] = el }}
              className={satelite.destacado ? 'fill-acento' : 'fill-texto-tenue'}
              cx={satelite.x}
              cy={satelite.y}
              r={satelite.destacado ? 4 : 2.6}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            />
          ))}
        </g>
      ))}

      <rect
        ref={nucleoRef}
        className="fill-acento"
        x="-8"
        y="-8"
        width="16"
        height="16"
        rx="4"
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      />
    </svg>
  )
}
