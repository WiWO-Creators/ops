'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
import { ConnectionState, Track } from 'livekit-client'
import {
  FocusLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  StartAudio,
  TrackLoop,
  useConnectionState,
  useTrackToggle,
  useTracks
} from '@livekit/components-react'
import { Lock, Mic, MicOff, MonitorUp, PhoneOff, Video, VideoOff } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { cn } from '@/lib/clases'

// Estilos base de LiveKit: dimensionan el `<video>`, espejan la camara propia y pintan el
// marcador de quien no publica video. Es maquetado, no identidad visual — el color, el fondo y los
// controles los pone este archivo con los tokens del sistema.
import '@livekit/components-styles'

/**
 * Alto del escenario.
 *
 * Una videollamada no scrollea: ocupa lo que hay. Se descuentan la cabecera del panel (`h-14`) y el
 * relleno de `ScrollSuave` (`p-4`, arriba y abajo). Son los dos unicos numeros del armazon entre la
 * ventana y este componente.
 */
const ALTO = 'h-[calc(100dvh-5.5rem)]'

/**
 * Las tres piezas de `useSyncExternalStore` que responden "¿ya estoy en el navegador?".
 *
 * No hay nada que escuchar: el valor del servidor es `false`, el del cliente `true`, y el cambio
 * ocurre una sola vez al hidratar. Van fuera del componente para que su identidad no cambie entre
 * renders, que es lo que haria a React resuscribirse en cada uno.
 */
const NO_ESCUCHAR = () => () => {}
const EN_EL_CLIENTE = () => true
const EN_EL_SERVIDOR = () => false

interface PropsVideollamada {
  token: string
  url: string
  titulo: string
  esPrivada: boolean
}

/**
 * La videollamada.
 *
 * Entra con el microfono y la camara **apagados**. Es deliberado: unirse publicando por defecto
 * significa que alguien que abre la sala por curiosidad aparece hablando sin saberlo. Se prenden con
 * los botones de abajo, que es un clic mas y ninguna sorpresa.
 *
 * El token ya viene firmado desde el servidor. Este componente no decide nada sobre permisos: si
 * llego hasta aca, `[sala]/page.tsx` ya autorizo.
 */
export function Videollamada ({ token, url, titulo, esPrivada }: PropsVideollamada) {
  const router = useRouter()
  const [fallo, setFallo] = useState<string | null>(null)

  // Si llego a conectar alguna vez. Es lo que separa "me fui de la reunion" de "nunca pude entrar",
  // que LiveKit reporta con el mismo evento.
  const entroAlgunaVez = useRef(false)

  const alSalir = useCallback(() => { router.push('/teletrabajo') }, [router])

  const alConectar = useCallback(() => { entroAlgunaVez.current = true }, [])

  /**
   * Se desconecto.
   *
   * Solo se vuelve a la lista si la persona llego a estar dentro. Cuando la conexion nunca se
   * establecio —servidor caido, DNS sin resolver, puerto cerrado— devolver a la portada sin decir
   * nada deja a alguien clickeando una sala que "no hace nada". Ese caso muestra el error.
   */
  const alDesconectar = useCallback(() => {
    if (entroAlgunaVez.current) {
      router.push('/teletrabajo')
      return
    }

    setFallo('No se pudo conectar con el servidor de video. Puede estar caído o sin acceso desde esta red.')
  }, [router])

  const alFallar = useCallback((error: Error) => {
    setFallo(error.message)
  }, [])

  /**
   * Si el navegador ya monto el componente.
   *
   * Los componentes de LiveKit leen camaras, microfonos y estado de conexion mientras renderizan.
   * En el servidor nada de eso existe, asi que el HTML que llega no coincide con el que React
   * calcula al hidratar y el arbol queda con avisos de "didn't match" que React no repara. Montar
   * la sala recien en el cliente elimina la discrepancia de raiz; lo que se pierde es un pintado
   * previo que igual no podia mostrar ningun video.
   */
  const montado = useSyncExternalStore(NO_ESCUCHAR, EN_EL_CLIENTE, EN_EL_SERVIDOR)

  if (fallo !== null) {
    return (
      <div className={cn(ALTO, 'flex flex-col items-center justify-center gap-4 text-center')}>
        <p className="font-titular text-titulo font-bold text-texto">No se pudo entrar a la sala</p>
        <p className="max-w-md text-sm text-texto-tenue">{fallo}</p>
        <Boton variante="secundario" onClick={alSalir}>Volver a Teletrabajo</Boton>
      </div>
    )
  }

  if (!montado) {
    return (
      <div className={cn(ALTO, 'flex flex-col gap-3')}>
        <header className="flex shrink-0 items-center gap-3">
          <h1 className="font-titular truncate text-titulo font-bold text-texto">{titulo}</h1>
          <span className="ml-auto text-xs text-texto-tenue">Conectando…</span>
        </header>
        <div className="min-h-0 flex-1 rounded-medio bg-superficie-hundida" />
      </div>
    )
  }

  return (
    <LiveKitRoom
      serverUrl={url}
      token={token}
      connect
      audio={false}
      video={false}
      onConnected={alConectar}
      onDisconnected={alDesconectar}
      onError={alFallar}
      className={cn(ALTO, 'flex flex-col gap-3')}
    >
      {/* Sin esto no se oye a nadie: es quien monta los `<audio>` de los participantes remotos. */}
      <RoomAudioRenderer />

      <Cabecera titulo={titulo} esPrivada={esPrivada} />
      <Escenario />
      <Controles alSalir={alSalir} />

      {/* Algunos navegadores bloquean el audio hasta que hay un gesto de la persona. Este boton
          aparece solo en ese caso; si el audio ya suena, no se pinta nada. */}
      <StartAudio label="Activar sonido" className="mx-auto text-sm text-texto-tenue underline" />
    </LiveKitRoom>
  )
}

/** Nombre de la sala y su estado de conexion. */
function Cabecera ({ titulo, esPrivada }: { titulo: string, esPrivada: boolean }) {
  const estado = useConnectionState()

  return (
    <header className="flex shrink-0 items-center gap-3">
      <h1 className="font-titular truncate text-titulo font-bold text-texto">{titulo}</h1>

      {esPrivada && (
        <span className="flex items-center gap-1 text-xs text-texto-tenue">
          <Lock size={12} aria-hidden="true" />
          Privada
        </span>
      )}

      <span className="ml-auto text-xs text-texto-tenue">{textoDeEstado(estado)}</span>
    </header>
  )
}

/**
 * Traduce el estado de conexion de LiveKit.
 *
 * Se muestra siempre y no solo cuando falla: en una llamada, saber que se esta reconectando es la
 * diferencia entre esperar y colgar.
 */
function textoDeEstado (estado: ConnectionState): string {
  switch (estado) {
    case ConnectionState.Connected: return 'En vivo'
    case ConnectionState.Connecting: return 'Conectando…'
    case ConnectionState.Reconnecting: return 'Reconectando…'
    case ConnectionState.SignalReconnecting: return 'Reconectando…'
    case ConnectionState.Disconnected: return 'Desconectado'
    default: return ''
  }
}

/**
 * Los videos.
 *
 * Cuando alguien comparte pantalla, esa pista pasa al foco y las camaras bajan a una tira lateral.
 * En grilla pareja la pantalla compartida queda del tamaño de una cara, que es ilegible: compartir
 * pantalla sin poder leerla no es compartir pantalla.
 */
function Escenario () {
  const pistas = useTracks(
    [
      // Con marcador: quien no publica camara igual ocupa un lugar. Sin eso, una sala de cinco
      // personas con las camaras apagadas se ve vacia y parece rota.
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false }
    ],
    { onlySubscribed: false }
  )

  const pantalla = pistas.find((pista) => pista.source === Track.Source.ScreenShare)
  const camaras = pistas.filter((pista) => pista.source === Track.Source.Camera)

  if (pantalla !== undefined) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div className="min-h-0 flex-1">
          <FocusLayout trackRef={pantalla} />
        </div>

        {/* La tira scrollea sola. `data-lenis-prevent` la saca del scroll suave del armazon: sin
            eso Lenis se come el gesto y la tira no se mueve. */}
        <div
          data-lenis-prevent
          className="flex shrink-0 gap-3 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto"
        >
          <TrackLoop tracks={camaras}>
            <ParticipantTile className="aspect-video w-40 shrink-0 rounded-medio lg:w-full" />
          </TrackLoop>
        </div>
      </div>
    )
  }

  // Grilla propia en vez de `GridLayout`: el de LiveKit pagina, y su calculo se rompe con un ruido
  // en consola cada vez que un marcador se convierte en pista real (`updatePages(): Element not
  // part of the array`). Aca no hay paginacion que romper — las salas del equipo entran en una
  // pantalla — y de paso el ancho de celda lo decide el sistema de diseño.
  return (
    <div className="grid min-h-0 flex-1 auto-rows-fr gap-3 [grid-template-columns:repeat(auto-fit,minmax(16rem,1fr))]">
      <TrackLoop tracks={camaras}>
        <ParticipantTile className="rounded-medio" />
      </TrackLoop>
    </div>
  )
}

/** Microfono, camara, pantalla y salir. */
function Controles ({ alSalir }: { alSalir: () => void }) {
  const microfono = useTrackToggle({ source: Track.Source.Microphone })
  const camara = useTrackToggle({ source: Track.Source.Camera })
  const pantalla = useTrackToggle({ source: Track.Source.ScreenShare })

  return (
    <div className="flex shrink-0 items-center justify-center gap-2">
      <BotonDePista
        activo={microfono.enabled}
        pendiente={microfono.pending}
        alPulsar={() => { void microfono.toggle() }}
        etiqueta={microfono.enabled ? 'Silenciar micrófono' : 'Activar micrófono'}
        icono={microfono.enabled ? <Mic size={18} /> : <MicOff size={18} />}
      />

      <BotonDePista
        activo={camara.enabled}
        pendiente={camara.pending}
        alPulsar={() => { void camara.toggle() }}
        etiqueta={camara.enabled ? 'Apagar cámara' : 'Encender cámara'}
        icono={camara.enabled ? <Video size={18} /> : <VideoOff size={18} />}
      />

      <BotonDePista
        activo={pantalla.enabled}
        pendiente={pantalla.pending}
        alPulsar={() => { void pantalla.toggle() }}
        etiqueta={pantalla.enabled ? 'Dejar de compartir pantalla' : 'Compartir pantalla'}
        icono={<MonitorUp size={18} />}
      />

      <Boton
        variante="peligro"
        soloIcono
        onClick={alSalir}
        aria-label="Salir de la sala"
        title="Salir de la sala"
      >
        <PhoneOff size={18} aria-hidden="true" />
      </Boton>
    </div>
  )
}

interface PropsBotonDePista {
  activo: boolean
  pendiente: boolean
  alPulsar: () => void
  etiqueta: string
  icono: React.ReactNode
}

/**
 * Boton de una pista.
 *
 * El estado no viaja solo en el color: el icono cambia (microfono tachado, camara tachada) y la
 * etiqueta accesible dice que hace el boton ahora. Un boton que solo cambia de tono deja fuera a
 * quien no distingue esos dos tonos, y a quien usa lector de pantalla.
 *
 * `aria-pressed` es lo que anuncia encendido o apagado; por eso el `title` describe la accion y no
 * el estado, para que no se lean dos cosas distintas.
 */
function BotonDePista ({ activo, pendiente, alPulsar, etiqueta, icono }: PropsBotonDePista) {
  return (
    <Boton
      variante={activo ? 'primario' : 'secundario'}
      soloIcono
      disabled={pendiente}
      aria-pressed={activo}
      aria-label={etiqueta}
      title={etiqueta}
      onClick={alPulsar}
    >
      <span aria-hidden="true">{icono}</span>
    </Boton>
  )
}
