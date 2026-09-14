'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { AreaTexto } from '@/componentes/formularios/Entrada'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import type { TicketPortalDetalle } from '@/datos/portal'

/**
 * Cuadro para sumar una respuesta al hilo, al final de todo.
 *
 * Va abajo y no arriba porque se contesta despues de leer: un cuadro de escritura sobre el hilo
 * invita a responder sin haber visto la ultima respuesta del equipo.
 *
 * Sin estado optimista: la respuesta aparece cuando la API la confirmo. El hilo lo pinta el servidor
 * y `router.refresh()` lo vuelve a pedir; mantener una copia en el cliente para ahorrar ese viaje
 * seria sostener dos versiones del mismo hilo, y la que se veria primero es la que no existe todavia.
 */
export function Responder ({ ticketId }: { ticketId: number }) {
  const router = useRouter()
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  /**
   * Manda la respuesta.
   *
   * Nunca lanza: el error del contrato se lee debajo del cuadro y lo escrito queda intacto, para que
   * el cliente reintente sin volver a redactar.
   */
  async function responder (): Promise<void> {
    setEnviando(true)
    setFallo(null)

    const resultado = await escribirEnBff<TicketPortalDetalle>(
      `portal/tickets/${ticketId}/respuestas`,
      'POST',
      { message: mensaje.trim() }
    )

    setEnviando(false)

    if (!resultado.ok) {
      setFallo(resultado.mensaje)
      return
    }

    setMensaje('')
    router.refresh()
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(evento) => {
        evento.preventDefault()
        void responder()
      }}
    >
      <AreaTexto
        rows={4}
        value={mensaje}
        aria-label="Tu respuesta"
        placeholder="Escribe tu respuesta para el equipo."
        onChange={(evento) => { setMensaje(evento.target.value) }}
      />

      {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}

      <div className="flex justify-end">
        <Boton type="submit" variante="primario" cargando={enviando} disabled={mensaje.trim() === ''}>
          Responder
        </Boton>
      </div>
    </form>
  )
}
