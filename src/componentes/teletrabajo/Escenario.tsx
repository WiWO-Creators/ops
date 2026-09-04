'use client'

import { Track } from 'livekit-client'
import { useTracks } from '@livekit/components-react'
import { cn } from '@/lib/clases'
import { EstadoSolo } from './EstadoSolo'
import { FichaDePantalla } from './FichaDePantalla'
import { FichaParticipante } from './FichaParticipante'
import { Mosaico } from './Mosaico'

interface PropsEscenario {
  /** Identidad de quien mira, para reconocer su propia ficha. */
  miIdentidad: string
  className?: string
}

/**
 * Los videos de la sala.
 *
 * Tres repartos, y cada uno existe porque el anterior falla en su caso:
 *
 * - **Con pantalla compartida**, esa pista pasa al foco y las camaras bajan a una tira. En grilla
 *   pareja la pantalla queda del tamaño de una cara, que es ilegible: compartir una pantalla sin
 *   poder leerla no es compartir pantalla.
 * - **Con una sola persona**, un estado propio (ver `EstadoSolo`).
 * - **Con dos o mas**, el mosaico medido.
 */
export function Escenario ({ miIdentidad, className }: PropsEscenario) {
  const pistas = useTracks(
    [
      // Con marcador: quien no publica camara igual ocupa un lugar. Sin eso, una sala de cinco
      // personas con las camaras apagadas se ve vacia y parece rota.
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false }
    ],
    { onlySubscribed: false }
  )

  const pantallas = pistas.filter((pista) => pista.source === Track.Source.ScreenShare)
  const camaras = pistas.filter((pista) => pista.source === Track.Source.Camera)

  const [pantalla, ...otrasPantallas] = pantallas

  if (pantalla !== undefined) {
    return (
      <div className={cn('flex min-h-0 min-w-0 flex-col gap-3 lg:flex-row', className)}>
        <FichaDePantalla pista={pantalla} className="min-h-0 min-w-0 flex-1" />

        {/* La tira scrollea sola. `data-lenis-prevent` la saca del scroll suave del armazon: sin
            eso Lenis se come el gesto y la tira no se mueve. */}
        <div
          data-lenis-prevent
          className="flex shrink-0 gap-3 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto"
        >
          {/* Nada de descartar en silencio la segunda pantalla compartida: el foco es uno solo,
              pero quien la esta compartiendo tiene que poder verse en la tira, o cree que no esta
              compartiendo nada. */}
          {otrasPantallas.map((otra) => (
            <FichaDePantalla
              key={`pantalla-${otra.participant.identity}`}
              pista={otra}
              className="aspect-video w-40 shrink-0 lg:w-full"
            />
          ))}

          {camaras.map((camara) => (
            <FichaParticipante
              key={camara.participant.identity}
              pista={camara}
              miIdentidad={miIdentidad}
              className="aspect-video w-40 shrink-0 lg:w-full"
            />
          ))}
        </div>
      </div>
    )
  }

  // `camaras[0]` siempre existe estando conectado: el marcador propio se crea aunque la camara este
  // apagada. La guarda cubre el instante entre que LiveKit conecta y publica el primer marcador.
  const primera = camaras[0]

  if (camaras.length <= 1 && primera !== undefined) {
    return <EstadoSolo pista={primera} miIdentidad={miIdentidad} className={cn('flex-1', className)} />
  }

  return <Mosaico pistas={camaras} miIdentidad={miIdentidad} className={cn('flex-1', className)} />
}
