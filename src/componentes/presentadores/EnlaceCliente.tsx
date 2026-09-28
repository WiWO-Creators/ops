'use client'

import Link from 'next/link'
import type { ReactElement } from 'react'
import { puedeEnlazarEntidad } from '@/componentes/presentadores/logica-enlace-entidad'
import { useContextoEnlaces } from '@/componentes/presentadores/ProveedorEnlaces'
import { cn } from '@/lib/clases'

interface PropsEnlaceCliente {
  id: number
  nombre: string
  /** Capacidades de quien mira sobre `customers`. Sin pasarla, se toma del `ProveedorEnlaces` mas cercano. */
  capacidades?: readonly string[]
  /**
   * `true` si el componente se dibuja dentro del portal del cliente: nunca enlaza ahi. Sin pasarla,
   * se toma del `ProveedorEnlaces` mas cercano.
   */
  esPortal?: boolean
  className?: string
}

/**
 * Nombre de un Cliente, componente canonico para enlazarlo en cualquier lista o ficha.
 *
 * Enlaza a `/clientes/{id}` solo si quien mira puede ver la seccion Clientes y no esta en el portal
 * del cliente ({@link puedeEnlazarEntidad}) — la misma regla que ya aplican `TablaClientes` y el
 * enlace de `FichaLicitacion`/`FichaUpsell`. Si no corresponde, es texto plano.
 *
 * Lleva `'use client'` porque lee `capacidades`/`esPortal` del `ProveedorEnlaces` cuando el llamador
 * no los pasa por props; una prop explicita siempre gana sobre el contexto.
 *
 * @param id id del Cliente.
 * @param nombre razon social a mostrar.
 * @param capacidades capacidades de quien mira sobre `customers`. Sin pasarla, la del contexto.
 * @param esPortal si se dibuja dentro del portal del cliente. Sin pasarla, la del contexto.
 * @param className clases extra.
 * @returns el nombre, enlazado o plano segun corresponda.
 */
export function EnlaceCliente ({ id, nombre, capacidades, esPortal, className }: PropsEnlaceCliente): ReactElement {
  const contexto = useContextoEnlaces('customers')
  const capacidadesEfectivas = capacidades ?? contexto.capacidades
  const esPortalEfectivo = esPortal ?? contexto.esPortal

  if (!puedeEnlazarEntidad(capacidadesEfectivas, 'customers', esPortalEfectivo)) {
    return <span className={cn('truncate font-medium', className)}>{nombre}</span>
  }

  return (
    <Link
      href={`/clientes/${id}`}
      className={cn('text-texto hover:text-acento truncate font-medium underline-offset-4 hover:underline', className)}
    >
      {nombre}
    </Link>
  )
}
