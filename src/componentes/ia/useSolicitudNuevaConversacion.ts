'use client'

import { useEffect, useRef } from 'react'
import { EVENTO_NUEVA_CONVERSACION } from '@/dominio/pantalla'

/**
 * Atiende el pedido «Nueva conversación» del panel flotante.
 *
 * Solo lo atiende la conversación que activó `activa` (la del panel flotante, no la de la pestaña del
 * Proyecto, que comparte ámbito). El manejador se lee por ref: su identidad puede cambiar en cada
 * render sin volver a suscribir.
 *
 * @param activa Si esta conversación debe escuchar el evento.
 * @param alSolicitar Qué hacer cuando llega el pedido.
 */
export function useSolicitudNuevaConversacion (activa: boolean, alSolicitar: () => void): void {
  const manejador = useRef(alSolicitar)
  useEffect(() => { manejador.current = alSolicitar })

  useEffect(() => {
    if (!activa) return
    const alEvento = (): void => { manejador.current() }
    window.addEventListener(EVENTO_NUEVA_CONVERSACION, alEvento)
    return () => { window.removeEventListener(EVENTO_NUEVA_CONVERSACION, alEvento) }
  }, [activa])
}
