'use client'

import { useEffect, type RefObject } from 'react'

/**
 * Deja inerte todo el documento salvo el elemento dado mientras `activa` sea `true`.
 *
 * Es la trampa de foco de la hoja a pantalla completa del orbe en móvil: ahí el panel tapa la
 * página, así que el foco y el lector de pantalla no deben poder salir a lo de atrás. En escritorio
 * el panel es flotante y no modal, y esto no se activa.
 *
 * Marca como `inert` a los hermanos de cada ancestro del elemento, no al elemento ni a sus
 * ancestros, y al terminar restaura solo lo que él marcó.
 *
 * @param elemento Ref del elemento que se queda activo.
 * @param activa Si el aislamiento está en vigor.
 */
export function useAislarFondo (elemento: RefObject<HTMLElement | null>, activa: boolean): void {
  useEffect(() => {
    const caja = elemento.current
    if (!activa || caja === null) return

    const aislados: HTMLElement[] = []
    let nodo: HTMLElement = caja
    while (nodo.parentElement !== null && nodo !== document.body) {
      const padre: HTMLElement = nodo.parentElement
      for (const hermano of Array.from(padre.children)) {
        if (hermano !== nodo && hermano instanceof HTMLElement && !hermano.inert) {
          hermano.inert = true
          aislados.push(hermano)
        }
      }
      nodo = padre
    }

    return () => { for (const aislado of aislados) aislado.inert = false }
  }, [elemento, activa])
}
