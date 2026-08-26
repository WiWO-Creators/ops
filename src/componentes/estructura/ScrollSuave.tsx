'use client'

import { ReactLenis } from 'lenis/react'
import 'lenis/dist/lenis.css'

/**
 * El contenedor de scroll del armazon, con inercia.
 *
 * El scroll de esta aplicacion no vive en el `body` —`globals.css` lo deja en `overflow: hidden`
 * porque el armazon mide exactamente la ventana— sino en un contenedor interno. Por eso Lenis se
 * monta con `root="asChild"`: es el modo que le deja usar un scroller propio en vez del documento,
 * manteniendo la instancia accesible con `useLenis` para quien la necesite mas adelante.
 *
 * `ReactLenis` renderiza sus propios divs de envoltorio y contenido, asi que el `<main>` va adentro:
 * el scroll es del envoltorio y la marca semantica sigue siendo del `<main>`, que es lo que importa
 * para un lector de pantalla. El relleno queda en el envoltorio y no en el `<main>` para que el
 * scroll siga midiendo lo mismo que media antes, cuando el `<main>` era el que scrolleaba.
 *
 * Sobre las opciones:
 *
 * - `duration: 0.8` en vez del 1.2 de fabrica. Un panel de trabajo se recorre buscando una fila, no
 *   leyendo una portada: mas de eso deja de leerse como inercia y empieza a leerse como demora.
 * - `allowNestedScroll: false` a proposito. La alternativa recorre el arbol del DOM en cada evento
 *   de scroll; sale mas barato marcar a mano los pocos contenedores anidados con `data-lenis-prevent`
 *   (hoy: la lista de `AccionesMasivasTareas`).
 * - `respectReducedMotion: true` explicito, aunque sea el valor por defecto. Es JS: el bloque
 *   `prefers-reduced-motion` de `neo.css` cubre el CSS de toda la interfaz pero no llega hasta aca, y
 *   el scroll con inercia es justo el tipo de movimiento que marea a quien pidio menos.
 *
 * @param className clases del contenedor que scrollea, relleno incluido
 * @param children el contenido de la pantalla
 * @returns el armazon de scroll con el `<main>` adentro
 */
export function ScrollSuave ({ className, children }: { className?: string, children: React.ReactNode }) {
  return (
    <ReactLenis
      root="asChild"
      className={className}
      options={{
        duration: 0.8,
        allowNestedScroll: false,
        respectReducedMotion: true
      }}
    >
      <main>{children}</main>
    </ReactLenis>
  )
}
