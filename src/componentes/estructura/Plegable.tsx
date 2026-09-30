'use client'

import { useState, type ReactElement, type ReactNode, type TransitionEvent } from 'react'
import { cn } from '@/lib/clases'

interface PropsPlegable {
  abierto: boolean
  /** Lo apunta el `aria-controls` del botón que pliega. */
  id?: string
  children: ReactNode
  /** Clases del contenedor exterior, el que anima el alto. */
  className?: string
  /** Clases del contenido. El espaciado respecto de lo de arriba va acá (`pt-*`), no como `gap` del
   * padre: plegado, el panel sigue montado con alto cero y un `gap` dejaría el hueco igual. */
  claseContenido?: string
}

/**
 * El panel de un acordeón o de un "ver más": se despliega y se repliega animando su alto.
 *
 * El alto se anima con `grid-template-rows: 0fr → 1fr` y no con `height`: el navegador no interpola
 * hasta `auto`, y medir el contenido con JavaScript obligaría a volver a medir cada vez que cambia.
 * La fila de la rejilla sí se interpola y sigue sola al contenido.
 *
 * Plegado queda montado pero `inert`: `aria-controls` apunta siempre a un elemento que existe, como
 * pide el patrón de divulgación, y el contenido sale del tabulador y del lector de pantalla igual
 * que con `hidden`.
 *
 * El recorte (`overflow-hidden`) solo dura lo que la transición. Abierto y asentado se suelta, para
 * no cortar los anillos de foco ni las sombras de lo que hay adentro. Con movimiento reducido la
 * transición dura 0.01ms (`neo.css`) y el `transitionend` llega igual.
 *
 * @param abierto si el panel está desplegado
 * @param id id del panel, para el `aria-controls` del disparador
 */
export function Plegable ({ abierto, id, children, className, claseContenido }: PropsPlegable): ReactElement {
  // En qué estado terminó la última transición. Mientras no coincide con `abierto`, está en viaje.
  const [asentadoEn, setAsentadoEn] = useState(abierto)
  const recortado = !abierto || asentadoEn !== abierto

  const alTerminarTransicion = (evento: TransitionEvent<HTMLDivElement>): void => {
    if (evento.target !== evento.currentTarget || evento.propertyName !== 'grid-template-rows') return
    setAsentadoEn(abierto)
  }

  return (
    <div
      id={id}
      inert={!abierto}
      onTransitionEnd={alTerminarTransicion}
      className={cn(
        'ease-neo grid transition-[grid-template-rows,opacity] duration-rapida',
        abierto ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        className
      )}
    >
      {/* El contenido va un nivel más adentro: un `padding` en la fila que se anima no baja de su
          propio alto, y plegado dejaría asomar esa franja. */}
      <div className={cn('min-h-0', recortado && 'overflow-hidden')}>
        <div className={claseContenido}>{children}</div>
      </div>
    </div>
  )
}
