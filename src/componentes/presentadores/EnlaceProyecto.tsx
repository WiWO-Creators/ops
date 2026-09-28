'use client'

import Link from 'next/link'
import type { ReactElement } from 'react'
import { puedeEnlazarEntidad } from '@/componentes/presentadores/logica-enlace-entidad'
import { useContextoEnlaces } from '@/componentes/presentadores/ProveedorEnlaces'
import { cn } from '@/lib/clases'

interface PropsEnlaceProyecto {
  id: number
  nombre: string
  /** Capacidades de quien mira sobre `projects`. Sin pasarla, se toma del `ProveedorEnlaces` mas cercano. */
  capacidades?: readonly string[]
  /**
   * `true` si el componente se dibuja dentro del portal del cliente: nunca enlaza ahi. Sin pasarla,
   * se toma del `ProveedorEnlaces` mas cercano.
   */
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
 * Lleva `'use client'` porque lee `capacidades`/`esPortal` del `ProveedorEnlaces` cuando el llamador
 * no los pasa por props; una prop explicita siempre gana sobre el contexto.
 *
 * @param id id del Proyecto.
 * @param nombre nombre a mostrar.
 * @param capacidades capacidades de quien mira sobre `projects`. Sin pasarla, la del contexto.
 * @param esPortal si se dibuja dentro del portal del cliente. Sin pasarla, la del contexto.
 * @param className clases extra.
 * @returns el nombre, enlazado o plano segun corresponda.
 */
export function EnlaceProyecto ({ id, nombre, capacidades, esPortal, className }: PropsEnlaceProyecto): ReactElement {
  const contexto = useContextoEnlaces('projects')
  const capacidadesEfectivas = capacidades ?? contexto.capacidades
  const esPortalEfectivo = esPortal ?? contexto.esPortal

  if (!puedeEnlazarEntidad(capacidadesEfectivas, 'projects', esPortalEfectivo)) {
    return <span className={cn('truncate font-medium', className)}>{nombre}</span>
  }

  return (
    <Link href={`/proyectos/${id}`} className={cn('hover:text-acento truncate font-medium', className)}>
      {nombre}
    </Link>
  )
}
