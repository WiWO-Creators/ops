'use client'

import { useState } from 'react'

/** En que va la carga de una lista que se pide al abrir un menu. */
export type ListaPerezosa<T> =
  | { fase: 'sinPedir' }
  | { fase: 'cargando' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', lista: T[] }

/**
 * Una lista que se pide al abrir un menu por primera vez, y de nuevo si la anterior fallo.
 *
 * Los menus de un ticket (asignado, respuestas predefinidas) piden su lista al abrirse y no al abrir
 * el ticket: la mayoria de las veces el ticket se lee y no se reasigna ni se responde con plantilla.
 * Mientras carga o si ya esta lista, abrir de nuevo no pide nada.
 *
 * @param cargar lo que trae la lista; puede rechazar con un `Error`
 * @param mensajeDeFallo el texto cuando el rechazo no trae un mensaje propio
 * @returns el estado de la carga y `pedir`, que se llama al abrir el menu
 */
export function useListaPerezosa<T> (
  cargar: () => Promise<T[]>,
  mensajeDeFallo: string
): { estado: ListaPerezosa<T>, pedir: () => void } {
  const [estado, setEstado] = useState<ListaPerezosa<T>>({ fase: 'sinPedir' })

  function pedir (): void {
    if (estado.fase === 'listo' || estado.fase === 'cargando') return

    setEstado({ fase: 'cargando' })
    cargar()
      .then((lista) => { setEstado({ fase: 'listo', lista }) })
      .catch((fallo: unknown) => {
        setEstado({ fase: 'error', mensaje: fallo instanceof Error ? fallo.message : mensajeDeFallo })
      })
  }

  return { estado, pedir }
}
