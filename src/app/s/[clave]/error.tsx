'use client'

import type { ReactElement } from 'react'
import './panel.css'

/**
 * Red de contencion del tablero de mantenimiento.
 *
 * Sin este limite, un fallo subia al `error.tsx` global de Ops y el tablero cambiaba de mundo a
 * mitad de una intervencion. Se queda en la misma terminal y ofrece reintentar con `retry`, que
 * vuelve a pedir el estado al servidor: lo que suele caerse aca es la lectura, no el dibujo.
 *
 * No muestra el mensaje del error: la ruta no debe dejar rastro de la API ni de la base en pantalla.
 *
 * @param retry vuelve a pedir y dibujar el segmento
 * @returns la pantalla de fallo con el boton de reintento
 */
export default function ErrorDelTablero ({ retry }: {
  error: Error & { digest?: string }
  retry: () => void
}): ReactElement {
  return (
    <div className="pn">
      <header className="pn__cab">
        <h1 className="pn__titulo">Sin lectura</h1>
      </header>

      <div className="pn__cuerpo">
        <section className="pn__bloque pn__ancho" role="alert">
          <p className="pn__rotulo">Estado</p>
          <p className="pn__clave">
            No se pudo leer el estado de la instalación. Nada cambió: los interruptores siguen como
            estaban.
          </p>
          <div className="pn__confirmar-botones">
            <button type="button" className="pn__boton" onClick={() => { retry() }}>
              Reintentar
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
