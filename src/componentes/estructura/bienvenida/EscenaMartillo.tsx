'use client'

import { useRef } from 'react'
import { svg, stagger } from 'animejs'
import { sinHuecos, useSecuenciaDeObra } from './useSecuenciaDeObra'

/**
 * Un albañil levanta un muro a martillazos: el suelo y el cuerpo se dibujan de un trazo, los bloques
 * entran de a uno y el brazo cae en un solo golpe con chispas en el instante del impacto.
 * @returns Escena SVG decorativa; el mensaje accesible pertenece a la bienvenida.
 */
export function EscenaMartillo () {
  const sueloRef = useRef<SVGLineElement | null>(null)
  const cuerpoRef = useRef<SVGGElement | null>(null)
  const brazoRef = useRef<SVGGElement | null>(null)
  const chispasRef = useRef<SVGGElement | null>(null)
  const bloqueRefs = useRef<Array<SVGRectElement | null>>([])

  useSecuenciaDeObra((linea) => {
    const suelo = sueloRef.current
    const cuerpo = cuerpoRef.current
    const brazo = brazoRef.current
    const chispas = chispasRef.current
    const bloques = sinHuecos(bloqueRefs.current)

    if (suelo === null || cuerpo === null || brazo === null || chispas === null) return

    // El suelo se dibuja de un trazo: primero existe el piso, despues lo que se apoya en el.
    const trazoSuelo = svg.createDrawable(suelo)
    linea.add(trazoSuelo, { draw: ['0 0', '0 1'], duration: 320 }, 0)

    // El albañil aparece mientras el suelo termina de trazarse.
    linea.add(cuerpo, { opacity: [0, 1], translateY: [-6, 0], duration: 300 }, 120)

    // Los bloques entran de a uno, de abajo hacia arriba; el ultimo es el que recibe el martillo.
    linea.add(bloques, { opacity: [0, 1], translateY: [-10, 0], duration: 360, ease: 'outExpo' }, stagger(110, { start: 180 }))

    // El golpe: anticipacion lenta hacia atras, caida rapida sobre el bloque, y dos rebotes cortos
    // hasta el reposo. El impacto real cae al terminar el segundo tramo, que es donde saltan las
    // chispas y el cuerpo acompaña con un pequeño esfuerzo.
    const inicioGolpe = 780
    linea.add(brazo, {
      rotate: [
        { to: -32, duration: 220, ease: 'inQuad' },
        { to: 12, duration: 150, ease: 'outQuad' },
        { to: -3, duration: 110 },
        { to: 2, duration: 130 }
      ]
    }, inicioGolpe)

    const instanteImpacto = inicioGolpe + 220 + 150

    linea.add(cuerpo, { scaleY: [1, 0.98, 1], duration: 140, ease: 'inOutQuad' }, instanteImpacto - 20)
    linea.add(chispas, { opacity: [0, 1, 0], scale: [0.65, 1, 1.45], duration: 220, ease: 'outQuad' }, instanteImpacto)
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
      {/* El muro, de abajo hacia arriba. Cada bloque entra con su propio retraso: es lo que hace que
          se lea como "esta construyendo" y no como "hay un dibujo de un muro". */}
      <g className="fill-superficie-elevada">
        <rect ref={(el) => { bloqueRefs.current[0] = el }} x="100" y="88" width="20" height="12" rx="2" />
        <rect ref={(el) => { bloqueRefs.current[1] = el }} x="122" y="88" width="20" height="12" rx="2" />
        <rect ref={(el) => { bloqueRefs.current[2] = el }} x="100" y="74" width="20" height="12" rx="2" />
        <rect ref={(el) => { bloqueRefs.current[3] = el }} x="122" y="74" width="20" height="12" rx="2" />
        {/* El de arriba es el que recibe el martillo, asi que entra ultimo. */}
        <rect ref={(el) => { bloqueRefs.current[4] = el }} x="111" y="60" width="20" height="12" rx="2" />
      </g>

      {/* El suelo, para que el monito y el muro se apoyen en lo mismo. */}
      <line ref={sueloRef} className="stroke-linea" x1="18" y1="102" x2="162" y2="102" />

      <g ref={cuerpoRef} style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}>
        {/* Piernas y brazo de atras primero: quedan detras del torso sin necesidad de recortes. */}
        <line x1="55" y1="87" x2="50" y2="102" />
        <line x1="61" y1="87" x2="66" y2="102" />
        <line x1="51" y1="68" x2="43" y2="79" />

        <rect className="fill-superficie" x="50" y="63" width="16" height="24" rx="7" />
        <circle className="fill-superficie" cx="58" cy="50" r="11" />
        <circle cx="63" cy="54" r="0.8" fill="currentColor" stroke="none" />
        <path d="M59 58q3 2 5-1" strokeWidth="1.5" />

        {/* El casco tapa la mitad de arriba de la cabeza y no la cabeza entera: si la cubre toda deja
            de leerse como alguien con casco y pasa a ser una mancha con patas. El arco es exactamente
            la mitad superior del circulo, asi que apoya en el borde y no flota.
            Es lo unico con color de marca: en un dibujo de dos trazos, una sola mancha de color dice
            "de aca es" mejor que teñir todo. */}
        <path className="fill-acento stroke-acento" d="M47 50a11 11 0 0 1 22 0z" />
        <rect className="fill-acento stroke-acento" x="44" y="48" width="28" height="4" rx="2" />

        {/* El hombro es la esquina inferior izquierda del grupo; el mango alcanza el bloque superior. */}
        <g ref={brazoRef} style={{ transformBox: 'fill-box', transformOrigin: '0% 100%' }}>
          <line x1="65" y1="68" x2="82" y2="62" />
          <line x1="82" y1="62" x2="111" y2="42" />
          <rect
            className="fill-texto-tenue"
            x="104.5"
            y="38"
            width="13"
            height="8"
            rx="1.5"
            transform="rotate(55 111 42)"
          />
        </g>
      </g>

      {/* Las chispas del golpe: nacen en el instante exacto en que el brazo llega al bloque. */}
      <g
        ref={chispasRef}
        className="stroke-acento"
        style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
      >
        <line x1="112" y1="56" x2="107" y2="50" />
        <line x1="117" y1="54" x2="118" y2="46" />
        <line x1="122" y1="57" x2="128" y2="52" />
      </g>
    </svg>
  )
}
