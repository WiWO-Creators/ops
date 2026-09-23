'use client'

import { useEffect, useEffectEvent } from 'react'
import { EVENTO_TICKETS_CAMBIADOS } from '@/dominio/tickets-listados'

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
