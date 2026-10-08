'use client'

import { animate, utils } from 'animejs'
import { useAnimacionDeModo } from './useAnimacionDeModo'

const BRASAS = 16

/**
 * Brasas que suben despacio desde abajo de la pantalla y se apagan. Puntos de 3 px, de dos colores
 * de la paleta, cada uno a su ritmo: es el movimiento de fondo, constante y lineal, que da vida al
 * resto sin pedir atencion.
 */
export function Brasas () {
  const raizRef = useAnimacionDeModo<HTMLDivElement>((raiz) => [
    animate(raiz.querySelectorAll('[data-brasa]'), {
      translateY: ['0vh', () => `${-utils.random(60, 110)}vh`],
      translateX: () => utils.random(-60, 60),
      opacity: [{ to: 0.7, duration: 1500 }, { to: 0, duration: 9000 }],
      duration: () => utils.random(11_000, 22_000),
      delay: () => utils.random(0, 12_000),
      ease: 'linear',
      loop: true
    })
  ])

  return (
    <div ref={raizRef} className="decoracion-modo-vuelo">
      {Array.from({ length: BRASAS }, (_, i) => (
        <span
          key={i}
          data-brasa=""
          style={{ left: `${(i * 61 + 7) % 100}vw`, bottom: '-2vh' }}
          className={`absolute block size-[3px] rounded-full opacity-0 ${i % 3 === 0 ? 'decoracion-modo-brasa-morada' : 'decoracion-modo-brasa'}`}
        />
      ))}
    </div>
  )
}
