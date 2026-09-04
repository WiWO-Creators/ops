'use client'

import { useCallback, useState } from 'react'
import { Track } from 'livekit-client'
import { useTrackToggle } from '@livekit/components-react'
import { MessageSquare, Mic, MicOff, MonitorUp, MonitorX, PhoneOff, Users, Video, VideoOff } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { MenuDeDispositivos } from './MenuDeDispositivos'
import { motivoDelFallo } from './errores'

interface PropsBarraDeControles {
  /** Qué lateral está abierto, o null si ninguno. */
  lateral: 'participantes' | 'chat' | null
  alCambiarLateral: (cual: 'participantes' | 'chat' | null) => void
  /** Cuánta gente hay en la sala, para el contador del botón de participantes. */
  participantes: number
  /** Mensajes de chat sin leer, para el contador del botón de chat. 0 = sin distintivo. */
  sinLeer: number
  alSalir: () => void
}

/**
 * Barra de controles de la llamada: microfono, camara, pantalla compartida, laterales y salir.
 *
 * Vive aparte de `Videollamada` porque agrupa dos cosas que esa pantalla todavia no tenia: los
 * menus de dispositivo pegados al microfono y la camara, y los laterales de participantes y chat.
 */
export function BarraDeControles ({ lateral, alCambiarLateral, participantes, sinLeer, alSalir }: PropsBarraDeControles) {
  const [aviso, setAviso] = useState<string | null>(null)

  /**
   * Traduce y muestra el fallo de un dispositivo, salvo que la persona lo haya cancelado a
   * proposito (`motivoDelFallo` devuelve cadena vacia en ese caso).
   */
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

  const pantalla = useTrackToggle({
    source: Track.Source.ScreenShare,
    onDeviceError: (error) => { avisarDe(error, 'la pantalla compartida') }
  })

  /**
   * Pulsa un control de pista y se hace cargo de lo que salga mal.
   *
   * Hay dos caminos por los que llega un fallo de dispositivo y hacen falta los dos:
   * - `onDeviceError` (arriba, en cada `useTrackToggle`) es por donde LiveKit entrega los fallos de
   *   dispositivo. Los captura el mismo, asi que `toggle()` **resuelve igual** y un `.catch` nunca
   *   se entera. Sin esa rama, pulsar "Encender cámara" sin permiso no hace nada y no dice nada.
   * - Este `.catch` es para todo lo demas: si `toggle()` si rechaza, esa promesa suelta queda como
   *   rechazo sin capturar y en desarrollo levanta la pantalla roja de Next por encima de la
   *   llamada.
   */
  const pulsar = useCallback((accionar: () => Promise<unknown>, que: string) => {
    setAviso(null)
    accionar().catch((error: unknown) => { avisarDe(error, que) })
  }, [avisarDe])

  /** Abre un lateral, o lo cierra si ya estaba abierto. */
  const alternarLateral = useCallback((cual: 'participantes' | 'chat') => {
    alCambiarLateral(lateral === cual ? null : cual)
  }, [lateral, alCambiarLateral])

  return (
    // `max-sm:pl-14` no es un capricho de espaciado: el armazon fija el orbe del producto en la
    // esquina inferior izquierda, y en un telefono se le monta encima al boton de microfono. El
    // relleno corre la fila lo justo para que dejen de pisarse.
    <div className="flex shrink-0 flex-col items-center gap-2 max-sm:pl-14">
      {aviso !== null && (
        <p role="status" className="text-center text-xs text-texto-aviso">{aviso}</p>
      )}

      <div className="flex items-center justify-center gap-2">
        <div className="flex items-center">
          <BotonDePista
            activo={microfono.enabled}
            pendiente={microfono.pending}
            alPulsar={() => { pulsar(async () => await microfono.toggle(), 'el micrófono') }}
            etiqueta={microfono.enabled ? 'Silenciar micrófono' : 'Activar micrófono'}
            icono={microfono.enabled ? <Mic size={18} /> : <MicOff size={18} />}
            className="rounded-r-none"
          />
          <MenuDeDispositivos
            clase="audioinput"
            etiqueta="Elegir micrófono"
            alFallar={(error) => { avisarDe(error, 'el micrófono') }}
            className="rounded-l-none border-l-0"
          />
        </div>

        <div className="flex items-center">
          <BotonDePista
            activo={camara.enabled}
            pendiente={camara.pending}
            alPulsar={() => { pulsar(async () => await camara.toggle(), 'la cámara') }}
            etiqueta={camara.enabled ? 'Apagar cámara' : 'Encender cámara'}
            icono={camara.enabled ? <Video size={18} /> : <VideoOff size={18} />}
            className="rounded-r-none"
          />
          <MenuDeDispositivos
            clase="videoinput"
            etiqueta="Elegir cámara"
            alFallar={(error) => { avisarDe(error, 'la cámara') }}
            className="rounded-l-none border-l-0"
          />
        </div>

        <BotonDePista
          activo={pantalla.enabled}
          pendiente={pantalla.pending}
          alPulsar={() => { pulsar(async () => await pantalla.toggle(), 'la pantalla compartida') }}
          etiqueta={pantalla.enabled ? 'Dejar de compartir pantalla' : 'Compartir pantalla'}
          icono={pantalla.enabled ? <MonitorX size={18} /> : <MonitorUp size={18} />}
        />

        <Boton
          variante={lateral === 'participantes' ? 'primario' : 'secundario'}
          aria-pressed={lateral === 'participantes'}
          aria-label="Participantes"
          title="Participantes"
          onClick={() => { alternarLateral('participantes') }}
        >
          <Users size={18} aria-hidden="true" />
          {participantes}
        </Boton>

        <Boton
          variante={lateral === 'chat' ? 'primario' : 'secundario'}
          soloIcono
          aria-pressed={lateral === 'chat'}
          aria-label="Chat"
          title="Chat"
          className="relative"
          onClick={() => { alternarLateral('chat') }}
        >
          <MessageSquare size={18} aria-hidden="true" />
          {sinLeer > 0 && (
            <span className="bg-relleno-peligro text-relleno-peligro-contenido absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-control px-1 text-[10px] font-semibold">
              {sinLeer}
            </span>
          )}
        </Boton>

        <Boton variante="peligro" soloIcono aria-label="Salir de la sala" title="Salir de la sala" onClick={alSalir}>
          <PhoneOff size={18} aria-hidden="true" />
        </Boton>
      </div>
    </div>
  )
}

interface PropsBotonDePista {
  activo: boolean
  pendiente: boolean
  alPulsar: () => void
  etiqueta: string
  icono: React.ReactNode
  className?: string
}

/**
 * Boton de una pista (microfono, camara o pantalla).
 *
 * El estado no viaja solo en el color: el icono cambia (microfono tachado, camara tachada) y la
 * etiqueta accesible dice que hace el boton AHORA. `aria-pressed` es lo que anuncia encendido o
 * apagado, y por eso el `title` describe la accion y no el estado, para que no se lean dos cosas
 * distintas. Un boton que solo cambia de tono deja fuera a quien no distingue esos dos tonos y a
 * quien usa lector de pantalla.
 */
function BotonDePista ({ activo, pendiente, alPulsar, etiqueta, icono, className }: PropsBotonDePista) {
  return (
    <Boton
      variante={activo ? 'primario' : 'secundario'}
      soloIcono
      disabled={pendiente}
      aria-pressed={activo}
      aria-label={etiqueta}
      title={etiqueta}
      onClick={alPulsar}
      className={className}
    >
      <span aria-hidden="true">{icono}</span>
    </Boton>
  )
}
