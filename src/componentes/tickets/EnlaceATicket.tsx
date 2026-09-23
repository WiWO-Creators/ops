'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { ReactElement, ReactNode } from 'react'
import { urlConParametro } from '@/componentes/datos/tabla'
import { PARAMETRO_TICKET } from '@/dominio/ticket-vista'

/**
 * El asunto de un ticket como enlace que abre su modal en la misma pantalla.
 *
 * Es el enlace real que pide `abrirEn` —el clic en la fila es comodidad del mouse; el teclado y
 * «abrir en otra pestaña» van por aca—. Lee la URL por su cuenta para conservar filtros, orden y
 * pagina: si la definicion de la tabla la leyera, cambiaria en cada tecleo de filtro y la tabla
 * volveria a pedir la pagina en bucle.
 */
export function EnlaceATicket ({ id, children }: { id: number, children: ReactNode }): ReactElement {
  const params = useSearchParams()

  return (
    <Link
      href={urlConParametro(new URLSearchParams(params.toString()), PARAMETRO_TICKET, String(id))}
      scroll={false}
      className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  )
}
