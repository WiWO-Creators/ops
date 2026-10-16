'use client'

import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { idDeParametro } from '@/componentes/datos/tabla'
import { escucharEnVivo } from '@/datos/en-vivo'
import { agruparAvisos } from '@/lib/agrupar-avisos'
import { ESPERA_AVISOS_DE_TICKET_MS, selectorDeTicketSinLeer } from '@/dominio/ticket-sondeo'
import { EVENTO_TICKETS_CAMBIADOS, PARAMETRO_TICKET } from '@/dominio/ticket-estados'

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
 * El bus de «Ops en vivo» del portal no trae ids (la sala del cliente solo dice «algo cambió»), así
 * que no puede traducirse a `ops:tickets-cambiados`. Con `puente` también se escucha el bus
 * directamente: cada aviso de tipo `ticket` cuenta como un aviso más, agrupado con los demás. El panel
 * del equipo no lo usa: su puente ya dispara el evento de ventana con el id.
 *
 * @param alCambiar lo que hay que hacer cuando llega el aviso
 * @param puente `true` para escuchar además los avisos de tickets del bus (portal); por defecto `false`
 */
export function useAlCambiarTickets (alCambiar: () => void, puente = false): void {
  const avisar = useEffectEvent(alCambiar)

  useEffect(() => {
    const aviso = agruparAvisos(() => { avisar() }, ESPERA_AVISOS_DE_TICKET_MS)
    const dejarDeEscuchar = puente
      ? escucharEnVivo((cambio) => { if (cambio.tipo === 'ticket') aviso.disparar() })
      : null

    window.addEventListener(EVENTO_TICKETS_CAMBIADOS, aviso.disparar)

    return () => {
      dejarDeEscuchar?.()
      window.removeEventListener(EVENTO_TICKETS_CAMBIADOS, aviso.disparar)
      aviso.cancelar()
    }
  }, [puente])
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

/**
 * El contador de revision de una lista de tickets, que sube cuando un ticket cambia o se cierra su
 * modal. Se pasa como `revision` a la lista para que vuelva a pedir su pagina con los filtros puestos.
 *
 * Junta el cableado que copiaban las bandejas: `useAlCambiarTickets` + `useAlCerrarTicket` (abrir la
 * ficha la marca como leida en la API: al cerrar se vuelve a pedir para quitar la marca). Tiene que
 * montarse dentro de un limite de `Suspense`, por `useAlCerrarTicket`.
 *
 * @param activo `false` si la lista no muestra tickets y no debe pedirse de nuevo (por defecto `true`)
 * @param puente `true` en el portal: escucha tambien el bus de «Ops en vivo» (ver `useAlCambiarTickets`)
 * @returns el numero de revision
 */
export function useRefrescoDeTickets (activo = true, puente = false): number {
  const [revision, setRevision] = useState(0)
  const alCambiar = useCallback(() => { if (activo) setRevision((n) => n + 1) }, [activo])

  useAlCambiarTickets(alCambiar, puente)
  useAlCerrarTicket(alCambiar)

  return revision
}
