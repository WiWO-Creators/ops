import type { Ref } from 'react'

interface PropsPersonaje {
  /** Donde apoya los pies, en unidades del SVG de la escena. */
  x: number
  y: number
  /** Hacia donde mira. Espeja el dibujo entero, brazo animado incluido. */
  mirando?: 'derecha' | 'izquierda'
  /** Tamaño relativo; 1 mide unos 48 de alto. */
  escala?: number
  /** Clase de relleno de la camisa. La de marca se reserva para quien protagoniza la escena. */
  camisa?: string
  /** El cuerpo entero, para balancearlo. Gira y escala desde los pies. */
  cuerpoRef?: Ref<SVGGElement>
  /** El brazo de adelante. Gira desde el hombro: negativo lo levanta. */
  brazoRef?: Ref<SVGGElement>
  /** No dibuja la cabeza: quien lo usa pone otra encima, centrada en `(0, -42)`. */
  sinCabeza?: boolean
}

/**
 * Una persona del equipo, del mismo trazo que el resto de las escenas.
 *
 * Se dibuja con los pies en el origen y se ubica con un `transform` de atributo en el grupo de
 * afuera. Asi el `transform` CSS que anima anime.js en el cuerpo y en el brazo nunca pisa la
 * posicion: son dos transformaciones distintas sobre dos elementos distintos.
 *
 * @returns Grupo SVG decorativo; va dentro de una escena que ya es `aria-hidden`.
 */
export function Personaje ({ x, y, mirando = 'derecha', escala = 1, camisa = 'fill-superficie', cuerpoRef, brazoRef, sinCabeza = false }: PropsPersonaje) {
  const espejo = mirando === 'izquierda' ? -1 : 1

  return (
    <g transform={`translate(${x} ${y}) scale(${espejo * escala} ${escala})`}>
      <g
        ref={cuerpoRef}
        className="stroke-texto-tenue"
        fill="none"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
      >
        <line x1="-3" y1="-15" x2="-5" y2="0" />
        <line x1="3" y1="-15" x2="5" y2="0" />
        <line x1="-5" y1="-29" x2="-11" y2="-19" />
        <rect className={camisa} x="-7" y="-34" width="14" height="20" rx="6" />
        {!sinCabeza && (
          <>
            <circle className="fill-superficie" cx="0" cy="-42" r="7.5" />
            <circle cx="3" cy="-43" r="0.7" fill="currentColor" stroke="none" className="text-texto-tenue" />
            <path d="M1 -38.5q2.5 1.6 4.5 -0.8" strokeWidth="1.3" />
          </>
        )}
        <g ref={brazoRef} style={{ transformBox: 'fill-box', transformOrigin: '0% 0%' }}>
          <line x1="5" y1="-29" x2="13" y2="-21" />
        </g>
      </g>
    </g>
  )
}
