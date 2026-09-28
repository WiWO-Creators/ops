'use client'

import { useRef } from 'react'
import { svg } from 'animejs'
import { useSecuenciaDeObra } from './useSecuenciaDeObra'

/**
 * Una grua horquilla levanta un pallet: la carga sube por el mastil, se asienta arriba y vuelve a
 * bajar mientras las ruedas giran.
 *
 * Es la unica de las cuatro escenas sin golpe, asi que el gesto es el opuesto —largo y continuo— y
 * no tiene un instante de impacto que marcar. Lo que la une a las otras tres es el encuadre, el suelo
 * en `y=102` y el casco como unica mancha de color.
 *
 * @returns Escena SVG decorativa; el mensaje accesible pertenece a la bienvenida.
 */
export function EscenaGruaHorquilla () {
  const sueloRef = useRef<SVGLineElement | null>(null)
  const maquinaRef = useRef<SVGGElement | null>(null)
  const horquillaRef = useRef<SVGGElement | null>(null)
  const rueda1Ref = useRef<SVGGElement | null>(null)
  const rueda2Ref = useRef<SVGGElement | null>(null)

  useSecuenciaDeObra((linea) => {
    const suelo = sueloRef.current
    const maquina = maquinaRef.current
    const horquilla = horquillaRef.current
    const rueda1 = rueda1Ref.current
    const rueda2 = rueda2Ref.current

    if (suelo === null || maquina === null || horquilla === null || rueda1 === null || rueda2 === null) return

    const trazoSuelo = svg.createDrawable(suelo)
    linea.add(trazoSuelo, { draw: ['0 0', '0 1'], duration: 320 }, 0)

    linea.add(maquina, { opacity: [0, 1], translateY: [-6, 0], duration: 300 }, 120)
    linea.add(horquilla, { opacity: [0, 1], translateY: [-6, 0], duration: 300 }, 160)

    // Sube rapido, se asienta arriba un momento y baja sin drama. El reposo en el medio es lo que
    // evita que el pallet parezca un yo-yo.
    const inicioCiclo = 520

    linea.add(horquilla, {
      translateY: [
        { to: -34, duration: 480, ease: 'outQuad' },
        { to: -34, duration: 420 },
        { to: 0, duration: 420, ease: 'inOutQuad' }
      ]
    }, inicioCiclo)

    // La maquina se hunde un poco mientras la carga esta arriba: sin eso el pallet parece flotar por
    // su cuenta en vez de colgar de algo que aguanta peso.
    linea.add(maquina, {
      translateY: [
        { to: 1.2, duration: 480, ease: 'outQuad' },
        { to: 1.2, duration: 420 },
        { to: 0, duration: 420, ease: 'inOutQuad' }
      ]
    }, inicioCiclo)

    // Las ruedas giran mientras la carga esta en movimiento o sostenida arriba: quietas en el instante
    // en que el pallet toca el suelo, para no leerse como una grua que se aleja con la carga en alto.
    const duracionCiclo = 480 + 420 + 420

    linea.add([rueda1, rueda2], { rotate: [0, 150], duration: duracionCiclo, ease: 'inOutQuad' }, inicioCiclo)
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

      <g ref={maquinaRef}>
        {/* Techo de proteccion. Las dos columnas nacen del chasis, no del aire. */}
        <path d="M50 74V50h36v24" />

        <g>
          <circle className="fill-superficie" cx="66" cy="63" r="9" />
          <circle cx="71" cy="66" r="0.8" fill="currentColor" stroke="none" />
          <path className="fill-acento stroke-acento" d="M57 63a9 9 0 0 1 18 0z" />
          <rect className="fill-acento stroke-acento" x="54" y="61" width="24" height="3.5" rx="1.75" />
        </g>

        <rect className="fill-superficie" x="46" y="74" width="42" height="18" rx="3" />

        {/* Las ruedas giran con un solo radio: dos o tres se pisan entre si a este tamaño. */}
        <g ref={rueda1Ref} className="fill-superficie" style={{ transformOrigin: '56px 96px' }}>
          <circle cx="56" cy="96" r="6.5" />
          <line x1="56" y1="96" x2="56" y2="90" strokeWidth="1.5" />
        </g>
        <g ref={rueda2Ref} className="fill-superficie" style={{ transformOrigin: '80px 96px' }}>
          <circle cx="80" cy="96" r="6.5" />
          <line x1="80" y1="96" x2="80" y2="90" strokeWidth="1.5" />
        </g>

        {/* Mastil. Fijo: lo que sube es la horquilla, no la torre. */}
        <line x1="92" y1="96" x2="92" y2="42" />
        <line x1="97" y1="96" x2="97" y2="42" />
        <line x1="90" y1="42" x2="99" y2="42" strokeWidth="2" />
      </g>

      {/* Horquilla y carga viajan en el mismo grupo: si el pallet se moviera aparte, se despegaria de
          los brazos en cuanto alguien toque una de las dos animaciones. */}
      <g ref={horquillaRef} style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}>
        {/* El brazo sobresale del pallet a proposito: una horquilla que termina justo donde termina la
            carga queda escondida debajo y el pallet parece pegado al mastil. */}
        <path d="M99 78v22h29" />
        <rect className="fill-superficie-elevada" x="101" y="94" width="22" height="6" rx="1" />
        <rect className="fill-superficie-elevada" x="104" y="80" width="16" height="14" rx="1.5" />
      </g>
    </svg>
  )
}
