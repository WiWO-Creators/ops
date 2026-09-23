'use client'

import { useEffect, useEffectEvent, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { EVENTO_TICKETS_CAMBIADOS } from '@/dominio/tickets-listados'
import { PARAMETRO_TICKET } from '@/dominio/ticket-vista'

/**
 * Llama a `alCambiar` cada vez que alguien avisa que un ticket cambio (`ops:tickets-cambiados`).
 *
 * El aviso lo dispara el modal del ticket; con esto un listado o un contador vuelve a pedir lo suyo
 * sin compartir padre con el modal. El callback se lee siempre en su ultima version, asi que quien lo
 * usa no tiene que memoizarlo.
 *
 * @param alCambiar lo que hay que hacer cuando llega el aviso
 */
export function useAlCambiarTickets (alCambiar: () => void): void {
  const avisar = useEffectEvent(alCambiar)

  useEffect(() => {
    const escuchar = (): void => { avisar() }

    window.addEventListener(EVENTO_TICKETS_CAMBIADOS, escuchar)

    return () => { window.removeEventListener(EVENTO_TICKETS_CAMBIADOS, escuchar) }
  }, [])
}

/**
 * Llama a `alCerrar` cuando se cierra el modal de un ticket (`?ticket=` desaparece de la URL).
 *
 * Abrir un ticket tambien cambia datos aunque nadie escriba: la API lo marca como leido al pedir la
 * ficha (`GET /tickets/{id}` pone `adminread = 1`). Sin esto la fila seguiria diciendo "Sin leer"
 * hasta recargar. Tiene que montarse dentro de un limite de `Suspense`: lee `useSearchParams`.
 *
 * @param alCerrar lo que hay que hacer al cerrar
 */
export function useAlCerrarTicket (alCerrar: () => void): void {
  const params = useSearchParams()
  const abierto = params.get(PARAMETRO_TICKET)
  const previo = useRef(abierto)
  const avisar = useEffectEvent(alCerrar)

  useEffect(() => {
    if (previo.current !== null && abierto === null) avisar()

    previo.current = abierto
  }, [abierto])
}
