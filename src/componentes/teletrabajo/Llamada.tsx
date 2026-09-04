'use client'

import { useCallback, useRef, useState } from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useParticipants
} from '@livekit/components-react'
import { Boton } from '@/componentes/formularios/Boton'
import { cn } from '@/lib/clases'
import { BarraDeControles } from './BarraDeControles'
import { CabeceraDeSala } from './CabeceraDeSala'
import { ChatDeSala } from './ChatDeSala'
import { Escenario } from './Escenario'
import { PanelDeParticipantes } from './PanelDeParticipantes'
import type { EleccionDeEntrada, Quien } from './tipos'

/**
 * Alto del escenario.
 *
 * Una videollamada no scrollea: ocupa lo que hay. Se descuentan la cabecera del panel (`h-14`) y el
 * relleno de `ScrollSuave` (`p-4`, arriba y abajo). Son los dos unicos numeros del armazon entre la
 * ventana y este componente.
 */
export const ALTO = 'h-[calc(100dvh-5.5rem)]'

/** Que lateral esta abierto. `null` = ninguno, y el escenario ocupa todo el ancho. */
type Lateral = 'participantes' | 'chat' | null

interface PropsLlamada {
  token: string
  url: string
  titulo: string
  esPrivada: boolean
  yo: Quien
  /** Identidad con la que esta persona se presenta ante LiveKit. */
  miIdentidad: string
  eleccion: EleccionDeEntrada
  alSalir: () => void
}

/**
 * Traduce la eleccion de la antesala a lo que espera `LiveKitRoom`.
 *
 * Se resuelve antes de conectar y no despues: pedirle a LiveKit que arranque con el microfono por
 * defecto y cambiarlo enseguida produce un corte de audio que se oye en la sala.
 *
 * @param activo Si esa pista tiene que publicarse al entrar.
 * @param id     Dispositivo elegido, o `undefined` para el del sistema.
 * @returns `false` si no se publica; `true` o las opciones de captura si si.
 */
function captura (activo: boolean, id?: string): boolean | { deviceId: string } {
  if (!activo) return false
  if (id === undefined || id === '') return true

  return { deviceId: id }
}

/**
 * La videollamada, ya con la decision de entrada tomada.
 *
 * El token viene firmado desde el servidor. Este componente no decide nada sobre permisos: si llego
 * hasta aca, `[sala]/page.tsx` ya autorizo.
 */
export function Llamada ({ token, url, titulo, esPrivada, yo, miIdentidad, eleccion, alSalir }: PropsLlamada) {
  const [fallo, setFallo] = useState<string | null>(null)

  // Si llego a conectar alguna vez. Es lo que separa "me fui de la reunion" de "nunca pude entrar",
  // que LiveKit reporta con el mismo evento.
  const entroAlgunaVez = useRef(false)

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
      alSalir()
      return
    }

    setFallo('No se pudo conectar con el servidor de video. Puede estar caído o sin acceso desde esta red.')
  }, [alSalir])

  const alFallar = useCallback((error: Error) => { setFallo(error.message) }, [])

  if (fallo !== null) {
    return (
      <div className={cn(ALTO, 'flex flex-col items-center justify-center gap-4 text-center')}>
        <p className="font-titular text-titulo font-bold text-texto">No se pudo entrar a la sala</p>
        <p className="max-w-md text-sm text-texto-tenue">{fallo}</p>
        <Boton variante="secundario" onClick={alSalir}>Volver a Teletrabajo</Boton>
      </div>
    )
  }

  return (
    <LiveKitRoom
      serverUrl={url}
      token={token}
      connect
      audio={captura(eleccion.microfono, eleccion.idMicrofono)}
      video={captura(eleccion.camara, eleccion.idCamara)}
      onConnected={alConectar}
      onDisconnected={alDesconectar}
      onError={alFallar}
      // El tema propio de `src/estilos/livekit.css`. Sin este atributo, TODAS las variables `--lk-*`
      // quedan sin definir y la sala se ve rota: el nombre del participante hereda la tinta del
      // panel sobre un chip negro y desaparece, y el marcador de camara apagada queda transparente.
      data-lk-theme="wiwo"
      className={cn(ALTO, 'flex flex-col gap-3')}
    >
      {/* Sin esto no se oye a nadie: es quien monta los `<audio>` de los participantes remotos. */}
      <RoomAudioRenderer />

      <Interior titulo={titulo} esPrivada={esPrivada} yo={yo} miIdentidad={miIdentidad} alSalir={alSalir} />

      {/* Algunos navegadores bloquean el audio hasta que hay un gesto de la persona. Este boton
          aparece solo en ese caso; si el audio ya suena, no se pinta nada. */}
      <StartAudio label="Activar sonido" className="mx-auto text-sm text-texto-tenue underline" />
    </LiveKitRoom>
  )
}

interface PropsInterior {
  titulo: string
  esPrivada: boolean
  yo: Quien
  miIdentidad: string
  alSalir: () => void
}

/**
 * Todo lo que necesita el contexto de la sala.
 *
 * Va en un componente aparte porque los hooks de LiveKit —`useParticipants`, `useChat`— solo
 * funcionan **dentro** de `LiveKitRoom`, y quien lo renderiza no puede estar dentro de si mismo.
 */
function Interior ({ titulo, esPrivada, yo, miIdentidad, alSalir }: PropsInterior) {
  const [lateral, setLateral] = useState<Lateral>(null)
  const [sinLeer, setSinLeer] = useState(0)

  const participantes = useParticipants()

  /** Abre o cierra un lateral. Al abrir el chat, sus mensajes dejan de estar sin leer. */
  const cambiarLateral = useCallback((cual: Lateral) => {
    setLateral(cual)
    if (cual === 'chat') setSinLeer(0)
  }, [])

  /**
   * Cuenta un mensaje ajeno.
   *
   * Solo suma si el chat esta cerrado: con el panel abierto, el mensaje ya se esta leyendo y un
   * contador que sube mientras se mira es ruido.
   */
  const contarMensaje = useCallback(() => {
    setSinLeer((anterior) => (lateral === 'chat' ? 0 : anterior + 1))
  }, [lateral])

  return (
    <>
      <CabeceraDeSala titulo={titulo} esPrivada={esPrivada} yo={yo} />

      <div className="flex min-h-0 min-w-0 flex-1 gap-3">
        <Escenario miIdentidad={miIdentidad} className="min-h-0 min-w-0 flex-1" />

        {/* Los dos paneles quedan montados aunque el lateral este cerrado: el chat tiene que poder
            contar los mensajes que llegan mientras nadie lo mira, y desmontarlo perderia el hilo
            entero cada vez que se cierra. Se ocultan con CSS, no desmontandolos. */}
        <aside
          className={cn(
            'w-80 shrink-0 flex-col overflow-hidden rounded-medio border border-linea bg-superficie-elevada',
            lateral === null ? 'hidden' : 'flex'
          )}
        >
          <PanelDeParticipantes
            miIdentidad={miIdentidad}
            className={cn('min-h-0 flex-1', lateral === 'participantes' ? 'flex flex-col' : 'hidden')}
          />
          <ChatDeSala
            miIdentidad={miIdentidad}
            alLlegarMensaje={contarMensaje}
            className={cn('min-h-0 flex-1', lateral === 'chat' ? 'flex flex-col' : 'hidden')}
          />
        </aside>
      </div>

      <BarraDeControles
        lateral={lateral}
        alCambiarLateral={cambiarLateral}
        participantes={participantes.length}
        sinLeer={sinLeer}
        alSalir={alSalir}
      />
    </>
  )
}
