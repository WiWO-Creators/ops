'use client'

import { animate, stagger, svg } from 'animejs'
import { Telarana } from './Dibujos'
import { useAnimacionDeModo } from './useAnimacionDeModo'

/** Lo que tarda cada tela en tejerse al entrar, en milisegundos. */
const TEJIDO_MS = 1800

/**
 * Telarañas en las cuatro esquinas. Al entrar los hilos se dibujan solos, uno tras otro, y despues
 * se quedan quietos: la animacion cuenta que alguien las teje; dejarlas moviéndose seria ruido.
 * Las de abajo son mas chicas para no tapar la barra lateral ni el orbe.
 */
export function Telas () {
  const raizRef = useAnimacionDeModo<HTMLDivElement>((raiz) => {
    const hilos = svg.createDrawable(raiz.querySelectorAll('[data-hilo]'))

    return [animate(hilos, {
      draw: ['0 0', '0 1'],
      duration: TEJIDO_MS,
      ease: 'inOutQuad',
      delay: stagger(60)
    })]
  })

  return (
    <div ref={raizRef}>
      <Telarana className="decoracion-modo-tela absolute top-0 left-0 size-28 sm:size-40" />
      <Telarana className="decoracion-modo-tela absolute top-0 right-0 size-28 -scale-x-100 sm:size-40" />
      <Telarana className="decoracion-modo-tela absolute bottom-0 left-0 hidden size-24 -scale-y-100 md:block" />
      <Telarana className="decoracion-modo-tela absolute right-0 bottom-0 hidden size-24 -scale-100 md:block" />
    </div>
  )
}
