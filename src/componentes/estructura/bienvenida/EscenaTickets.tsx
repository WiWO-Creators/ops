'use client'

import { useRef } from 'react'
import { stagger } from 'animejs'
import { Personaje } from './Personaje'
import { sinHuecos, useSecuenciaDeObra } from './useSecuenciaDeObra'

/** El equipo que atiende la bandeja: donde esta parado y el color de su camisa. */
const EQUIPO = [
  { x: 52, camisa: 'fill-acento' },
  { x: 78, camisa: 'fill-texto-exito' },
  { x: 104, camisa: 'fill-texto-aviso' }
]
/** Escala de los personajes: tres personas completas no entran a tamaño normal. */
const ESCALA_EQUIPO = 0.8
/** Altura de la cabeza de los personajes, de donde sale cada asignacion. */
const ALTURA_CABEZA = 52 - 42 * ESCALA_EQUIPO
/** Los tickets de la bandeja: prioridad y a quien del equipo le toca. */
const TICKETS = [
  { prioridad: 'fill-texto-peligro', persona: 0 },
  { prioridad: 'fill-texto-aviso', persona: 2 },
  { prioridad: 'fill-acento', persona: 1 },
  { prioridad: 'fill-texto-sutil', persona: 0 }
]
const PRIMERA_FILA = -26
const PASO_FILA = 19
/** Donde va el punto del responsable en cada fila. */
const X_RESPONSABLE = 18

/**
 * La bandeja de tickets: los mensajes llegan volando desde afuera, se acomodan por prioridad y
 * cada persona del equipo levanta la mano y se asigna el suyo.
 *
 * @returns Escena SVG decorativa; el mensaje accesible pertenece a la bienvenida.
 */
export function EscenaTickets () {
  const bandejaRef = useRef<SVGGElement | null>(null)
  const ticketRefs = useRef<Array<SVGGElement | null>>([])
  const prioridadRefs = useRef<Array<SVGCircleElement | null>>([])
  const responsableRefs = useRef<Array<SVGCircleElement | null>>([])
  const cuerpoRefs = useRef<Array<SVGGElement | null>>([])
  const brazoRefs = useRef<Array<SVGGElement | null>>([])

  useSecuenciaDeObra((linea) => {
    const bandeja = bandejaRef.current
    const tickets = sinHuecos(ticketRefs.current)
    const prioridades = sinHuecos(prioridadRefs.current)
    const responsables = sinHuecos(responsableRefs.current)
    const cuerpos = sinHuecos(cuerpoRefs.current)
    const brazos = brazoRefs.current

    if (bandeja === null) return

    linea.set(tickets, { opacity: 0 }, 0)
    linea.set([...prioridades, ...responsables], { scale: 0 }, 0)

    linea.add(bandeja, { opacity: [0, 1], scale: [0.9, 1], duration: 420, ease: 'outExpo' }, 0)
    linea.add(cuerpos, { opacity: [0, 1], translateY: [14, 0], duration: 460, ease: 'outBack(1.6)', delay: stagger(90) }, 150)

    // Llegan desde afuera, torcidos, y se enderezan al caer en su fila.
    linea.add(tickets, {
      opacity: [0, 1],
      translateX: [-90, 0],
      translateY: { from: (_: unknown, i = 0) => (i % 2 === 0 ? -24 : 24), to: 0 },
      rotate: { from: (_: unknown, i = 0) => (i % 2 === 0 ? -14 : 12), to: 0 },
      duration: 620,
      ease: 'outQuart',
      delay: stagger(130)
    }, 400)
    linea.add(prioridades, { scale: [0, 1.4, 1], duration: 320, ease: 'outQuad', delay: stagger(90) }, 1150)

    // Cada asignacion sale de la cabeza de quien la toma, en el mismo instante en que levanta la mano.
    const inicio = 1650
    const paso = 260

    for (const [i, responsable] of responsables.entries()) {
      const ticket = TICKETS[i]
      const persona = ticket === undefined ? undefined : EQUIPO[ticket.persona]
      const brazo = ticket === undefined ? null : brazos[ticket.persona] ?? null

      if (ticket === undefined || persona === undefined) continue

      const instante = inicio + i * paso
      const filaY = PRIMERA_FILA + i * PASO_FILA

      if (brazo !== null) linea.add(brazo, { rotate: [0, -130, 0], duration: 520, ease: 'inOutSine' }, instante - 120)

      linea.add(responsable, {
        scale: [0.6, 1],
        translateX: [persona.x - X_RESPONSABLE, 0],
        translateY: [ALTURA_CABEZA - filaY, 0],
        duration: 520,
        ease: 'inOutQuart'
      }, instante)
    }
  })

  return (
    <svg
      viewBox="-120 -60 240 120"
      className="block h-auto max-h-full w-[min(34rem,86vw)] max-w-full"
      aria-hidden="true"
    >
      <g ref={bandejaRef} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
        <rect className="fill-superficie-hundida stroke-linea" x="-72" y="-50" width="104" height="100" rx="7" strokeWidth="1" />
        <rect className="fill-linea-fuerte" x="-64" y="-43" width="30" height="3.5" rx="1.75" />
        <rect className="fill-acento" x="16" y="-45" width="10" height="7" rx="3.5" />
      </g>

      {TICKETS.map((ticket, i) => {
        const y = PRIMERA_FILA + i * PASO_FILA

        return (
          <g key={i} ref={(el) => { ticketRefs.current[i] = el }} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
            <rect className="fill-superficie-elevada stroke-linea" x="-66" y={y - 7.5} width="92" height="15" rx="4" strokeWidth="1" />
            <circle
              ref={(el) => { prioridadRefs.current[i] = el }}
              className={ticket.prioridad}
              cx="-58"
              cy={y}
              r="2.6"
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            />
            <rect className="fill-linea-fuerte" x="-51" y={y - 3.5} width={34 + (i % 3) * 8} height="2.5" rx="1.25" />
            <rect className="fill-linea" x="-51" y={y + 1} width="24" height="2.5" rx="1.25" />
            <circle
              ref={(el) => { responsableRefs.current[i] = el }}
              className={EQUIPO[ticket.persona]?.camisa}
              cx={X_RESPONSABLE}
              cy={y}
              r="4"
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            />
          </g>
        )
      })}

      <line className="stroke-linea" x1="38" y1="52" x2="118" y2="52" strokeWidth="2" strokeLinecap="round" />
      {EQUIPO.map((persona, i) => (
        <Personaje
          key={persona.x}
          x={persona.x}
          y={52}
          escala={ESCALA_EQUIPO}
          mirando="izquierda"
          camisa={persona.camisa}
          cuerpoRef={(el) => { cuerpoRefs.current[i] = el }}
          brazoRef={(el) => { brazoRefs.current[i] = el }}
        />
      ))}
    </svg>
  )
}
