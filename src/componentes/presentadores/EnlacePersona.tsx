'use client'

import type { ReactElement } from 'react'
import { Avatar, type TamanoAvatar } from '@/componentes/presentadores/Avatar'
import { puedeEnlazarEntidad } from '@/componentes/presentadores/logica-enlace-entidad'
import { TarjetaFlotantePersona } from '@/componentes/presentadores/TarjetaFlotantePersona'
import { useContextoEnlaces } from '@/componentes/presentadores/ProveedorEnlaces'
import { cn } from '@/lib/clases'

interface PropsEnlacePersona {
  id: number
  nombre: string
  imagen?: string | null
  tamano?: TamanoAvatar
  /**
   * Capacidades de quien mira sobre `staff` (de `permissions` de `/me`). Sin pasarla, se toma del
   * `ProveedorEnlaces` mas cercano.
   */
  capacidades?: readonly string[]
  /**
   * `true` si el componente se dibuja dentro del portal del cliente: nunca enlaza ahi. Sin pasarla,
   * se toma del `ProveedorEnlaces` mas cercano.
   */
  esPortal?: boolean
  /** `false` en una pila de avatares, donde el nombre ya se lee en el `sr-only` del grupo. */
  mostrarNombre?: boolean
  className?: string
}

/**
 * Avatar y nombre de una persona del equipo, componente canonico para enlazarla en cualquier lista o
 * ficha.
 *
 * Enlaza a `/equipo/{id}` con una tarjeta flotante (cargo, area, correo, telefono — lo que traiga
 * `GET /staff/{id}`) al pasar el mouse o al recibir el foco, solo si quien mira puede ver la seccion
 * Equipo y no esta en el portal del cliente ({@link puedeEnlazarEntidad}). Si no corresponde, es
 * avatar y nombre en texto plano, sin interactividad.
 *
 * Lleva `'use client'` porque lee `capacidades`/`esPortal` del `ProveedorEnlaces` (`useContext`)
 * cuando el llamador no los pasa por props; una prop explicita siempre gana sobre el contexto.
 *
 * @param id id de la persona.
 * @param nombre nombre completo a mostrar.
 * @param imagen url de la foto, o `null`.
 * @param tamano tamano del avatar.
 * @param capacidades capacidades de quien mira sobre `staff`. Sin pasarla, la del contexto.
 * @param esPortal si se dibuja dentro del portal del cliente. Sin pasarla, la del contexto.
 * @param mostrarNombre si se dibuja el nombre junto al avatar.
 * @param className clases extra.
 * @returns el avatar, enlazado o plano segun corresponda.
 */
export function EnlacePersona ({
  id,
  nombre,
  imagen = null,
  tamano = 'medio',
  capacidades,
  esPortal,
  mostrarNombre = true,
  className
}: PropsEnlacePersona): ReactElement {
  const contexto = useContextoEnlaces('staff')
  const capacidadesEfectivas = capacidades ?? contexto.capacidades
  const esPortalEfectivo = esPortal ?? contexto.esPortal

  if (!puedeEnlazarEntidad(capacidadesEfectivas, 'staff', esPortalEfectivo)) {
    if (!mostrarNombre) return <Avatar nombre={nombre} imagen={imagen} tamano={tamano} className={className} />

    return (
      <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
        <Avatar nombre={nombre} imagen={imagen} tamano={tamano} />
        <span className="truncate">{nombre}</span>
      </span>
    )
  }

  return (
    <TarjetaFlotantePersona
      id={id}
      nombre={nombre}
      imagen={imagen}
      tamano={tamano}
      mostrarNombre={mostrarNombre}
      className={className}
    />
  )
}
