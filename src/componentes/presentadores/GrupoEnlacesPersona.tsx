import type { ReactElement } from 'react'
import { cn } from '@/lib/clases'
import { EnlacePersona } from '@/componentes/presentadores/EnlacePersona'
import type { TamanoAvatar } from '@/componentes/presentadores/Avatar'

interface PropsGrupoEnlacesPersona {
  personas: { id: number, full_name: string, profile_image_url?: string | null }[]
  tamano?: TamanoAvatar
  /** Cuantos se muestran antes del contador. */
  maximo?: number
  /** Capacidades de quien mira sobre `staff`. Sin pasarla, se toma del `ProveedorEnlaces` mas cercano. */
  capacidades?: readonly string[]
  /**
   * `true` si el componente se dibuja dentro del portal del cliente: nunca enlaza ahi. Sin pasarla,
   * se toma del `ProveedorEnlaces` mas cercano.
   */
  esPortal?: boolean
  className?: string
}

/**
 * Pila de avatares con contador de excedente, mismo look que `GrupoAvatares`, pero cada avatar
 * visible es un `EnlacePersona`: enlaza a `/equipo/{id}` y muestra su tarjeta flotante cuando
 * corresponde.
 *
 * Con el mouse alcanza el `title` de cada avatar y su tarjeta flotante; los nombres viajan ademas una
 * sola vez en un texto `sr-only`, igual que en `GrupoAvatares` — sin eso, el lector de pantalla
 * anunciaria "JA, JL, +2" y la columna de asignados dejaria de existir para quien no ve.
 *
 * @param personas quienes se muestran en la pila.
 * @param tamano tamano de cada avatar.
 * @param maximo cuantos se muestran antes del contador de excedente.
 * @param capacidades capacidades de quien mira sobre `staff`. Sin pasarla, la del contexto.
 * @param esPortal si se dibuja dentro del portal del cliente. Sin pasarla, la del contexto.
 * @param className clases extra.
 * @returns la pila, enlazada persona por persona segun corresponda.
 */
export function GrupoEnlacesPersona (
  { personas, tamano = 'chico', maximo = 3, capacidades, esPortal, className }: PropsGrupoEnlacesPersona
): ReactElement {
  if (personas.length === 0) {
    return <span className="text-texto-sutil text-xs">Sin asignar</span>
  }

  const visibles = personas.slice(0, maximo)
  const restantes = personas.length - visibles.length

  return (
    <span className={cn('inline-flex items-center', className)}>
      <span className="inline-flex items-center" aria-hidden="true">
        {visibles.map((persona) => (
          <EnlacePersona
            key={persona.id}
            id={persona.id}
            nombre={persona.full_name}
            imagen={persona.profile_image_url}
            tamano={tamano}
            capacidades={capacidades}
            esPortal={esPortal}
            mostrarNombre={false}
            className="ring-superficie-elevada -ml-1 rounded-full ring-2 first:ml-0"
          />
        ))}
        {restantes > 0 && (
          <span
            className="bg-relleno-neutro text-texto-tenue ring-superficie-elevada -ml-1 inline-flex size-6 items-center justify-center rounded-full text-micro font-semibold ring-2"
            title={personas.slice(maximo).map((persona) => persona.full_name).join(', ')}
          >
            +{restantes}
          </span>
        )}
      </span>
      <span className="sr-only">{personas.map((persona) => persona.full_name).join(', ')}</span>
    </span>
  )
}
