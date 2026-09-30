'use client'

import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { animate, stagger } from 'animejs'
import type { JSAnimation } from 'animejs'

interface Props {
  /** Clave de continuidad de la escena: cuando cambia, estalla. La primera no cuenta. */
  clave: string
  /** `false` fuera del aviso de reporteria o con `?transicion=ninguna`: no se dibuja nada. */
  activa: boolean
}

/** Lo que tarda el frente de fuego en cruzar la pantalla. */
const AVANCE_MS = 1500
const CHISPAS = 28
const ANILLOS = 3
const RADIO_INICIAL = -24

/**
 * Explosion entre dos escenas: un destello cubre el cambio y el fuego "quema" la capa negra desde el
 * centro, dejando ver la escena nueva. Vive encima de todo y no toca el contenido ni el reloj de
 * rotacion. Anime.js mueve el radio del agujero (variable `--pq-radio`), los anillos y las chispas.
 *
 * @param props.clave Identifica la vista; un cambio dispara la animacion.
 * @param props.activa Si es `false` o el aparato pide menos movimiento, no hace nada.
 * @returns La capa de fuego, invisible mientras no anima.
 */
export function TransicionDeFuego ({ clave, activa }: Props): ReactElement {
  const raiz = useRef<HTMLDivElement>(null)
  const claveAnterior = useRef<string | null>(null)

  useLayoutEffect(() => {
    const capa = raiz.current
    const previa = claveAnterior.current

    claveAnterior.current = clave

    if (capa === null || previa === null || previa === clave || !activa) return
    if (globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const maximo = Math.hypot(globalThis.innerWidth, globalThis.innerHeight) / 2 + 60
    const fijarRadio = (px: number): void => { capa.style.setProperty('--pq-radio', `${px.toFixed(1)}px`) }
    const en = (selector: string): HTMLElement[] => Array.from(capa.querySelectorAll<HTMLElement>(selector))

    // Antes de pintar: la escena nueva ya esta montada y esta capa la tapa por completo.
    fijarRadio(RADIO_INICIAL)
    capa.dataset.viva = 'true'

    const radio = { valor: RADIO_INICIAL }
    const animaciones: JSAnimation[] = [
      animate(radio, {
        valor: maximo,
        duration: AVANCE_MS,
        delay: 160,
        ease: 'inQuad',
        onUpdate: () => { fijarRadio(radio.valor) },
        onComplete: () => { delete capa.dataset.viva }
      }),
      animate(en('.pq-destello'), { opacity: [0.95, 0], duration: 800, ease: 'outExpo' }),
      animate(en('.pq-bola'), {
        opacity: [1, 0],
        scale: [0, 1.35],
        duration: 1300,
        ease: 'outCirc'
      }),
      animate(en('.pq-anillo'), {
        opacity: [1, 0],
        scale: [0.1, 7],
        duration: 1300,
        delay: stagger(140),
        ease: 'outQuart'
      })
    ]

    en('.pq-chispa').forEach((chispa, i) => {
      animaciones.push(animate(chispa, {
        opacity: [1, 0],
        translateY: [0, -distanciaDeChispa(i)],
        duration: 800 + (i % 7) * 90,
        delay: (i % 5) * 25,
        ease: 'outQuart'
      }))
    })

    return () => {
      for (const a of animaciones) a.cancel()
      delete capa.dataset.viva
    }
  }, [clave, activa])

  return (
    <div ref={raiz} className="pq-raiz" aria-hidden="true">
      <div className="pq-carbon" />
      <div className="pq-frente" />
      <div className="pq-escena">
        <div className="pq-bola" />
        {Array.from({ length: ANILLOS }, (_, i) => <div key={i} className="pq-anillo" />)}
        {Array.from({ length: CHISPAS }, (_, i) => (
          <span
            key={i}
            className="pq-chispa"
            style={{ '--ang': `${anguloDeChispa(i)}deg` } as CSSProperties}
          />
        ))}
      </div>
      <div className="pq-destello" />
    </div>
  )
}

/** Reparte las chispas en circulo con una leve variacion fija (no aleatoria: no cambia entre renders). */
function anguloDeChispa (i: number): number {
  return Math.round((360 / CHISPAS) * i + variacion(i) * 8)
}

/** Distancia que recorre una chispa, en vmin. */
function distanciaDeChispa (i: number): number {
  return (18 + variacion(i + 7) * 26) * Math.min(globalThis.innerWidth, globalThis.innerHeight) / 100
}

/** Numero repetible entre 0 y 1 a partir del indice. */
function variacion (i: number): number {
  return Math.abs((Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1)
}

