'use client'

import { useRef } from 'react'
import { stagger } from 'animejs'
import { sinHuecos, useSecuenciaDeObra } from './useSecuenciaDeObra'

/** Donde empieza la zona de barras, a la derecha de los nombres de las filas. */
const INICIO = -78
/** Ancho de un dia. */
const DIA = 14
/** Las barras: dia de inicio, cuantos dias dura y si es de marca. Una fila por tarea. */
const BARRAS = [
  { desde: 0, dias: 4, marca: true },
  { desde: 2, dias: 5, marca: false },
  { desde: 5, dias: 3, marca: true },
  { desde: 6, dias: 6, marca: false },
  { desde: 9, dias: 4, marca: true }
]
const PASO_FILA = 18
const PRIMERA_FILA = -34
/** Hasta que dia avanza la linea de hoy. Los hitos que quedan antes se encienden al pasar. */
const HOY = 10

/**
 * El Gantt de un proyecto: la cuadricula de dias, las barras de las tareas estirandose en
 * cascada con sus dependencias, y la linea de hoy recorriendolas mientras los hitos se cumplen.
 *
 * @returns Escena SVG decorativa; el mensaje accesible pertenece a la bienvenida.
 */
export function EscenaGantt () {
  const cuadriculaRef = useRef<SVGGElement | null>(null)
  const nombreRefs = useRef<Array<SVGRectElement | null>>([])
  const barraRefs = useRef<Array<SVGRectElement | null>>([])
  const hitoRefs = useRef<Array<SVGGElement | null>>([])
  const enlaceRefs = useRef<Array<SVGPathElement | null>>([])
  const hoyRef = useRef<SVGGElement | null>(null)

  useSecuenciaDeObra((linea) => {
    const cuadricula = cuadriculaRef.current
    const hoy = hoyRef.current
    const nombres = sinHuecos(nombreRefs.current)
    const barras = sinHuecos(barraRefs.current)
    const hitos = sinHuecos(hitoRefs.current)
    const enlaces = sinHuecos(enlaceRefs.current)

    if (cuadricula === null || hoy === null) return

    linea.set(barras, { scaleX: 0 }, 0)
    linea.set([...hitos, ...enlaces], { opacity: 0 }, 0)
    linea.set(hoy, { translateX: -HOY * DIA, opacity: 0 }, 0)

    linea.add(cuadricula, { opacity: [0, 1], duration: 400 }, 0)
    linea.add(nombres, { scaleX: [0, 1], duration: 380, ease: 'outExpo', delay: stagger(60) }, 100)
    linea.add(barras, { scaleX: [0, 1], duration: 560, ease: 'outExpo', delay: stagger(150) }, 350)
    linea.add(enlaces, { opacity: [0, 1], duration: 260, delay: stagger(150) }, 700)

    // La linea de hoy barre los dias; cada hito se enciende en el instante en que ella lo pasa.
    const inicioHoy = 1350
    const duracionHoy = 1300
    linea.add(hoy, { opacity: [0, 1], duration: 200 }, inicioHoy)
    linea.add(hoy, { translateX: 0, duration: duracionHoy, ease: 'inOutSine' }, inicioHoy)

    for (const [i, hito] of hitos.entries()) {
      const barra = BARRAS[i]

      if (barra === undefined) continue

      const fin = barra.desde + barra.dias
      const instante = inicioHoy + (Math.min(fin, HOY) / HOY) * duracionHoy

      linea.add(hito, { opacity: [0, 1], scale: [0, 1.5, 1], duration: 380, ease: 'outQuad' }, instante)
    }
  })

  return (
    <svg
      viewBox="-120 -60 240 120"
      className="block h-auto max-h-full w-[min(34rem,86vw)] max-w-full"
      aria-hidden="true"
    >
      <g ref={cuadriculaRef} className="stroke-linea-suave" strokeWidth="1">
        {Array.from({ length: 14 }, (_, dia) => (
          <line key={dia} x1={INICIO + dia * DIA} y1="-50" x2={INICIO + dia * DIA} y2="52" />
        ))}
        <line className="stroke-linea" x1="-116" y1="-46" x2="116" y2="-46" />
      </g>

      {BARRAS.map((barra, i) => {
        const y = PRIMERA_FILA + i * PASO_FILA
        const x = INICIO + barra.desde * DIA
        const ancho = barra.dias * DIA - 3

        return (
          <g key={i}>
            <rect
              ref={(el) => { nombreRefs.current[i] = el }}
              className="fill-linea-fuerte"
              x="-114"
              y={y - 2}
              width={22 + (i % 3) * 6}
              height="4"
              rx="2"
              style={{ transformBox: 'fill-box', transformOrigin: '0% 50%' }}
            />
            <rect
              ref={(el) => { barraRefs.current[i] = el }}
              className={barra.marca ? 'fill-acento' : 'fill-texto-tenue'}
              x={x}
              y={y - 5}
              width={ancho}
              height="10"
              rx="3"
              style={{ transformBox: 'fill-box', transformOrigin: '0% 50%' }}
            />
            {/* El rombo gira por atributo y el grupo escala por CSS: si fueran el mismo elemento, el
                `transform` que anima anime.js borraria la rotacion. */}
            <g ref={(el) => { hitoRefs.current[i] = el }} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
              <rect
                className="fill-superficie stroke-acento"
                x={x + ancho - 3.5}
                y={y - 3.5}
                width="7"
                height="7"
                rx="1"
                strokeWidth="1.6"
                transform={`rotate(45 ${x + ancho} ${y})`}
              />
            </g>
            {i > 0 && (
              <path
                ref={(el) => { enlaceRefs.current[i - 1] = el }}
                className="stroke-texto-sutil"
                d={`M${INICIO + (BARRAS[i - 1]?.desde ?? 0) * DIA + 6} ${y - PASO_FILA + 5}v${PASO_FILA - 10}h${Math.max(0, x - INICIO - (BARRAS[i - 1]?.desde ?? 0) * DIA - 6)}`}
                fill="none"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            )}
          </g>
        )
      })}

      <g ref={hoyRef}>
        <line className="stroke-texto-peligro" x1={INICIO + HOY * DIA} y1="-50" x2={INICIO + HOY * DIA} y2="54" strokeWidth="1.6" />
        <circle className="fill-texto-peligro" cx={INICIO + HOY * DIA} cy="-50" r="3" />
      </g>
    </svg>
  )
}
