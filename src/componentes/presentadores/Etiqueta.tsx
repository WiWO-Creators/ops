import { cn } from '@/lib/clases'

interface Tag { id: number, name: string }

interface PropsEtiquetas {
  etiquetas: Tag[]
  /** Cuantas se muestran antes del contador. */
  maximo?: number
  className?: string
}

/**
 * Lista de etiquetas de una entidad.
 *
 * Igual que en `GrupoAvatares`, el excedente se resume en un contador para no romper el alto de la
 * fila. El `title` conserva los nombres completos.
 */
export function Etiquetas ({ etiquetas, maximo = 2, className }: PropsEtiquetas) {
  if (etiquetas.length === 0) return null

  const visibles = etiquetas.slice(0, maximo)
  const restantes = etiquetas.length - visibles.length

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {visibles.map((etiqueta) => (
        <span
          key={etiqueta.id}
          className="bg-relleno-neutro text-texto-tenue rounded-chico px-1.5 py-0.5 text-[0.6875rem] leading-none"
        >
          {etiqueta.name}
        </span>
      ))}
      {restantes > 0 && (
        <span
          className="text-texto-sutil text-[0.6875rem]"
          title={etiquetas.slice(maximo).map((e) => e.name).join(', ')}
        >
          +{restantes}
        </span>
      )}
    </span>
  )
}
