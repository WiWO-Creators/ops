'use client'

import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { animate, stagger } from 'animejs'
import { cumpleConsulta, MENOS_MOVIMIENTO } from '@/lib/useConsultaDeMedios'

interface PropsEntradaEscalonada {
  /**
   * El contenido a envolver, ya armado por quien llama (tipicamente un Server Component). Se marca
   * con `data-entrada="cabecera"` en el elemento que entra primero y `data-entrada="item"` en cada
   * fila que entra despues, de a una.
   */
  children: ReactNode
}

/**
 * Envoltorio cliente, minimo, para hacer entrar una lista en dos tiempos: la cabecera primero y
 * despues los items, escalonados.
 *
 * Busca los elementos por atributo dentro de su propio subarbol en vez de recibir un ref por fila:
 * asi la pagina que arma la lista —casi siempre un Server Component, como `novedades/page.tsx`— no
 * necesita volverse cliente entera para poder animar. Solo marca sus elementos y los envuelve aca.
 *
 * Con `prefers-reduced-motion` no hace nada: el contenido queda tal cual el marcado lo deja, que ya
 * es su estado final. Es tambien la garantia contra el destello sin animar: sin JavaScript, o antes
 * de que el efecto corra, se ve el contenido completo y no un hueco vacio.
 */
export function EntradaEscalonada ({ children }: PropsEntradaEscalonada) {
  const raizRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const raiz = raizRef.current

    if (raiz === null || cumpleConsulta(MENOS_MOVIMIENTO)) return

    const cabecera = raiz.querySelectorAll('[data-entrada="cabecera"]')
    const items = raiz.querySelectorAll('[data-entrada="item"]')

    if (cabecera.length > 0) {
      animate(cabecera, { opacity: [0, 1], translateY: [-8, 0], duration: 320, ease: 'outQuad' })
    }

    if (items.length > 0) {
      animate(items, {
        opacity: [0, 1],
        translateY: [10, 0],
        duration: 360,
        ease: 'outQuad',
        delay: stagger(45, { start: cabecera.length > 0 ? 160 : 0 })
      })
    }
  }, [])

  return <div ref={raizRef}>{children}</div>
}
