'use client'

import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { useChat, type ReceivedChatMessage } from '@livekit/components-react'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Boton } from '@/componentes/formularios/Boton'
import { cn } from '@/lib/clases'

interface PropsChatDeSala {
  miIdentidad: string
  /** Se llama con cada mensaje nuevo recibido, para que la barra pueda contar los no leídos. */
  alLlegarMensaje?: () => void
  className?: string
}

/** Hora corta (HH:MM) de un mensaje, en la zona horaria del navegador de quien mira. */
function horaCorta (timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

interface PropsFilaDeMensaje {
  mensaje: ReceivedChatMessage
  esPropio: boolean
}

/** Una burbuja de mensaje, alineada según quién lo mandó. */
function FilaDeMensaje ({ mensaje, esPropio }: PropsFilaDeMensaje) {
  const nombre = esPropio ? 'Tú' : (mensaje.from?.name || mensaje.from?.identity || 'Alguien')

  return (
    <div className={cn('flex flex-col gap-0.5', esPropio ? 'items-end' : 'items-start')}>
      <span className="text-texto-sutil text-xs">{nombre} · {horaCorta(mensaje.timestamp)}</span>
      <p
        className={cn(
          'max-w-[85%] rounded-tarjeta px-3 py-1.5 text-sm break-words',
          esPropio ? 'bg-acento-suave text-texto' : 'bg-relleno-neutro text-relleno-neutro-contenido'
        )}
      >
        {mensaje.message}
      </p>
    </div>
  )
}

/**
 * Chat de texto de la sala, sobre el canal de datos de LiveKit.
 *
 * @param miIdentidad Identidad de quien mira, para alinear sus propios mensajes y firmarlos "Tú".
 * @param alLlegarMensaje Aviso para la barra contenedora, que lleva la cuenta de no leídos.
 */
export function ChatDeSala ({ miIdentidad, alLlegarMensaje, className }: PropsChatDeSala) {
  const { send, chatMessages, isSending } = useChat()
  const [texto, setTexto] = useState('')
  const [error, setError] = useState(false)
  const listaRef = useRef<HTMLDivElement>(null)
  // `Entrada` no reenvía `ref` (no usa `forwardRef`), así que el foco se recupera desde un
  // contenedor: es el mismo truco al que ya habría que recurrir si el input cambiara de tipo.
  const contenedorEntradaRef = useRef<HTMLDivElement>(null)
  const cantidadAnteriorRef = useRef(0)

  // Hace scroll al final cada vez que llega un mensaje nuevo, sin importar quién lo mandó.
  useEffect(() => {
    const lista = listaRef.current
    if (lista) lista.scrollTop = lista.scrollHeight
  }, [chatMessages.length])

  // Avisa a la barra contenedora solo cuando LA LISTA CRECE y el último mensaje es ajeno: si se
  // comparara por el total en cada render, un mensaje propio también contaría como "no leído".
  useEffect(() => {
    const ultimo = chatMessages[chatMessages.length - 1]
    const crecio = chatMessages.length > cantidadAnteriorRef.current
    cantidadAnteriorRef.current = chatMessages.length

    if (crecio && ultimo && ultimo.from?.identity !== miIdentidad) alLlegarMensaje?.()
  }, [chatMessages, miIdentidad, alLlegarMensaje])

  /** Envía el texto del campo, si no está vacío, y limpia el campo solo si el envío funciona. */
  async function enviar () {
    const mensaje = texto.trim()
    if (mensaje === '' || isSending) return

    try {
      await send(mensaje)
      setTexto('')
      setError(false)
      contenedorEntradaRef.current?.querySelector('input')?.focus()
    } catch {
      // No se limpia el campo: perder lo que la persona escribió por un fallo de red es peor que
      // dejarla reintentar.
      setError(true)
    }
  }

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="border-linea shrink-0 border-b px-3 py-2.5">
        <h2 className="text-texto font-titular text-sm font-semibold">Chat</h2>
        {/* Los mensajes viajan por el canal de datos de la llamada y no quedan guardados en ningún
            lado: prometer un historial que no existe es peor que no ofrecer chat. */}
        <p className="text-texto-sutil mt-0.5 text-xs">Los mensajes no se guardan. Quien entra después no ve lo anterior.</p>
      </div>

      {/* Lista con scroll propio: sin data-lenis-prevent, Lenis intercepta el gesto de scroll y la
          lista queda trabada en vez de moverse. */}
      <div ref={listaRef} data-lenis-prevent className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {chatMessages.length === 0 && (
          <p className="text-texto-sutil pt-4 text-center text-sm">Todavía no hay mensajes.</p>
        )}
        {chatMessages.map((mensaje) => (
          <FilaDeMensaje key={mensaje.id} mensaje={mensaje} esPropio={mensaje.from?.identity === miIdentidad} />
        ))}
      </div>

      {error && (
        <p role="status" className="text-texto-peligro px-3 text-xs">
          No se pudo enviar. Probá de nuevo.
        </p>
      )}

      <form
        className="border-linea flex shrink-0 items-center gap-2 border-t p-2"
        onSubmit={(evento) => {
          evento.preventDefault()
          void enviar()
        }}
      >
        <div ref={contenedorEntradaRef} className="flex-1">
          <Entrada
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            placeholder="Escribí un mensaje…"
          />
        </div>
        <Boton type="submit" variante="primario" soloIcono disabled={texto.trim() === ''} cargando={isSending} aria-label="Enviar mensaje">
          <Send className="size-4" />
        </Boton>
      </form>
    </div>
  )
}
