'use client'

import { useEffect, useState } from 'react'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { editoresDelDocumento, type EditoresDelDocumento } from '@/dominio/acta-colaborativa'

const NADIE: EditoresDelDocumento = { personas: [], orbe: false }

/** Dos resultados son el mismo si nombran a las mismas personas (con su foto) y coincide lo del asistente. */
function mismosEditores (a: EditoresDelDocumento, b: EditoresDelDocumento): boolean {
  return a.orbe === b.orbe
    && a.personas.length === b.personas.length
    && a.personas.every((persona, indice) => {
      const otra = b.personas[indice]

      return otra !== undefined && otra.id === persona.id && otra.profile_image_url === persona.profile_image_url
    })
}

/**
 * Quiénes más están en el documento que se edita, según la presencia (awareness) de Yjs.
 *
 * La presencia cambia con cada movimiento del cursor ajeno; si el resultado es el mismo se conserva
 * el anterior, así que no hay una renderización por cada tecla ajena.
 *
 * @param provider el proveedor de la sesión, o `null` mientras no hay una
 * @param yoId id de quien mira, que no se cuenta a sí misma
 * @returns las demás personas y si el asistente está escribiendo
 */
export function useEditoresDelDocumento (provider: HocuspocusProvider | null, yoId: number): EditoresDelDocumento {
  const [editores, setEditores] = useState<EditoresDelDocumento>(NADIE)

  useEffect(() => {
    const awareness = provider?.awareness

    if (awareness === undefined || awareness === null) return

    const recalcular = (): void => {
      const siguiente = editoresDelDocumento(awareness.getStates().values(), yoId)

      setEditores((actual) => mismosEditores(actual, siguiente) ? actual : siguiente)
    }

    awareness.on('change', recalcular)
    recalcular()

    return () => {
      awareness.off('change', recalcular)
      setEditores(NADIE)
    }
  }, [provider, yoId])

  return editores
}
