'use client'

import { useRef } from 'react'
import { svg, stagger } from 'animejs'
import { sinHuecos, useSecuenciaDeObra } from './useSecuenciaDeObra'

/**
 * Alguien rompe el pavimento con un martillo neumatico: vibracion continua, polvo y grietas que se
 * abren de a una.
 *
 * El encuadre, el suelo en `y=102` y el casco como unica mancha de color son los mismos que en
 * `EscenaMartillo`: las cuatro escenas se turnan en el mismo hueco y tienen que leerse como la misma
 * mano, no como cuatro dibujos sueltos.
 *
 * @returns Escena SVG decorativa; el mensaje accesible pertenece a la bienvenida.
 */
export function EscenaMartilloNeumatico () {
  const sueloRef = useRef<SVGLineElement | null>(null)
  const maquinaRef = useRef<SVGGElement | null>(null)
  const operarioRef = useRef<SVGGElement | null>(null)
  const grietaRefs = useRef<Array<SVGPathElement | null>>([])
  const polvoRefs = useRef<Array<SVGCircleElement | null>>([])

  useSecuenciaDeObra((linea) => {
    const suelo = sueloRef.current
    const maquina = maquinaRef.current
    const operario = operarioRef.current
    const grietas = sinHuecos(grietaRefs.current)
    const polvo = sinHuecos(polvoRefs.current)

    if (suelo === null || maquina === null || operario === null) return

    const trazoSuelo = svg.createDrawable(suelo)
    linea.add(trazoSuelo, { draw: ['0 0', '0 1'], duration: 320 }, 0)

    linea.add(maquina, { opacity: [0, 1], translateY: [-6, 0], duration: 280 }, 140)
    linea.add(operario, { opacity: [0, 1], translateY: [-6, 0], duration: 280 }, 180)

    // La vibracion: un temblor corto que se repite mientras dura el trabajo. Tres pixeles de
    // recorrido y nada de rotacion, o deja de leerse como vibracion y pasa a leerse como que la
    // maquina se cae. El operario recibe la mitad del temblor: lo amortigua, no lo copia.
    const inicioVibracion = 520

    linea.add(maquina, {
      translateX: [0, 0.6],
      translateY: [0, 2],
      duration: 70,
      loop: 12,
      alternate: true,
      ease: 'linear'
    }, inicioVibracion)

    linea.add(operario, {
      translateY: [0, 1],
      duration: 70,
      loop: 12,
      alternate: true,
      ease: 'linear'
    }, inicioVibracion)

    // Las grietas salen de donde pega la punta y crecen de a una, como los bloques del muro: es lo
    // que convierte la vibracion en trabajo hecho.
    if (grietas.length > 0) {
      linea.add(grietas, { opacity: [0, 1], duration: 200 }, stagger(220, { start: inicioVibracion + 80 }))
    }

    // El polvo del golpe. Nace pegado a la punta: separado de ahi deja de leerse como polvo levantado.
    if (polvo.length > 0) {
      linea.add(polvo, {
        opacity: [0, 0.55, 0],
        translateY: [0, -14],
        scale: [0.4, 1.5],
        duration: 480,
        loop: 2,
        ease: 'outQuad'
      }, stagger(140, { start: inicioVibracion }))
    }
  })

  return (
    <svg
      viewBox="34 8 116 102"
      className="text-texto-tenue h-auto w-64 max-w-full"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* El suelo. Se dibuja antes que la maquina para que la punta lo tape y no al reves. */}
      <line ref={sueloRef} className="stroke-linea" x1="18" y1="102" x2="162" y2="102" />

      {/* Las grietas salen de donde pega la punta y crecen de a una, como los bloques del muro:
          es lo que convierte la vibracion en trabajo hecho. Neutras, no de marca: en las cuatro
          escenas el color queda para el casco y para el momento del impacto, nunca para lo hecho. */}
      <g strokeWidth="2">
        <path ref={(el) => { grietaRefs.current[0] = el }} d="M99 102l-9 6-7-2" />
        <path ref={(el) => { grietaRefs.current[1] = el }} d="M103 102l6 5 8-1" />
        <path ref={(el) => { grietaRefs.current[2] = el }} d="M101 103l1 7" />
      </g>

      {/* El polvo del golpe. Nace pegado a la punta y desfasado: separado de ahi deja de leerse como
          polvo levantado y pasa a ser un par de puntos sueltos en el aire. */}
      <g style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }} fill="currentColor" stroke="none">
        <circle ref={(el) => { polvoRefs.current[0] = el }} cx="94" cy="101" r="2" />
        <circle ref={(el) => { polvoRefs.current[1] = el }} cx="106" cy="101" r="1.6" />
        <circle ref={(el) => { polvoRefs.current[2] = el }} cx="90" cy="100" r="1.4" />
        <circle ref={(el) => { polvoRefs.current[3] = el }} cx="110" cy="100" r="1.2" />
      </g>

      {/* La maquina entera vibra junta —manubrio, cuerpo, eje y punta—: separar las piezas las
          despega. Va antes que el operario porque el brazo de adelante pasa POR DELANTE del cuerpo de
          la maquina; dibujada despues, lo taparia y la mano quedaria flotando. */}
      <g ref={maquinaRef}>
        <line x1="89" y1="56" x2="111" y2="56" />
        <rect className="fill-superficie" x="94" y="58" width="12" height="26" rx="2" />
        <line x1="100" y1="84" x2="100" y2="94" />
        <rect className="fill-texto-tenue" x="96.5" y="94" width="7" height="9" rx="1" />
      </g>

      <g ref={operarioRef}>
        {/* Piernas separadas: el peso repartido es lo que dice que la maquina empuja hacia arriba. */}
        <line x1="66" y1="87" x2="60" y2="102" />
        <line x1="74" y1="87" x2="80" y2="102" />

        <rect className="fill-superficie" x="64" y="63" width="16" height="24" rx="7" />
        <circle className="fill-superficie" cx="72" cy="50" r="11" />
        <circle cx="77" cy="54" r="0.8" fill="currentColor" stroke="none" />
        <path d="M73 58q3 2 5-1" strokeWidth="1.5" />

        {/* Casco: mitad superior exacta del circulo, apoyado en el borde. Unica mancha de marca. */}
        <path className="fill-acento stroke-acento" d="M61 50a11 11 0 0 1 22 0z" />
        <rect className="fill-acento stroke-acento" x="58" y="48" width="28" height="4" rx="2" />

        {/* Un brazo a cada punta del manubrio. Con una sola mano la postura lee como sostener algo,
            no como aguantar una maquina que rebota contra el suelo. */}
        <line x1="78" y1="70" x2="90" y2="57" />
        <line x1="80" y1="66" x2="110" y2="57" />
      </g>
    </svg>
  )
}
