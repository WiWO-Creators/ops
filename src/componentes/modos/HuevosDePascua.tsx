'use client'

import { useEffect, useState } from 'react'
import { animate, stagger, utils } from 'animejs'
import { cumpleConsulta, MENOS_MOVIMIENTO } from '@/lib/useConsultaDeMedios'
import { Calabaza, Murcielago } from './Dibujos'
import { OLVIDO_MS, teclear, type EfectoSecreto } from './huevos'

/** Clics sobre el logo que lo disparan, y el tiempo en que tienen que darse. */
const CLICS = 5
const VENTANA_MS = 3000
const CALABAZAS = 14
const LLUVIA_MS = 2600

/** Los campos donde se escribe de verdad: ahi las letras no son una palabra secreta. */
const CAMPOS = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'

/**
 * Los huevos de pascua que se disparan con el teclado o con el logo.
 *
 * Cinco clics seguidos sobre el logo (`[data-logo]`) hacen llover calabazas. Y escribir una palabra
 * secreta fuera de un campo de texto dispara un efecto: `boo`, `murcielago`, `bruja`, `calabaza`.
 * Escucha en el documento y no en el logo: el logo vive en tres armazones y asi no hay que pasar un
 * manejador por ninguno. Mientras un efecto esta en marcha no arranca otro, y con menos movimiento
 * no pasa nada.
 */
export function HuevosDePascua () {
  const [efecto, setEfecto] = useState<EfectoSecreto | null>(null)

  useEffect(() => {
    let clics: number[] = []
    let escrito = ''
    let olvido: number | undefined

    const alHacerClic = (evento: MouseEvent) => {
      if (!(evento.target instanceof Element) || evento.target.closest('[data-logo]') === null) return
      if (cumpleConsulta(MENOS_MOVIMIENTO)) return

      const ahora = Date.now()
      clics = [...clics.filter((t) => ahora - t < VENTANA_MS), ahora]
      if (clics.length < CLICS) return

      clics = []
      setEfecto((actual) => actual ?? 'calabazas')
    }

    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.ctrlKey || evento.metaKey || evento.altKey) return
      if (evento.target instanceof Element && evento.target.closest(CAMPOS) !== null) return
      if (cumpleConsulta(MENOS_MOVIMIENTO)) return

      const resultado = teclear(escrito, evento.key)

      escrito = resultado.escrito
      window.clearTimeout(olvido)
      olvido = window.setTimeout(() => { escrito = '' }, OLVIDO_MS)

      if (resultado.efecto !== null) {
        const disparado = resultado.efecto

        setEfecto((actual) => actual ?? disparado)
      }
    }

    document.addEventListener('click', alHacerClic)
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.removeEventListener('click', alHacerClic)
      document.removeEventListener('keydown', alTeclear)
      window.clearTimeout(olvido)
    }
  }, [])

  if (efecto === null) return null

  const terminar = () => { setEfecto(null) }

  switch (efecto) {
    case 'calabazas': return <LluviaDeCalabazas onTerminar={terminar} />
    case 'bu': return <SustoDelFantasma onTerminar={terminar} />
    case 'enjambre': return <EnjambreDeMurcielagos onTerminar={terminar} />
    case 'escoba': return <BrujaEnEscoba onTerminar={terminar} />
  }
}

interface PropsEfecto {
  onTerminar: () => void
}

/** Las calabazas cayendo; se desmonta sola al terminar. */
function LluviaDeCalabazas ({ onTerminar }: PropsEfecto) {
  useEffect(() => {
    const caida = animate('[data-calabaza-lluvia]', {
      translateY: ['-15vh', '115vh'],
      rotate: [() => Math.round(Math.random() * 40 - 20), () => Math.round(Math.random() * 360 - 180)],
      duration: LLUVIA_MS,
      ease: 'inQuad',
      delay: stagger(90),
      onComplete: onTerminar
    })

    return () => { caida.revert() }
    // El callback se lee una sola vez: el efecto es de una sola pasada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-flotante overflow-hidden">
      {Array.from({ length: CALABAZAS }, (_, i) => (
        <span
          key={i}
          data-calabaza-lluvia=""
          style={{ left: `${(i * 97) % 94}vw`, top: 0 }}
          className="absolute block h-9 w-9 -translate-y-full"
        >
          <Calabaza className="size-full" />
        </span>
      ))}
    </div>
  )
}

/** Un fantasma que salta al centro de la pantalla con un destello morado y un «¡BU!» enorme. */
function SustoDelFantasma ({ onTerminar }: PropsEfecto) {
  useEffect(() => {
    const destello = animate('[data-susto="destello"]', { opacity: [0, 0.55, 0], duration: 900, ease: 'outQuad' })
    const fantasma = animate('[data-susto="fantasma"]', {
      scale: [0.3, 1.25, 1.1],
      translateY: [60, 0],
      opacity: [0, 1, 1, 0],
      duration: 1400,
      ease: 'outBack(1.6)',
      onComplete: onTerminar
    })

    return () => { destello.revert(); fantasma.revert() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-aviso grid place-items-center">
      <div data-susto="destello" className="absolute inset-0 bg-[#7A3FB0] opacity-0" />
      <div data-susto="fantasma" className="relative flex flex-col items-center gap-3 opacity-0">
        <svg viewBox="-20 -34 40 46" className="h-48 w-48" fill="none" strokeLinejoin="round">
          <path d="M-14 8 L-14 -10 C-14 -26 14 -26 14 -10 L14 8 L9 4 L4.5 8 L0 4 L-4.5 8 L-9 4 Z" fill="#F4EEFF" stroke="#C9A0FF" strokeWidth="1.2" />
          <circle cx="-5" cy="-11" r="2.2" fill="#2A1A3D" />
          <circle cx="5" cy="-11" r="2.2" fill="#2A1A3D" />
          <ellipse cx="0" cy="-3" rx="3" ry="4" fill="#2A1A3D" />
        </svg>
        <span className="font-titular text-6xl font-bold text-[#F4EEFF]">¡BU!</span>
      </div>
    </div>
  )
}

/** Una explosion de murcielagos que salen del centro hacia todos lados, aleteando. */
function EnjambreDeMurcielagos ({ onTerminar }: PropsEfecto) {
  useEffect(() => {
    const vuelo = animate('[data-enjambre]', {
      translateX: () => utils.random(-60, 60) * 8,
      translateY: () => utils.random(-60, 60) * 5,
      rotate: () => utils.random(-40, 40),
      scale: [0.4, () => utils.random(12, 22) / 10],
      opacity: [0, 1, 1, 0],
      duration: () => utils.random(1500, 2400),
      ease: 'outQuad',
      delay: stagger(40)
    })
    const alas = animate('[data-enjambre] svg', { scaleY: [1, 0.4], duration: 140, ease: 'inOutSine', alternate: true, loop: true })
    const fin = window.setTimeout(onTerminar, 2800)

    return () => { vuelo.revert(); alas.revert(); window.clearTimeout(fin) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-flotante grid place-items-center overflow-hidden">
      {Array.from({ length: 22 }, (_, i) => (
        <span key={i} data-enjambre="" className="decoracion-modo-murcielago-huevo absolute block h-5 w-8 opacity-0">
          <Murcielago className="size-full" />
        </span>
      ))}
    </div>
  )
}

/** Una bruja cruza la pantalla en su escoba, subiendo y bajando y soltando chispas. */
function BrujaEnEscoba ({ onTerminar }: PropsEfecto) {
  useEffect(() => {
    const vuelo = animate('[data-escoba="bruja"]', {
      translateX: ['-20vw', '120vw'],
      translateY: [
        { to: -60, duration: 900, ease: 'inOutSine' },
        { to: 40, duration: 1100, ease: 'inOutSine' },
        { to: -30, duration: 1000, ease: 'inOutSine' }
      ],
      rotate: [{ to: -8, duration: 900 }, { to: 8, duration: 1100 }, { to: -4, duration: 1000 }],
      duration: 3000,
      ease: 'linear',
      onComplete: onTerminar
    })
    const chispas = animate('[data-escoba="chispa"]', {
      opacity: [0.9, 0],
      translateX: () => -utils.random(20, 80),
      translateY: () => utils.random(-14, 14),
      scale: [1, 0.2],
      duration: 700,
      ease: 'outQuad',
      loop: true,
      delay: stagger(110)
    })

    return () => { vuelo.revert(); chispas.revert() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-flotante overflow-hidden">
      <div data-escoba="bruja" style={{ top: '40vh', left: 0 }} className="absolute -translate-x-full">
        <svg viewBox="-30 -22 60 40" className="h-20 w-28">
          <path d="M-28 6 L8 2" stroke="#8A5A2B" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M8 -2 L26 -4 L26 12 L8 8 Z" fill="#D9A441" />
          <path d="M14 -3 L14 10 M19 -3 L19 11 M24 -4 L24 12" stroke="#8A5A2B" strokeWidth="0.9" />
          <circle cx="-8" cy="-8" r="4" fill="#E8C9A8" />
          <path d="M-12 -10 L-8 -22 L-3 -10 Z" fill="#2A1A3D" />
          <path d="M-14 -10 L0 -10" stroke="#2A1A3D" strokeWidth="2" strokeLinecap="round" />
          <path d="M-12 -4 L-8 4 L-2 -2 Z" fill="#5B2A86" />
        </svg>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} data-escoba="chispa" className="absolute top-1/2 right-0 block size-1.5 rounded-full bg-[#FFB067] opacity-0" />
        ))}
      </div>
    </div>
  )
}
