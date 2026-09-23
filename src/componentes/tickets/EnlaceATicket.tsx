'use client'

import { useSearchParams } from 'next/navigation'
import type { MouseEvent, ReactElement, ReactNode } from 'react'
import { urlConParametro } from '@/componentes/datos/tabla'
import { PARAMETRO_TICKET } from '@/dominio/ticket-vista'

/**
 * El asunto de un ticket como enlace que abre su modal en la misma pantalla.
 *
 * Es el enlace real que pide `abrirEn` —el clic en la fila es comodidad del mouse; el teclado y
 * «abrir en otra pestaña» van por aca—. Lee la URL por su cuenta para conservar filtros, orden y
 * pagina: si la definicion de la tabla la leyera, cambiaria en cada tecleo de filtro y la tabla
 * volveria a pedir la pagina en bucle.
 *
 * Es un `<a>` y no un `Link`: el clic simple escribe el paso con `window.history.pushState`, que
 * `useSearchParams` sigue, y el modal se abre sin volver a renderizar la pagina en el servidor. Con
 * una tecla modificadora o el boton del medio el navegador hace lo suyo (otra pestaña, otra ventana).
 */
export function EnlaceATicket ({ id, children }: { id: number, children: ReactNode }): ReactElement {
  const params = useSearchParams()
  const href = urlConParametro(new URLSearchParams(params.toString()), PARAMETRO_TICKET, String(id))

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
      className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
    >
      {children}
    </a>
  )
}
