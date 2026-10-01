'use client'

import { animate, stagger, utils } from 'animejs'
import { Calabaza } from './Dibujos'
import { useAnimacionDeModo } from './useAnimacionDeModo'

/**
 * Dos calabazas con vela al pie de la pantalla, a la izquierda (sobre el vacio de la barra lateral).
 * La luz es un resplandor tras cada una que titila con el ritmo irregular de una llama: la
 * animacion es eso, la vela. La calabaza en si no se mueve.
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
  return (
    <span className="relative block">
      <span data-luz="" aria-hidden className="decoracion-modo-luz absolute -inset-3 rounded-full opacity-60" />
      <Calabaza className={`relative ${tamano}`} />
    </span>
  )
}
