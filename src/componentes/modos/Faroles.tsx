'use client'

import { useRef, useState } from 'react'
import { animate, stagger, utils } from 'animejs'
import { Calabaza } from './Dibujos'
import { elegirDistinta, FRASES_DE_CALABAZA } from './huevos'
import { useAnimacionDeModo } from './useAnimacionDeModo'
import { cumpleConsulta, MENOS_MOVIMIENTO } from '@/lib/useConsultaDeMedios'

/** Lo que dura visible la frase de una calabaza. */
const FRASE_MS = 2200

/**
 * Dos calabazas con vela al pie de la pantalla, a la izquierda (sobre el vacio de la barra lateral).
 * La luz es un resplandor tras cada una que titila con el ritmo irregular de una llama: la
 * animacion es eso, la vela. Y si alguien toca una, se rie, tiembla y suelta una frase.
 */
export function Faroles () {
  const raizRef = useAnimacionDeModo<HTMLDivElement>((raiz) => [
    animate(raiz.querySelectorAll('[data-luz]'), {
      opacity: [0.35, 0.85],
      scale: [0.92, 1.06],
      duration: () => utils.random(420, 900),
      ease: 'inOutSine',
      alternate: true,
      loop: true,
      delay: stagger(220)
    })
  ])

  return (
    <div ref={raizRef} className="absolute bottom-3 left-4 hidden items-end gap-2 md:flex">
      <FarolConLuz tamano="size-11" />
      <FarolConLuz tamano="size-16" />
    </div>
  )
}

function FarolConLuz ({ tamano }: { tamano: string }) {
  const botonRef = useRef<HTMLButtonElement | null>(null)
  const [frase, setFrase] = useState<string | null>(null)
  const anteriorRef = useRef<string | null>(null)
  const relojRef = useRef<number | undefined>(undefined)

  /** Tiembla, se hincha un instante y dice algo; la frase se va sola. */
  function hablar (): void {
    const boton = botonRef.current
    const elegida = elegirDistinta(FRASES_DE_CALABAZA, anteriorRef.current)

    anteriorRef.current = elegida
    setFrase(elegida)
    window.clearTimeout(relojRef.current)
    relojRef.current = window.setTimeout(() => { setFrase(null) }, FRASE_MS)

    if (boton === null || cumpleConsulta(MENOS_MOVIMIENTO)) return
    animate(boton, {
      rotate: [0, -10, 10, -7, 7, 0],
      scale: [1, 1.18, 1],
      duration: 520,
      ease: 'inOutSine'
    })
  }

  return (
    <span className="relative block">
      <span data-luz="" aria-hidden className="decoracion-modo-luz absolute -inset-3 rounded-full opacity-60" />
      <button
        ref={botonRef}
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={hablar}
        className="pointer-events-auto relative block cursor-pointer"
      >
        <Calabaza className={tamano} />
      </button>
      {frase !== null && (
        <span
          aria-hidden
          className="decoracion-modo-globo absolute bottom-full left-0 mb-2 w-max max-w-48 rounded-xl px-3 py-1.5 text-xs font-medium"
        >
          {frase}
        </span>
      )}
    </span>
  )
}
