'use client'

import { MonitorUp } from 'lucide-react'
import { ParticipantTile, VideoTrack, isTrackReference, type TrackReferenceOrPlaceholder } from '@livekit/components-react'
import { cn } from '@/lib/clases'

interface PropsFichaDePantalla {
  pista: TrackReferenceOrPlaceholder
  className?: string
}

/**
 * Ficha de una pantalla compartida dentro de la llamada.
 *
 * A diferencia de `FichaParticipante`, no tiene estado "apagado": una pantalla sin pista no se
 * comparte, así que esta ficha directamente no renderiza nada si `pista` llega como marcador de
 * posición (sin publicación real detrás).
 *
 * Es una ficha propia y no el `ParticipantTile` de fábrica porque el contenido por defecto de la
 * librería escribe el literal en inglés `"'s screen"` (ver
 * node_modules/@livekit/components-react/dist/prefabs-BEB1UEnC.mjs:720), y el proyecto responde
 * siempre en español.
 */
export function FichaDePantalla ({ pista, className }: PropsFichaDePantalla) {
  if (!isTrackReference(pista)) return null

  const nombre = pista.participant.name || pista.participant.identity

  return (
    <ParticipantTile
      trackRef={pista}
      className={cn('ficha-video relative overflow-hidden rounded-medio lienzo-video', className)}
    >
      <VideoTrack trackRef={pista} />

      <div className="sobre-video absolute bottom-2 left-2 flex items-center gap-1 rounded-control px-2 py-1 text-xs">
        <MonitorUp className="size-3.5" />
        <span className="max-w-48 truncate">Pantalla de {nombre}</span>
      </div>
    </ParticipantTile>
  )
}
