'use client'

import { Track } from 'livekit-client'
import {
  ConnectionQualityIndicator,
  ParticipantTile,
  TrackMutedIndicator,
  VideoTrack,
  isTrackReference,
  useIsMuted,
  type TrackReferenceOrPlaceholder
} from '@livekit/components-react'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { imagenDeMetadata } from '@/dominio/teletrabajo'
import { cn } from '@/lib/clases'

interface PropsFichaParticipante {
  pista: TrackReferenceOrPlaceholder
  /** Identidad de quien mira, para marcar su propia ficha con "Tú". */
  miIdentidad: string
  className?: string
  /** Medida exacta que le da el mosaico. */
  style?: React.CSSProperties
}

/**
 * Ficha de un participante dentro de la llamada: su video, o su avatar si la cámara está apagada.
 *
 * Usa `ParticipantTile` como cáscara y le reemplaza el contenido: la cáscara conserva los atributos
 * `data-lk-*` de los que depende el CSS de la librería (espejo de cámara propia, anillo de "está
 * hablando", `object-fit`), pero su contenido de fábrica no resuelve el caso de cámara apagada con
 * el `Avatar` del proyecto.
 */
export function FichaParticipante ({ pista, miIdentidad, className, style }: PropsFichaParticipante) {
  const mudo = useIsMuted(pista)
  const hayVideo = isTrackReference(pista) && !mudo
  const nombre = pista.participant.name || pista.participant.identity
  const esMiFicha = pista.participant.identity === miIdentidad

  return (
    <ParticipantTile
      trackRef={pista}
      style={style}
      className={cn('ficha-video lienzo-video relative overflow-hidden rounded-medio', className)}
    >
      {hayVideo
        ? <VideoTrack trackRef={pista} />
        : (
          // Cámara apagada sin este relleno = ficha vacía: el bug reportado como "no sale mi
          // nombre, nada". El Avatar cubre la cámara apagada con las iniciales o la foto.
          <div className="absolute inset-0 grid place-items-center">
            {/* Mas grande que el `grande` del sistema: aca el avatar no acompaña a un nombre en
                una fila, es lo unico que ocupa un recuadro de video. Al tamaño de una fila de tabla
                se leeria como un error de carga. */}
            <Avatar
              nombre={nombre}
              imagen={imagenDeMetadata(pista.participant.metadata)}
              tamano="grande"
              className="size-16 text-lg"
            />
          </div>
          )}

      <div className="sobre-video absolute bottom-2 left-2 flex items-center gap-1 rounded-control px-2 py-1 text-xs">
        <TrackMutedIndicator trackRef={{ participant: pista.participant, source: Track.Source.Microphone }} show="muted" />
        <span className="max-w-32 truncate">{nombre}</span>
        {esMiFicha && <span>· Tú</span>}

        {/* Va dentro del chip y no suelto en una esquina: el CSS de la libreria lo mantiene
            invisible salvo cuando la conexion es mala, y un envoltorio propio en la esquina dejaba
            un cuadro oscuro flotando encima del video todo el tiempo, con el icono apagado. */}
        <ConnectionQualityIndicator />
      </div>
    </ParticipantTile>
  )
}
