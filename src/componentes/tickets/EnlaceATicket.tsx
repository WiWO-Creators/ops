'use client'

import type { MouseEvent, ReactElement, ReactNode } from 'react'
import { useUrlDeDetalle } from '@/componentes/datos/url-de-detalle'
import { ATRIBUTO_TICKET_SIN_LEER } from '@/dominio/ticket-sondeo'
import { PARAMETRO_TICKET } from '@/dominio/ticket-vista'
import { precargarDetalleTicket } from './precarga-detalle-ticket'

/**
 * El asunto de un ticket como enlace que abre su modal en la misma pantalla.
 *
 * Es el enlace real que pide `abrirEn` —el clic en la fila es comodidad del mouse; el teclado y
 * «abrir en otra pestaña» van por aca—. Su `href` lo arma la tabla que lo contiene
 * (`useUrlDeDetalle`), la misma URL que escribe el clic en la fila: conserva filtros, orden y pagina
 * sin que cada fila lea `useSearchParams`. Si la definicion de la tabla leyera la URL, cambiaria en
 * cada tecleo de filtro y la tabla volveria a pedir la pagina en bucle.
 *
 * Al acercarse el mouse o el foco precarga el detalle del modal, para que abrir no espere la descarga.
 * Con `sinLeer` marca el enlace para que `useAlCerrarTicket` sepa si la fila sigue pendiente.
 *
 * Es un `<a>` y no un `Link`: el clic simple escribe el paso con `window.history.pushState`, que
 * `useSearchParams` sigue, y el modal se abre sin volver a renderizar la pagina en el servidor. Con
 * una tecla modificadora o el boton del medio el navegador hace lo suyo (otra pestaña, otra ventana).
 */
export function EnlaceATicket ({ id, sinLeer = false, children }: { id: number, sinLeer?: boolean, children: ReactNode }): ReactElement {
  const urlDeDetalle = useUrlDeDetalle()
  const href = urlDeDetalle?.(PARAMETRO_TICKET, id) ?? `?${PARAMETRO_TICKET}=${id}`

  /** Abre el modal sin navegar, salvo que el clic pida otra pestaña o ventana. */
  function abrir (evento: MouseEvent<HTMLAnchorElement>): void {
    if (evento.defaultPrevented || evento.button !== 0) return
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return

    evento.preventDefault()
    window.history.pushState(null, '', href)
  }

  return (
    <a
      href={href}
      onClick={abrir}
      onPointerEnter={precargarDetalleTicket}
      onFocus={precargarDetalleTicket}
      {...(sinLeer ? { [ATRIBUTO_TICKET_SIN_LEER]: id } : {})}
      className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
    >
      {children}
    </a>
  )
}
