'use client'

import { ConnectionState } from 'livekit-client'
import { useConnectionState } from '@livekit/components-react'
import { Lock } from 'lucide-react'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { cn } from '@/lib/clases'
import type { Quien } from './tipos'

/** Como se pinta y como se dice cada estado de conexion. */
interface Estado {
  texto: string
  punto: string
}

/**
 * Traduce el estado de conexion de LiveKit.
 *
 * Se muestra siempre y no solo cuando falla: en una llamada, saber que se esta reconectando es la
 * diferencia entre esperar y colgar. Y viaja con un punto de color ademas del texto, porque el
 * estado de una llamada se mira de reojo, sin leer.
 *
 * @param estado El estado que reporta la sala.
 * @returns El texto y la clase del punto.
 */
function estadoDeConexion (estado: ConnectionState): Estado {
  switch (estado) {
    case ConnectionState.Connected: return { texto: 'En vivo', punto: 'bg-relleno-exito' }
    case ConnectionState.Connecting: return { texto: 'Conectando…', punto: 'bg-relleno-aviso' }
    case ConnectionState.Reconnecting: return { texto: 'Reconectando…', punto: 'bg-relleno-aviso' }
    case ConnectionState.SignalReconnecting: return { texto: 'Reconectando…', punto: 'bg-relleno-aviso' }
    case ConnectionState.Disconnected: return { texto: 'Desconectado', punto: 'bg-relleno-peligro' }
    default: return { texto: '', punto: 'bg-relleno-neutro' }
  }
}

interface PropsCabeceraDeSala {
  titulo: string
  esPrivada: boolean
  yo: Quien
}

/**
 * Nombre de la sala, quien la mira y como esta la conexion.
 *
 * El avatar y el nombre propios estan aca por el mismo motivo por el que estan en la antesala: es
 * el unico lugar de la pantalla que responde "¿donde estoy y como me ven?" sin tener que buscar la
 * propia ficha entre las demas.
 */
export function CabeceraDeSala ({ titulo, esPrivada, yo }: PropsCabeceraDeSala) {
  const { texto, punto } = estadoDeConexion(useConnectionState())

  return (
    <header className="flex shrink-0 items-center gap-3">
      <h1 className="font-titular truncate text-titulo font-bold text-texto">{titulo}</h1>

      {esPrivada && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-texto-tenue">
          <Lock size={12} aria-hidden="true" />
          Privada
        </span>
      )}

      <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-texto-tenue">
        <span aria-hidden="true" className={cn('size-2 rounded-full', punto)} />
        {texto}
      </span>

      <span className="flex shrink-0 items-center gap-2 border-l border-linea pl-3">
        <Avatar nombre={yo.nombre} imagen={yo.imagen} tamano="chico" />
        <span className="hidden text-xs text-texto-tenue sm:inline">{yo.nombre}</span>
      </span>
    </header>
  )
}
