'use client'

import { useEffect, useEffectEvent, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { idDeParametro } from '@/componentes/datos/tabla'
import { agruparAvisos } from '@/lib/agrupar-avisos'
import { ESPERA_AVISOS_DE_TICKET_MS, selectorDeTicketSinLeer } from '@/dominio/ticket-sondeo'
import { EVENTO_TICKETS_CAMBIADOS, PARAMETRO_TICKET } from '@/dominio/ticket-vista'

/**
 * Llama a `alCambiar` cuando alguien avisa que un ticket cambio (`ops:tickets-cambiados`).
 *
 * El aviso lo dispara el modal del ticket; con esto un listado o un contador vuelve a pedir lo suyo
 * sin compartir padre con el modal. El callback se lee siempre en su ultima version, asi que quien lo
 * usa no tiene que memoizarlo.
 *
 * Los avisos seguidos se agrupan (`ESPERA_AVISOS_DE_TICKET_MS`): una respuesta con cambio de estado,
 * o el marcado como leido junto a una escritura, emiten varios y la lista pedia su pagina una vez por
 * cada uno.
 *
 * @param alCambiar lo que hay que hacer cuando llega el aviso
 */
export function useAlCambiarTickets (alCambiar: () => void): void {
  const avisar = useEffectEvent(alCambiar)

  useEffect(() => {
    const aviso = agruparAvisos(() => { avisar() }, ESPERA_AVISOS_DE_TICKET_MS)

    window.addEventListener(EVENTO_TICKETS_CAMBIADOS, aviso.disparar)

    return () => {
      window.removeEventListener(EVENTO_TICKETS_CAMBIADOS, aviso.disparar)
      aviso.cancelar()
    }
  }, [])
}

/**
 * Llama a `alCerrar` cuando se cierra el modal de un ticket (`?ticket=` desaparece de la URL).
 *
 * Abrir un ticket tambien cambia datos aunque nadie escriba: la API lo marca como leido al pedir la
 * ficha (`GET /tickets/{id}` pone `adminread = 1`). Sin esto la fila seguiria diciendo "Sin leer"
 * hasta recargar. Tiene que montarse dentro de un limite de `Suspense`: lee `useSearchParams`.
 *
 * Solo avisa si la lista todavia muestra ese ticket sin leer (su enlace lleva
 * `ATRIBUTO_TICKET_SIN_LEER`). Cerrar sin novedades no vuelve a pedir la pagina, y si hubo una
 * escritura ya la pidio `useAlCambiarTickets`, que vio la fila al dia antes de cerrar.
 *
 * @param alCerrar lo que hay que hacer al cerrar
 */
export function useAlCerrarTicket (alCerrar: () => void): void {
  const params = useSearchParams()
  const abierto = params.get(PARAMETRO_TICKET)
  const previo = useRef(abierto)
  const avisar = useEffectEvent(alCerrar)

  useEffect(() => {
    const cerrado = idDeParametro(previo.current)

    if (cerrado !== null && abierto === null && document.querySelector(selectorDeTicketSinLeer(cerrado)) !== null) avisar()

    previo.current = abierto
  }, [abierto])
}
