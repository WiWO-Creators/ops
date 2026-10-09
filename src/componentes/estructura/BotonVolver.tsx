import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/clases'

interface PropsBotonVolver {
  /** A donde vuelve: el listado del que salio la ficha. */
  href: string
  /** Lo que se lee al lado de la flecha. Ej: "Clientes". */
  etiqueta: string
  className?: string
}

/**
 * El enlace de regreso al listado, arriba de la cabecera de una ficha.
 *
 * Es un `Link` y no un `Boton`: navega a una URL que se puede abrir en otra pestaña. Va en tono
 * sutil y en letra chica porque es camino, no accion, y no debe competir con el titulo que tiene
 * debajo.
 *
 * @param props destino, etiqueta y clases extra
 * @returns el enlace con la flecha
 */
export function BotonVolver ({ href, etiqueta, className }: PropsBotonVolver) {
  return (
    <Link
      href={href}
      className={cn(
        'text-texto-sutil hover:text-texto rounded-control ease-neo inline-flex w-fit items-center gap-1 text-xs font-medium transition-colors duration-rapida',
        className
      )}
    >
      <ArrowLeft aria-hidden="true" className="size-3.5" />
      {etiqueta}
    </Link>
  )
}
