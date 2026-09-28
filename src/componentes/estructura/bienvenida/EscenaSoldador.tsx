'use client'

import { useRef } from 'react'
import { svg, stagger } from 'animejs'
import { sinHuecos, useSecuenciaDeObra } from './useSecuenciaDeObra'

/**
 * Alguien suelda la union de una viga: el arco titila y las chispas caen de a una.
 *
 * Aca la mancha de marca es la mascara, no el casco: es lo que la persona tiene puesto y lo que
 * distingue la escena de un golpe mas. El encuadre y el suelo en `y=102` siguen siendo los mismos que
 * en las otras tres.
 *
 * @returns Escena SVG decorativa; el mensaje accesible pertenece a la bienvenida.
 */
export function EscenaSoldador () {
  const sueloRef = useRef<SVGLineElement | null>(null)
  const estructuraRef = useRef<SVGGElement | null>(null)
  const obreroRef = useRef<SVGGElement | null>(null)
  const sopleteRef = useRef<SVGGElement | null>(null)
  const arcoRef = useRef<SVGGElement | null>(null)
  const chispaRefs = useRef<Array<SVGLineElement | null>>([])

  useSecuenciaDeObra((linea) => {
    const suelo = sueloRef.current
    const estructura = estructuraRef.current
    const obrero = obreroRef.current
    const soplete = sopleteRef.current
    const arco = arcoRef.current
    const chispas = sinHuecos(chispaRefs.current)

    if (suelo === null || estructura === null || obrero === null || soplete === null || arco === null) return

    const trazoSuelo = svg.createDrawable(suelo)
    linea.add(trazoSuelo, { draw: ['0 0', '0 1'], duration: 320 }, 0)

    linea.add(estructura, { opacity: [0, 1], translateY: [-6, 0], duration: 280 }, 120)
    linea.add(obrero, { opacity: [0, 1], translateY: [-6, 0], duration: 280 }, 160)

    // El arco no se enciende y apaga: titila. Los saltos de opacidad son a proposito desparejos: es
    // lo unico que separa una soldadura de una ampolleta con animacion.
    const inicioSoldadura = 480

    linea.add(arco, {
      opacity: [
        { to: 0.3, duration: 60 },
        { to: 1, duration: 90 },
        { to: 0.4, duration: 70 },
        { to: 1, duration: 110 },
        { to: 0.35, duration: 80 },
        { to: 0.9, duration: 100 },
        { to: 1, duration: 90 }
      ]
    }, inicioSoldadura)

    // El soplete respira sobre la union en vez de quedarse clavado: la mano de alguien nunca esta
    // perfectamente quieta.
    linea.add(soplete, {
      translateX: [0, -1.5],
      translateY: [0, 0.8],
      duration: 300,
      loop: 3,
      alternate: true,
      ease: 'inOutQuad'
    }, inicioSoldadura)

    // Cada chispa sale del punto de union y se apaga en el aire. El `transform-origin` de cada una lo
    // trae el propio elemento porque cambia con la direccion del chorro.
    if (chispas.length > 0) {
      linea.add(chispas, {
        opacity: [0, 1, 0],
        scale: [0.2, 1, 1.15],
        duration: 420,
        ease: 'outQuad'
      }, stagger(150, { start: inicioSoldadura + 60 }))
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
      <line ref={sueloRef} className="stroke-linea" x1="18" y1="102" x2="162" y2="102" />

      {/* La estructura que se esta uniendo. La columna arranca justo donde termina la viga: si no se
          tocan, no hay union que soldar y el arco queda pegado a la nada. */}
      <g ref={estructuraRef} className="fill-superficie-elevada">
        <rect x="100" y="90" width="42" height="9" rx="1.5" />
        <rect x="112" y="62" width="9" height="28" rx="1.5" />
      </g>

      <g ref={obreroRef}>
        {/* Rodilla en el suelo: la pierna de atras apoya la espinilla entera, la de adelante sostiene. */}
        <path d="M60 83l-8 13-8 5" />
        <path d="M68 83l10 9v9" />

        <rect className="fill-superficie" x="56" y="60" width="16" height="24" rx="7" />
        <circle className="fill-superficie" cx="64" cy="48" r="11" />

        {/* La mascara baja tapa la cara entera: levantada dejaria de leerse como soldar. */}
        <path className="fill-acento stroke-acento" d="M54 42h21v12a7 7 0 0 1-7 7h-7a7 7 0 0 1-7-7z" />
        <line className="stroke-superficie" x1="58" y1="48" x2="71" y2="48" strokeWidth="2" />

        {/* Brazo de atras doblado contra el cuerpo; el de adelante lleva el soplete. Termina en la
            cadera y no en el aire: un solo trazo suelto al costado lee como un palo, no como un brazo. */}
        <path d="M58 66l-6 11 5 6" />
        <g ref={sopleteRef}>
          <path d="M71 65l15 7 12 9" />
          <rect
            className="fill-texto-tenue"
            x="97"
            y="79"
            width="12"
            height="6"
            rx="1.5"
            transform="rotate(34 103 82)"
          />
        </g>
      </g>

      {/* El destello. Vive fuera del grupo del obrero para que el temblor del soplete no lo arrastre:
          el arco esta clavado en la union y es el brazo el que se mueve alrededor. */}
      <g
        ref={arcoRef}
        className="stroke-acento"
        strokeWidth="2"
        style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}
      >
        <circle className="fill-acento" cx="111" cy="88" r="2.5" stroke="none" />
        <path d="M111 81v-5M104 84l-5-3" />
      </g>

      {/* Todas salen hacia el lado libre. Hacia la derecha se cruzarian con la columna, que es opaca,
          y una chispa dibujada encima del acero deja de leerse como chispa. */}
      <g className="stroke-acento" strokeWidth="2">
        <line ref={(el) => { chispaRefs.current[0] = el }} style={{ transformBox: 'fill-box', transformOrigin: '100% 0%' }} x1="111" y1="90" x2="104" y2="98" />
        <line ref={(el) => { chispaRefs.current[1] = el }} style={{ transformBox: 'fill-box', transformOrigin: '100% 100%' }} x1="111" y1="90" x2="103" y2="81" />
        <line ref={(el) => { chispaRefs.current[2] = el }} style={{ transformBox: 'fill-box', transformOrigin: '100% 100%' }} x1="111" y1="90" x2="99" y2="86" />
        <line ref={(el) => { chispaRefs.current[3] = el }} style={{ transformBox: 'fill-box', transformOrigin: '100% 100%' }} x1="111" y1="90" x2="107" y2="76" />
      </g>
    </svg>
  )
}
