'use client'

import { useState } from 'react'
import { Track } from 'livekit-client'
import { useSpeakingParticipants, useTracks, type TrackReferenceOrPlaceholder } from '@livekit/components-react'
import { hasta } from '@/lib/breakpoints'
import { cn } from '@/lib/clases'
import { useConsultaDeMedios } from '@/lib/useConsultaDeMedios'
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
 * - **Con dos o mas**, el mosaico medido. En un telefono en vertical, en cambio, una persona a
 *   pantalla completa y las demas en una tira abajo (`EscenarioVertical`): un mosaico de 2x2 en 360px
 *   deja cuatro caras del tamaño de una estampilla.
 */
export function Escenario ({ miIdentidad, className }: PropsEscenario) {
  const vertical = useConsultaDeMedios(`${hasta('md')} and (orientation: portrait)`)
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

  if (vertical) return <EscenarioVertical camaras={camaras} miIdentidad={miIdentidad} className={className} />

  return <Mosaico pistas={camaras} miIdentidad={miIdentidad} className={cn('flex-1', className)} />
}

interface PropsEscenarioVertical {
  camaras: TrackReferenceOrPlaceholder[]
  miIdentidad: string
  className?: string
}

/**
 * Una persona a pantalla completa y la tira con el resto, para el telefono en vertical.
 *
 * En el foco va quien habla; si nadie habla, la primera persona que no es uno mismo —verse a uno
 * mismo en grande es lo que menos sirve en una llamada—. Tocar una ficha de la tira la fija en el
 * foco hasta volver a tocarla, para seguir a alguien que comparte algo con la camara aunque otro
 * hable.
 */
function EscenarioVertical ({ camaras, miIdentidad, className }: PropsEscenarioVertical) {
  const [fijada, setFijada] = useState<string | null>(null)
  const hablando = useSpeakingParticipants()

  const foco = elegirFoco(camaras, miIdentidad, fijada, hablando.map((p) => p.identity))
  if (foco === undefined) return null
  const tira = camaras.filter((camara) => camara !== foco)

  return (
    <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col gap-2', className)}>
      <FichaParticipante
        key={`foco-${foco.participant.identity}`}
        pista={foco}
        miIdentidad={miIdentidad}
        className="animate-aparecer min-h-0 w-full flex-1 [&_video]:object-cover"
      />

      {/* `data-lenis-prevent`: la tira scrollea sola, y Lenis se comeria el gesto horizontal. */}
      <div data-lenis-prevent className="flex shrink-0 snap-x gap-2 overflow-x-auto pb-1">
        {tira.map((camara) => {
          const identidad = camara.participant.identity
          const nombre = camara.participant.name || identidad
          return (
            <button
              key={identidad}
              type="button"
              aria-pressed={fijada === identidad}
              aria-label={fijada === identidad ? `Dejar de fijar a ${nombre}` : `Ver a ${nombre} en grande`}
              onClick={() => { setFijada((actual) => actual === identidad ? null : identidad) }}
              className="shrink-0 snap-start touch-manipulation rounded-medio transition-transform duration-rapida active:scale-95"
            >
              <FichaParticipante
                pista={camara}
                miIdentidad={miIdentidad}
                className="pointer-events-none aspect-[3/4] w-24 [&_video]:object-cover"
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Quien va en el foco del escenario vertical.
 *
 * @param camaras las fichas de camara
 * @param miIdentidad quien mira
 * @param fijada identidad fijada a mano, si hay
 * @param hablando identidades hablando ahora, de mas a menos fuerte
 * @returns la ficha del foco, o `undefined` sin fichas
 */
function elegirFoco (
  camaras: TrackReferenceOrPlaceholder[],
  miIdentidad: string,
  fijada: string | null,
  hablando: string[]
): TrackReferenceOrPlaceholder | undefined {
  const de = (identidad: string | null) => camaras.find((c) => c.participant.identity === identidad)
  const otrasHablando = hablando.filter((identidad) => identidad !== miIdentidad)
  return de(fijada) ??
    de(otrasHablando[0] ?? null) ??
    camaras.find((c) => c.participant.identity !== miIdentidad) ??
    camaras[0]
}
