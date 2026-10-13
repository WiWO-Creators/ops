'use client'

import type { ReactElement } from 'react'
import { ambitoDeOrbe, useFaseDeAmbito } from '@/dominio/fase-orbe'
import { cn } from '@/lib/clases'

/**
 * Un punto de aviso cuando la conversación de un ámbito espera una respuesta de la persona.
 *
 * No es una animación infinita (el botón flotante y las pestañas están siempre a la vista): el
 * punto está quieto, y lo dice también en texto para quien no ve el color.
 *
 * @param proyectoId Proyecto del hilo; sin él, el hilo global del equipo.
 * @param className Clases de posición/tamaño del llamador.
 * @returns El punto, o nada si no hay nada que responder.
 */
export function PuntoDeEspera ({ proyectoId, className }: { proyectoId?: number, className?: string }): ReactElement | null {
  const fase = useFaseDeAmbito(ambitoDeOrbe('staff', proyectoId))
  if (fase !== 'esperando') return null

  return (
    <span role="img" aria-label="Espera tu respuesta" title="Espera tu respuesta" className={cn('bg-relleno-aviso inline-block size-2 rounded-full', className)} />
  )
}
