'use client'

import { Mic, MicOff } from 'lucide-react'
import { Track, type LocalParticipant, type RemoteParticipant } from 'livekit-client'
import { useIsMuted, useIsSpeaking, useParticipants } from '@livekit/components-react'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { imagenDeMetadata } from '@/dominio/teletrabajo'
import { cn } from '@/lib/clases'

interface PropsPanelDeParticipantes {
  /** Identidad de quien mira, para poner su fila primero y marcarla. */
  miIdentidad: string
  className?: string
}

interface PropsFilaDeParticipante {
  participante: RemoteParticipant | LocalParticipant
  esMiFila: boolean
}

/**
 * Fila de un participante dentro del panel.
 *
 * Separada de `PanelDeParticipantes` a propósito: `isSpeaking` y el estado del micrófono cambian por
 * eventos del PARTICIPANTE, no de la sala. Si esta fila viviera inline en el `.map` del panel,
 * `useIsSpeaking`/`useIsMuted` seguirían funcionando, pero cada nuevo participante recrearía el hook
 * en una posición distinta del árbol; con el subcomponente, cada fila tiene su propia instancia
 * estable de los hooks, atada a su participante.
 */
function FilaDeParticipante ({ participante, esMiFila }: PropsFilaDeParticipante) {
  const estaHablando = useIsSpeaking(participante)
  const microfonoApagado = useIsMuted({ participant: participante, source: Track.Source.Microphone })
  const nombre = participante.name || participante.identity

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-chico px-2 py-1.5',
        estaHablando && 'bg-acento-suave'
      )}
    >
      <Avatar nombre={nombre} imagen={imagenDeMetadata(participante.metadata)} tamano="medio" />
      <span className="text-texto flex-1 truncate text-sm">{nombre}</span>
      {esMiFila && <Insignia tono="acento" tamano="chico">Tú</Insignia>}
      {microfonoApagado
        ? <MicOff className="text-texto-sutil size-4 shrink-0" />
        : <Mic className="text-texto-sutil size-4 shrink-0" />}
    </li>
  )
}

/**
 * Panel lateral con la lista de participantes de la sala.
 *
 * Muestra primero a quien mira el panel y después al resto ordenado por nombre, para que cada quien
 * encuentre su propia fila sin tener que recorrer la lista.
 *
 * @param miIdentidad Identidad de quien mira, para marcar y adelantar su fila.
 */
export function PanelDeParticipantes ({ miIdentidad, className }: PropsPanelDeParticipantes) {
  const participantes = useParticipants()

  const yo = participantes.filter((participante) => participante.identity === miIdentidad)
  const resto = participantes
    .filter((participante) => participante.identity !== miIdentidad)
    .sort((a, b) => (a.name || a.identity).localeCompare(b.name || b.identity))
  const ordenados = [...yo, ...resto]

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="border-linea flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
        <h2 className="text-texto font-titular text-sm font-semibold">Participantes</h2>
        <span className="text-texto-sutil text-xs">{participantes.length}</span>
      </div>
      {/* Lista con scroll propio: sin data-lenis-prevent, Lenis intercepta el gesto de scroll y la
          lista queda trabada en vez de moverse. */}
      <ul data-lenis-prevent className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {ordenados.map((participante) => (
          <FilaDeParticipante
            key={participante.identity}
            participante={participante}
            esMiFila={participante.identity === miIdentidad}
          />
        ))}
      </ul>
    </div>
  )
}
