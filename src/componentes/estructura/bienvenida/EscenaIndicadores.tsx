'use client'

import { useRef } from 'react'
import { stagger, svg } from 'animejs'
import { Personaje } from './Personaje'
import { sinHuecos, useSecuenciaDeObra } from './useSecuenciaDeObra'

/** El piso del grafico. */
const BASE = 44
/** Altura de cada barra. Sube con altibajos: una escalera perfecta no parece un dato real. */
const ALTURAS = [22, 34, 28, 46, 40, 62]
const ANCHO_BARRA = 12
const PASO_BARRA = 17
const PRIMERA_BARRA = -108
/** La cifra de la tarjeta, que la escena cuenta desde cero. */
const CIFRA = 32

/** Los puntos de la linea de tendencia, un poco por encima de cada barra. */
const PUNTOS = ALTURAS.map((altura, i) => ({
  x: PRIMERA_BARRA + i * PASO_BARRA + ANCHO_BARRA / 2,
  y: BASE - altura - 8
}))

/**
 * Un tablero de indicadores que se arma: las barras crecen, se traza la tendencia, la tarjeta
 * cuenta la cifra hacia arriba y alguien del equipo la festeja con el brazo en alto.
 *
 * @returns Escena SVG decorativa; el mensaje accesible pertenece a la bienvenida.
 */
export function EscenaIndicadores () {
  const barraRefs = useRef<Array<SVGRectElement | null>>([])
  const puntoRefs = useRef<Array<SVGCircleElement | null>>([])
  const tendenciaRef = useRef<SVGPolylineElement | null>(null)
  const tarjetaRef = useRef<SVGGElement | null>(null)
  const cifraRef = useRef<SVGTextElement | null>(null)
  const cuerpoRef = useRef<SVGGElement | null>(null)
  const brazoRef = useRef<SVGGElement | null>(null)

  useSecuenciaDeObra((linea) => {
    const barras = sinHuecos(barraRefs.current)
    const puntos = sinHuecos(puntoRefs.current)
    const tendencia = tendenciaRef.current
    const tarjeta = tarjetaRef.current
    const cifra = cifraRef.current
    const cuerpo = cuerpoRef.current
    const brazo = brazoRef.current

    if (tendencia === null || tarjeta === null || cifra === null || cuerpo === null || brazo === null) return

    const contador = { valor: 0 }
    cifra.textContent = '+0%'

    linea.set(barras, { scaleY: 0 }, 0)
    linea.set(puntos, { scale: 0 }, 0)
    linea.set(tarjeta, { opacity: 0 }, 0)

    linea.add(cuerpo, { opacity: [0, 1], translateX: [20, 0], duration: 480, ease: 'outExpo' }, 0)
    linea.add(barras, { scaleY: [0, 1], duration: 620, ease: 'outBack(1.3)', delay: stagger(90) }, 150)
    linea.add(svg.createDrawable(tendencia), { draw: ['0 0', '0 1'], duration: 800, ease: 'inOutQuad' }, 850)
    linea.add(puntos, { scale: [0, 1.4, 1], duration: 320, ease: 'outQuad', delay: stagger(130) }, 850)

    linea.add(tarjeta, { opacity: [0, 1], translateY: [10, 0], duration: 420, ease: 'outExpo' }, 1400)
    linea.add(contador, {
      valor: CIFRA,
      duration: 900,
      ease: 'outQuart',
      onUpdate: () => { cifra.textContent = `+${Math.round(contador.valor)}%` }
    }, 1500)

    // El festejo llega cuando la cifra termina de subir, no antes.
    linea.add(brazo, { rotate: [0, -125, -105, -125], duration: 700, ease: 'outBack(2)' }, 2300)
    linea.add(cuerpo, { translateY: [0, -7, 0], duration: 420, ease: 'outQuad' }, 2350)
  })

  return (
    <svg
      viewBox="-120 -60 240 120"
      className="block h-auto max-h-full w-[min(34rem,86vw)] max-w-full"
      aria-hidden="true"
    >
      <line className="stroke-linea" x1="-116" y1={BASE} x2="0" y2={BASE} strokeWidth="1.5" strokeLinecap="round" />

      {ALTURAS.map((altura, i) => (
        <rect
          key={i}
          ref={(el) => { barraRefs.current[i] = el }}
          className={i === ALTURAS.length - 1 ? 'fill-acento' : 'fill-linea-fuerte'}
          x={PRIMERA_BARRA + i * PASO_BARRA}
          y={BASE - altura}
          width={ANCHO_BARRA}
          height={altura}
          rx="2.5"
          style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
        />
      ))}

      <polyline
        ref={tendenciaRef}
        className="stroke-acento"
        points={PUNTOS.map((punto) => `${punto.x},${punto.y}`).join(' ')}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {PUNTOS.map((punto, i) => (
        <circle
          key={i}
          ref={(el) => { puntoRefs.current[i] = el }}
          className="fill-superficie stroke-acento"
          cx={punto.x}
          cy={punto.y}
          r="2.6"
          strokeWidth="1.6"
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        />
      ))}

      <g ref={tarjetaRef}>
        <rect className="fill-superficie-elevada stroke-linea" x="6" y="-52" width="74" height="38" rx="5" strokeWidth="1" />
        <rect className="fill-linea-fuerte" x="13" y="-45" width="26" height="3" rx="1.5" />
        <text ref={cifraRef} className="fill-texto" x="13" y="-22" fontSize="16" fontWeight="700">+{CIFRA}%</text>
        <path className="stroke-texto-exito" d="M70 -24v-12m-4.5 4.5l4.5 -4.5l4.5 4.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      <line className="stroke-linea" x1="70" y1="52" x2="118" y2="52" strokeWidth="2" strokeLinecap="round" />
      <Personaje x={94} y={52} mirando="izquierda" camisa="fill-acento" cuerpoRef={cuerpoRef} brazoRef={brazoRef} />
    </svg>
  )
}
