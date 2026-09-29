'use client'

import { useRef } from 'react'
import { stagger, svg } from 'animejs'
import { Personaje } from './Personaje'
import { sinHuecos, useSecuenciaDeObra } from './useSecuenciaDeObra'

/** Centro y radio del cronometro. */
const RELOJ = { x: -58, y: 2, radio: 34 }
/** Las horas que cuenta la jornada. */
const HORAS = 8
/** Las tareas en que se reparten las horas, apiladas sobre el escritorio de abajo hacia arriba. */
const TAREAS = [
  { y: 14, ancho: 34, color: 'fill-acento' },
  { y: 3, ancho: 28, color: 'fill-texto-tenue' },
  { y: -8, ancho: 31, color: 'fill-texto-exito' }
]
/** Borde izquierdo de la pila de tareas. */
const PILA_X = 16

/**
 * Una jornada de trabajo: el cronometro llena su vuelta mientras cuenta las horas, cada tramo sale
 * volando convertido en una tarea que se apila en el escritorio, y al cerrar la jornada el reloj se
 * marca y la persona se estira.
 *
 * @returns Escena SVG decorativa; el mensaje accesible pertenece a la bienvenida.
 */
export function EscenaJornada () {
  const relojRef = useRef<SVGGElement | null>(null)
  const avanceRef = useRef<SVGCircleElement | null>(null)
  const agujaRef = useRef<SVGGElement | null>(null)
  const horasRef = useRef<SVGTextElement | null>(null)
  const tareaRefs = useRef<Array<SVGRectElement | null>>([])
  const cierreRef = useRef<SVGGElement | null>(null)
  const escritorioRef = useRef<SVGGElement | null>(null)
  const cuerpoRef = useRef<SVGGElement | null>(null)
  const brazoRef = useRef<SVGGElement | null>(null)

  useSecuenciaDeObra((linea) => {
    const reloj = relojRef.current
    const avance = avanceRef.current
    const aguja = agujaRef.current
    const horas = horasRef.current
    const cierre = cierreRef.current
    const escritorio = escritorioRef.current
    const cuerpo = cuerpoRef.current
    const brazo = brazoRef.current
    const tareas = sinHuecos(tareaRefs.current)

    if (reloj === null || avance === null || aguja === null || horas === null || cierre === null) return
    if (escritorio === null || cuerpo === null || brazo === null) return

    const contador = { valor: 0 }
    horas.textContent = '0 h'

    linea.set(tareas, { opacity: 0 }, 0)
    linea.set(cierre, { scale: 0 }, 0)

    linea.add(reloj, { scale: [0.4, 1], opacity: [0, 1], duration: 560, ease: 'outBack(1.8)' }, 0)
    linea.add([escritorio, cuerpo], { opacity: [0, 1], translateY: [10, 0], duration: 460, ease: 'outExpo', delay: stagger(80) }, 120)

    const inicio = 400
    const duracion = 1900
    linea.add(svg.createDrawable(avance), { draw: ['0 0', '0 1'], duration: duracion, ease: 'inOutSine' }, inicio)
    linea.add(aguja, { rotate: [0, 360], duration: duracion, ease: 'inOutSine' }, inicio)
    linea.add(contador, {
      valor: HORAS,
      duration: duracion,
      ease: 'inOutSine',
      onUpdate: () => { horas.textContent = `${Math.round(contador.valor)} h` }
    }, inicio)

    // Cada tramo de horas sale del reloj y aterriza como tarea sobre la pila.
    linea.add(tareas, {
      opacity: [0, 1],
      translateX: { from: RELOJ.x - PILA_X - 15, to: 0 },
      translateY: { from: (_: unknown, i = 0) => RELOJ.y - (TAREAS[i]?.y ?? 0), to: 0 },
      scale: [0.3, 1],
      duration: 560,
      ease: 'outQuart',
      delay: stagger(560)
    }, 700)

    linea.add(cierre, { scale: [0, 1.3, 1], duration: 440, ease: 'outQuad' }, inicio + duracion + 20)
    linea.add(brazo, { rotate: [0, -140, -120, -140, 0], duration: 900, ease: 'inOutSine' }, inicio + duracion + 80)
    linea.add(cuerpo, { scaleY: [1, 1.05, 1], duration: 900, ease: 'inOutSine' }, inicio + duracion + 80)
  })

  return (
    <svg
      viewBox="-120 -60 240 120"
      className="block h-auto max-h-full w-[min(34rem,86vw)] max-w-full"
      fill="none"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <g ref={relojRef} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
        <rect className="fill-texto-tenue" x={RELOJ.x - 4} y={RELOJ.y - RELOJ.radio - 9} width="8" height="5" rx="1.5" />
        <circle className="fill-superficie-elevada stroke-linea" cx={RELOJ.x} cy={RELOJ.y} r={RELOJ.radio} strokeWidth="5" />
        <circle
          ref={avanceRef}
          className="stroke-acento"
          cx={RELOJ.x}
          cy={RELOJ.y}
          r={RELOJ.radio}
          strokeWidth="5"
          transform={`rotate(-90 ${RELOJ.x} ${RELOJ.y})`}
        />
        {/* El circulo invisible centra la caja de la aguja en el reloj, que es donde tiene que girar. */}
        <g ref={agujaRef} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
          <circle cx={RELOJ.x} cy={RELOJ.y} r="24" />
          <line className="stroke-texto" x1={RELOJ.x} y1={RELOJ.y} x2={RELOJ.x} y2={RELOJ.y - 22} strokeWidth="2.5" />
        </g>
        <circle className="fill-texto" cx={RELOJ.x} cy={RELOJ.y} r="3" />
        <text ref={horasRef} className="fill-texto-tenue" x={RELOJ.x} y={RELOJ.y + 18} fontSize="9" fontWeight="600" textAnchor="middle">
          {HORAS} h
        </text>
        <g ref={cierreRef} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
          <circle className="fill-texto-exito" cx={RELOJ.x + 26} cy={RELOJ.y - 26} r="8" />
          <path
            className="stroke-superficie"
            d={`M${RELOJ.x + 22} ${RELOJ.y - 26}l3 3l5 -6`}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </g>
      </g>

      <g ref={escritorioRef}>
        <line className="stroke-texto-tenue" x1="8" y1="21" x2="80" y2="21" strokeWidth="2.5" />
        <line className="stroke-texto-tenue" x1="14" y1="21" x2="14" y2="52" strokeWidth="2" />
        <line className="stroke-texto-tenue" x1="74" y1="21" x2="74" y2="52" strokeWidth="2" />
        <rect className="fill-superficie-elevada stroke-texto-tenue" x="54" y="4" width="22" height="14" rx="2" strokeWidth="1.6" />
        <line className="stroke-texto-tenue" x1="50" y1="19" x2="78" y2="19" strokeWidth="2" />
      </g>

      {TAREAS.map((tarea, i) => (
        <rect
          key={i}
          ref={(el) => { tareaRefs.current[i] = el }}
          className={tarea.color}
          x={PILA_X}
          y={tarea.y - 4.5}
          width={tarea.ancho}
          height="9"
          rx="3"
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        />
      ))}

      <line className="stroke-linea" x1="6" y1="52" x2="118" y2="52" strokeWidth="2" />
      <Personaje x={98} y={52} mirando="izquierda" camisa="fill-acento" cuerpoRef={cuerpoRef} brazoRef={brazoRef} />
    </svg>
  )
}
