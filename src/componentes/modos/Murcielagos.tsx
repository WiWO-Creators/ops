'use client'

import { animate, stagger, utils } from 'animejs'
import { cumpleConsulta, MENOS_MOVIMIENTO } from '@/lib/useConsultaDeMedios'
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

/** Cuanto tarda un murcielago colgado, asustado, en volver a su lugar. */
const REGRESO_MS = 9000

/**
 * Hace huir a un murcielago colgado: sale volando hacia arriba y a un lado, y mas tarde vuelve a
 * colgarse donde estaba. Solo toca `translate` y `opacity`: el balanceo vive en `rotate`.
 */
function asustar (colgado: HTMLElement): void {
  if (cumpleConsulta(MENOS_MOVIMIENTO) || colgado.dataset.huyendo === '1') return

  const lado = utils.random(0, 1) === 0 ? -1 : 1

  colgado.dataset.huyendo = '1'
  animate(colgado, {
    translateX: lado * utils.random(120, 260),
    translateY: -utils.random(90, 160),
    opacity: [0.6, 0],
    duration: 900,
    ease: 'inQuad',
    onComplete: () => {
      animate(colgado, {
        translateX: 0,
        translateY: 0,
        opacity: [0, 0.6],
        duration: 1400,
        delay: REGRESO_MS,
        ease: 'outQuad',
        onComplete: () => { delete colgado.dataset.huyendo }
      })
    }
  })
}

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
          onClick={(evento) => { asustar(evento.currentTarget) }}
          className="decoracion-modo-murcielago pointer-events-auto absolute hidden h-4 w-6 cursor-pointer rotate-180 md:block"
        >
          <Murcielago className="size-full" />
        </span>
      ))}
    </div>
  )
}
