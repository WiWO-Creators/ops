import Link from 'next/link'
import type { ReactElement } from 'react'
import { puedeEnlazarEntidad } from '@/componentes/presentadores/logica-enlace-entidad'
import { cn } from '@/lib/clases'

interface PropsEnlaceProyecto {
  id: number
  nombre: string
  capacidades: readonly string[]
  /** `true` si el componente se dibuja dentro del portal del cliente: nunca enlaza ahi. */
  esPortal?: boolean
  className?: string
}

/**
 * Nombre de un Proyecto (Espacio), componente canonico para enlazarlo en cualquier lista o ficha.
 *
 * Enlaza a `/proyectos/{id}` solo si quien mira puede ver la seccion Proyectos y no esta en el portal
 * del cliente ({@link puedeEnlazarEntidad}) — la misma regla que ya aplica `ColumnasProyecto`. El
 * listado de Proyectos nunca se deniega, asi que en el panel esto enlaza siempre; solo el portal lo
 * apaga. Si no corresponde, es texto plano.
 *
 * @param id id del Proyecto.
 * @param nombre nombre a mostrar.
 * @param capacidades capacidades de quien mira sobre `projects`.
 * @param esPortal si se dibuja dentro del portal del cliente.
 * @param className clases extra.
 * @returns el nombre, enlazado o plano segun corresponda.
 */
export function EnlaceProyecto ({ id, nombre, capacidades, esPortal = false, className }: PropsEnlaceProyecto): ReactElement {
  if (!puedeEnlazarEntidad(capacidades, 'projects', esPortal)) {
    return <span className={cn('truncate font-medium', className)}>{nombre}</span>
  }

  return (
    <Link href={`/proyectos/${id}`} className={cn('hover:text-acento truncate font-medium', className)}>
      {nombre}
    </Link>
  )
}
