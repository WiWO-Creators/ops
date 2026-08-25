'use client'

import { useCallback } from 'react'
import { Moon, Sun } from 'lucide-react'
import { aplicarTema, esOscuro } from '@/lib/tema'
import { cn } from '@/lib/clases'

/**
 * Boton que alterna entre tema claro y oscuro.
 *
 * Cual de los dos iconos se ve lo decide la variante `oscuro:` (CSS puro, ver `globals.css`) y no el
 * estado de React: el tema efectivo depende de `localStorage` y de la preferencia del sistema, dos
 * cosas que el servidor no puede saber. Resolverlo al renderizar daria un icono equivocado en el HTML
 * inicial; resolverlo en CSS lo deja correcto desde el primer pintado y sin parpadeo.
 */
export function SelectorTema ({ className }: { className?: string }) {
  const alternar = useCallback(() => { aplicarTema(esOscuro() ? 'light' : 'dark') }, [])

  return (
    <button
      type="button"
      onClick={alternar}
      title="Cambiar tema"
      aria-label="Cambiar tema"
      className={cn(
        'border-linea bg-superficie-hundida text-texto-tenue hover:text-texto hover:bg-superficie-elevada',
        'relative grid size-9 place-items-center rounded-control border transition-colors duration-150',
        'focus-visible:outline-acento focus-visible:outline-2 focus-visible:outline-offset-2',
        className
      )}
    >
      {/* Los dos iconos comparten celda del grid y se cruzan girando: el que sale rota y se encoge
          mientras el que entra hace el camino inverso. Apilarlos evita que el boton salte de tamaño. */}
      <Sun
        aria-hidden
        className="col-start-1 row-start-1 size-4 rotate-0 scale-100 transition-transform duration-300 oscuro:-rotate-90 oscuro:scale-0"
      />
      <Moon
        aria-hidden
        className="col-start-1 row-start-1 size-4 rotate-90 scale-0 transition-transform duration-300 oscuro:rotate-0 oscuro:scale-100"
      />
    </button>
  )
}
