'use client'

import { Ghost } from 'lucide-react'
import { MODOS } from '@/dominio/modos-especiales'
import { cn } from '@/lib/clases'
import { fijarModoPropio, useEstadoDeModo } from '@/lib/modo-especial'

/**
 * Boton junto al selector de tema para apagar (o volver a prender) el modo especial solo para uno.
 *
 * Es una preferencia del navegador, no del servidor: sirve para quien lo encuentra molesto o lo
 * necesita quieto por accesibilidad. Solo aparece mientras hay un modo vigente.
 */
export function InterruptorDeModo ({ className }: { className?: string }) {
  const { vigente, activo } = useEstadoDeModo()

  if (vigente === null) return null

  const nombre = MODOS[vigente].nombre
  const encendido = activo !== null
  const titulo = encendido ? `Apagar el modo ${nombre}` : `Prender el modo ${nombre}`

  return (
    <button
      type="button"
      onClick={() => { fijarModoPropio(vigente, !encendido) }}
      title={titulo}
      aria-label={titulo}
      aria-pressed={encendido}
      className={cn(
        'border-linea bg-superficie-hundida text-texto-tenue hover:text-texto hover:bg-superficie-elevada',
        'grid size-9 place-items-center rounded-control border transition-colors duration-rapida ease-neo',
        'aria-pressed:text-acento',
        'focus-visible:outline-acento focus-visible:outline-2 focus-visible:outline-offset-2',
        className
      )}
    >
      <Ghost aria-hidden className="size-4" />
    </button>
  )
}
