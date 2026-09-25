'use client'

import { useCallback, useState } from 'react'
import { Track } from 'livekit-client'
import {
  StartAudio,
  useParticipants,
  useSpeakingParticipants,
  useTrackToggle,
  useTracks
} from '@livekit/components-react'
import { Maximize2, Mic, MicOff, PhoneOff, Users, Video, VideoOff } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { cn } from '@/lib/clases'
import { FichaParticipante } from './FichaParticipante'
import { motivoDelFallo } from './errores'
import { pistaDestacada } from './destacada'

/**
 * Donde flota la mini llamada.
 *
 * Abajo a la derecha, pero corrida a la izquierda del orbe (`size-14` a `right-4`): los dos viven en
 * la misma esquina y encimados se taparian el boton de colgar. En el telefono sube por encima de la
 * barra inferior, igual que el orbe.
 *
 * `view-transition-name` propio porque es una capa fija sobre el panel: sin el, la transicion de
 * pagina la taparia en sus primeros fotogramas al navegar, justo cuando aparece.
 */
const FLOTANTE = cn(
  'border-linea bg-superficie-flotante shadow-flotante rounded-tarjeta animate-entrar-abajo fixed z-50 border',
  'bottom-[calc(1.5rem_+_var(--barra-inferior,0px))] right-[5.5rem] w-72 max-sm:w-56 max-w-[calc(100vw-6.5rem)]'
)

const ESTILO_FLOTANTE: React.CSSProperties = { viewTransitionName: 'mini-llamada' }

interface PropsMiniLlamada {
  titulo: string
  miIdentidad: string
  alVolver: () => void
  alSalir: () => void
}

/**
 * La llamada en chico, mientras la persona trabaja en otra pantalla del panel.
 *
 * Muestra a quien conviene ver —quien habla, o si no alguien con camara— y los controles que se
 * tocan sin volver a la sala: microfono, camara, volver y colgar. Lo demas (chat, pantalla
 * compartida, dispositivos) sigue en la sala, a un clic.
 *
 * Tiene que ir dentro de `LiveKitRoom`: todos sus datos salen de los hooks de la sala.
 */
export function MiniLlamada ({ titulo, miIdentidad, alVolver, alSalir }: PropsMiniLlamada) {
  const [aviso, setAviso] = useState<string | null>(null)
  const participantes = useParticipants()
  const hablando = useSpeakingParticipants()
  const camaras = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false })

  /** Muestra el fallo de un dispositivo, salvo que la persona lo haya cancelado a proposito. */
  const avisarDe = useCallback((error: unknown, que: string) => {
    const motivo = motivoDelFallo(error, que)
    if (motivo !== '') setAviso(motivo)
  }, [])

  const microfono = useTrackToggle({
    source: Track.Source.Microphone,
    onDeviceError: (error) => { avisarDe(error, 'el micrófono') }
  })

  const camara = useTrackToggle({
    source: Track.Source.Camera,
    onDeviceError: (error) => { avisarDe(error, 'la cámara') }
  })

  /** Pulsa un control de pista. El `.catch` cubre lo que `onDeviceError` no entrega (ver `BarraDeControles`). */
  const pulsar = useCallback((accionar: () => Promise<unknown>, que: string) => {
    setAviso(null)
    accionar().catch((error: unknown) => { avisarDe(error, que) })
  }, [avisarDe])

  const destacada = pistaDestacada(camaras, hablando.map((p) => p.identity), miIdentidad)

  return (
    <section aria-label={`Llamada en curso: ${titulo}`} style={ESTILO_FLOTANTE} className={cn(FLOTANTE, 'flex flex-col gap-2 p-2')}>
      {destacada !== null && (
        // Clic en el video = volver a la sala: es lo que se espera de una ventanita de llamada.
        <button type="button" onClick={alVolver} aria-label="Volver a la sala" className="block cursor-pointer">
          <FichaParticipante pista={destacada} miIdentidad={miIdentidad} className="aspect-video w-full" />
        </button>
      )}

      <div className="flex items-center gap-2 px-1">
        <span className="bg-relleno-exito size-2 shrink-0 animate-pulse rounded-full" aria-hidden="true" />
        <p className="text-texto min-w-0 flex-1 truncate text-sm font-semibold">{titulo}</p>
        <span className="text-texto-tenue flex shrink-0 items-center gap-1 text-xs" title="Participantes">
          <Users size={14} aria-hidden="true" />
          {participantes.length}
        </span>
      </div>

      {aviso !== null && <p role="status" className="text-texto-aviso px-1 text-xs">{aviso}</p>}

      <StartAudio label="Activar sonido" className="text-texto-tenue mx-auto text-xs underline" />

      <div className="flex items-center gap-1.5">
        <Boton
          variante={microfono.enabled ? 'primario' : 'secundario'}
          tamano="chico"
          soloIcono
          disabled={microfono.pending}
          aria-pressed={microfono.enabled}
          aria-label={microfono.enabled ? 'Silenciar micrófono' : 'Activar micrófono'}
          title={microfono.enabled ? 'Silenciar micrófono' : 'Activar micrófono'}
          onClick={() => { pulsar(async () => await microfono.toggle(), 'el micrófono') }}
        >
          {microfono.enabled ? <Mic size={16} aria-hidden="true" /> : <MicOff size={16} aria-hidden="true" />}
        </Boton>
        <Boton
          variante={camara.enabled ? 'primario' : 'secundario'}
          tamano="chico"
          soloIcono
          disabled={camara.pending}
          aria-pressed={camara.enabled}
          aria-label={camara.enabled ? 'Apagar cámara' : 'Encender cámara'}
          title={camara.enabled ? 'Apagar cámara' : 'Encender cámara'}
          onClick={() => { pulsar(async () => await camara.toggle(), 'la cámara') }}
        >
          {camara.enabled ? <Video size={16} aria-hidden="true" /> : <VideoOff size={16} aria-hidden="true" />}
        </Boton>
        <Boton tamano="chico" className="flex-1" onClick={alVolver}>
          <Maximize2 size={14} aria-hidden="true" />
          Volver a la sala
        </Boton>
        <Boton variante="peligro" tamano="chico" soloIcono aria-label="Salir de la sala" title="Salir de la sala" onClick={alSalir}>
          <PhoneOff size={16} aria-hidden="true" />
        </Boton>
      </div>
    </section>
  )
}

interface PropsMiniLlamadaFallida {
  titulo: string
  alVolver: () => void
  alCerrar: () => void
}

/**
 * La mini llamada cuando la conexion no llego a establecerse.
 *
 * Pasa si la persona entra y se va de la sala antes de que LiveKit termine de conectar: el error
 * tiene que verse donde esta ella, no en una pantalla que ya no mira.
 */
export function MiniLlamadaFallida ({ titulo, alVolver, alCerrar }: PropsMiniLlamadaFallida) {
  return (
    <section role="alert" style={ESTILO_FLOTANTE} className={cn(FLOTANTE, 'flex flex-col gap-2 p-3')}>
      <p className="text-texto truncate text-sm font-semibold">No se pudo entrar a {titulo}</p>
      <div className="flex gap-1.5">
        <Boton tamano="chico" className="flex-1" onClick={alVolver}>Ver el motivo</Boton>
        <Boton tamano="chico" variante="sutil" onClick={alCerrar}>Cerrar</Boton>
      </div>
    </section>
  )
}
