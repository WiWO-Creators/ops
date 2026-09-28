import Link from 'next/link'
import type { ReactElement } from 'react'
import { puedeEnlazarEntidad } from '@/componentes/presentadores/logica-enlace-entidad'
import { cn } from '@/lib/clases'

interface PropsEnlaceCliente {
  id: number
  nombre: string
  capacidades: readonly string[]
  /** `true` si el componente se dibuja dentro del portal del cliente: nunca enlaza ahi. */
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
 * @param id id del Cliente.
 * @param nombre razon social a mostrar.
 * @param capacidades capacidades de quien mira sobre `customers`.
 * @param esPortal si se dibuja dentro del portal del cliente.
 * @param className clases extra.
 * @returns el nombre, enlazado o plano segun corresponda.
 */
export function EnlaceCliente ({ id, nombre, capacidades, esPortal = false, className }: PropsEnlaceCliente): ReactElement {
  if (!puedeEnlazarEntidad(capacidades, 'customers', esPortal)) {
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
