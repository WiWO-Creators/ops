'use client'

import { animate, stagger, utils } from 'animejs'
import { Murcielago } from './Dibujos'
import { useAnimacionDeModo } from './useAnimacionDeModo'

/** Cuantos cruzan juntos en cada oleada, y cuantos cuelgan boca abajo de la cabecera. */
const EN_VUELO = 3
const COLGADOS = 3
/** Lo que tarda una oleada en cruzar la pantalla, y la pausa entre una y la siguiente. */
const CRUCE_MS = 14_000
const PAUSA_MS = 38_000
/** Cada cuanto aletea. */
const ALETEO_MS = 260

/**
 * Murciélagos de dos clases. Una oleada cruza la pantalla entera cada tanto, aleteando y subiendo y
 * bajando, y despues deja la pantalla en paz casi cuarenta segundos. Y unos pocos cuelgan boca abajo
 * del borde de la cabecera, balanceandose apenas.
 *
 * Con menos movimiento los de vuelo no se muestran (la hoja de estilos los esconde) y los colgados
 * quedan quietos.
 */
export function Murcielagos () {
  const raizRef = useAnimacionDeModo<HTMLDivElement>((raiz) => {
    const vuelo = raiz.querySelectorAll('[data-murcielago]')
    const alas = raiz.querySelectorAll('[data-murcielago] svg')
    const colgados = raiz.querySelectorAll('[data-murcielago-colgado]')

    return [
      animate(vuelo, {
        translateX: ['-12vw', '112vw'],
        translateY: [
          { to: () => utils.random(-30, 30), duration: CRUCE_MS / 3, ease: 'inOutSine' },
          { to: () => utils.random(-40, 40), duration: CRUCE_MS / 3, ease: 'inOutSine' },
          { to: () => utils.random(-20, 20), duration: CRUCE_MS / 3, ease: 'inOutSine' }
        ],
        duration: CRUCE_MS,
        ease: 'linear',
        loop: true,
        loopDelay: PAUSA_MS,
        delay: stagger(700)
      }),
      animate(alas, { scaleY: [1, 0.45], duration: ALETEO_MS, ease: 'inOutSine', alternate: true, loop: true }),
      animate(colgados, {
        rotate: [-7, 7],
        duration: 2600,
        ease: 'inOutSine',
        alternate: true,
        loop: true,
        delay: stagger(450)
      })
    ]
  })

  return (
    <div ref={raizRef}>
      {Array.from({ length: EN_VUELO }, (_, i) => (
        <span
          key={`v${i}`}
          data-murcielago=""
          style={{ top: `${14 + i * 17}vh`, left: 0 }}
          className="decoracion-modo-murcielago decoracion-modo-vuelo absolute block h-5 w-8 -translate-x-full sm:h-6 sm:w-10"
        >
          <Murcielago className="size-full" />
        </span>
      ))}
      {Array.from({ length: COLGADOS }, (_, i) => (
        <span
          key={`c${i}`}
          data-murcielago-colgado=""
          style={{ top: 50, left: `${34 + i * 16}vw`, transformOrigin: '50% 0' }}
          className="decoracion-modo-murcielago absolute hidden h-4 w-6 rotate-180 md:block"
        >
          <Murcielago className="size-full" />
        </span>
      ))}
    </div>
  )
}
