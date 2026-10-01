'use client'

import { animate } from 'animejs'
import { useAnimacionDeModo } from './useAnimacionDeModo'

/**
 * Dos bancos de niebla en la base de la pantalla que derivan en sentidos contrarios. Son gradientes
 * muy suaves: la niebla se nota como atmosfera, no como una capa que tape lo que hay debajo.
 */
export function Niebla () {
  const raizRef = useAnimacionDeModo<HTMLDivElement>((raiz) => [
    animate(raiz.querySelectorAll('[data-niebla="a"]'), {
      translateX: ['-6vw', '6vw'], duration: 32_000, ease: 'inOutSine', alternate: true, loop: true
    }),
    animate(raiz.querySelectorAll('[data-niebla="b"]'), {
      translateX: ['5vw', '-5vw'], duration: 41_000, ease: 'inOutSine', alternate: true, loop: true
    })
  ])

  return (
    <div ref={raizRef}>
      <div data-niebla="a" className="decoracion-modo-niebla absolute -right-[10vw] -bottom-8 -left-[10vw] h-[26vh]" />
      <div data-niebla="b" className="decoracion-modo-niebla decoracion-modo-niebla-2 absolute -right-[10vw] -bottom-12 -left-[10vw] h-[20vh]" />
    </div>
  )
}
