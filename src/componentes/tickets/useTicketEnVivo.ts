'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { observarLista } from '@/datos/refresco-lista'
import type { AdjuntoTicket } from '@/datos/recursos'
import { avisarCambioDeTicket } from '@/dominio/ticket-estados'
import { SECUENCIA_INICIAL, confirmarEscritura, pedirLectura, recibirLectura } from '@/dominio/ticket-secuencia'
import { rutaDeTicket, vistaTrasResponder, type FuenteDeTicket } from '@/dominio/ticket-vista'
import { cargarTicket, cargaTrasLectura, type CargaDeTicket } from './carga-de-ticket'

/** Lo que `useTicketEnVivo` entrega a quien dibuja el ticket. */
export interface TicketEnVivo {
  /** El estado de la carga: cargando, no encontrado, error o listo con la vista del ticket. */
  carga: CargaDeTicket
  /**
   * Vuelve a pedir la ficha sin pasar por «cargando», cancelando la recarga anterior si seguia.
   * Resuelve `true` si la ficha llego al dia.
   */
  refrescar: () => Promise<boolean>
  /** Reintento visible, desde el estado de error. */
  reintentar: () => void
  /**
   * Pone en la vista lo que devolvio la API tras una escritura confirmada, sin esperar la recarga.
   * Cuenta como la lectura mas nueva: una del hilo en vivo que salio antes ya no puede borrarla.
   */
  aplicarEscritura: (datos: unknown) => void
}

/**
 * Carga un ticket y lo mantiene en vivo mientras el modal esta abierto.
 *
 * Observa la lista (`observarLista`: cada 30 s, al volver a la pestaña y al recuperar el foco; no
 * escucha los avisos de Tareas). Cada lectura lleva un numero de secuencia y solo se aplica si es mas
 * nueva que la ultima aplicada (ver `ticket-secuencia`). Los adjuntos de apertura se piden una vez por
 * apertura y, si una lectura no trae cambios, el estado no se reemplaza (ver `cargaTrasLectura`).
 *
 * Un error o un aborto no borran un ticket que ya se estaba mostrando: el hilo en vivo reintenta solo,
 * y vaciar la pantalla por un corte de red de un segundo se lee como que el ticket se perdio.
 *
 * Abrir un ticket con novedades del equipo lo marca leido (contrato v2, E), una vez por apertura; si
 * falla no se reintenta ni se avisa, porque lo unico que se pierde es la marca y la proxima apertura la
 * vuelve a pedir.
 *
 * @param fuente de donde bajan los datos del ticket
 * @param ticketId el ticket que se pide
 * @returns la carga y las acciones para refrescarla
 */
export function useTicketEnVivo (fuente: FuenteDeTicket, ticketId: number): TicketEnVivo {
  const [carga, setCarga] = useState<CargaDeTicket>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)
  const secuencia = useRef(SECUENCIA_INICIAL)
  const refresco = useRef<AbortController | null>(null)
  const marcadoLeido = useRef(false)
  const adjuntosConocidos = useRef<AdjuntoTicket[] | null>(null)

  /** Aplica una lectura si es la mas nueva. Los adjuntos que resolvio se recuerdan para el sondeo. */
  const aplicar = useCallback((numero: number, resultado: CargaDeTicket): void => {
    if (resultado.fase === 'cargando') return

    const recibida = recibirLectura(secuencia.current, numero)

    secuencia.current = recibida.secuencia
    if (!recibida.aplica) return

    if (resultado.fase === 'listo' && resultado.adjuntos !== null) adjuntosConocidos.current = resultado.adjuntos
    setCarga((previa) => cargaTrasLectura(previa, resultado))
  }, [])

  useEffect(() => {
    const detener = observarLista(
      async (senal) => {
        const salida = pedirLectura(secuencia.current)

        secuencia.current = salida.secuencia

        return { numero: salida.numero, resultado: await cargarTicket(fuente, ticketId, senal, adjuntosConocidos.current) }
      },
      ({ numero, resultado }) => { aplicar(numero, resultado) },
      (fallo) => {
        setCarga((previa) => previa.fase === 'listo'
          ? previa
          : { fase: 'error', mensaje: fallo instanceof Error ? fallo.message : 'No se pudo cargar el ticket.' })
      },
      { eventos: [] }
    )

    return () => {
      detener()
      refresco.current?.abort()
    }
  }, [fuente, ticketId, intento, aplicar])

  const refrescar = useCallback(async (): Promise<boolean> => {
    refresco.current?.abort()

    const control = new AbortController()
    const salida = pedirLectura(secuencia.current)

    secuencia.current = salida.secuencia
    refresco.current = control

    const resultado = await cargarTicket(fuente, ticketId, control.signal, adjuntosConocidos.current)

    aplicar(salida.numero, resultado)

    return resultado.fase === 'listo'
  }, [fuente, ticketId, aplicar])

  const reintentar = useCallback((): void => {
    setCarga({ fase: 'cargando' })
    setIntento((n) => n + 1)
  }, [])

  const aplicarEscritura = useCallback((datos: unknown): void => {
    secuencia.current = confirmarEscritura(secuencia.current)
    setCarga((previa) => previa.fase === 'listo'
      ? { ...previa, ticket: vistaTrasResponder(fuente, previa.ticket, datos) }
      : previa)
  }, [fuente])

  const ticket = carga.fase === 'listo' ? carga.ticket : null

  useEffect(() => {
    if (ticket === null || !ticket.noLeido || fuente.leido === null || marcadoLeido.current) return

    marcadoLeido.current = true
    void escribirEnBff<unknown>(rutaDeTicket(fuente.leido, ticket.id), 'POST').then((resultado) => {
      if (resultado.ok) avisarCambioDeTicket(ticket.id)
    })
  }, [ticket, fuente.leido])

  return { carga, refrescar, reintentar, aplicarEscritura }
}
