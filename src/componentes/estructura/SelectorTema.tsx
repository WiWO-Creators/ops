'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { aplicarTema, EVENTO_TEMA, leerTema, type Tema } from '@/lib/tema'
import { cn } from '@/lib/clases'

const OPCIONES: { valor: Tema, etiqueta: string }[] = [
  { valor: 'light', etiqueta: 'Claro' },
  { valor: 'dark', etiqueta: 'Oscuro' },
  { valor: 'sistema', etiqueta: 'Sistema' }
]

/**
 * Suscribe a los cambios de tema hechos en OTRA pestaña.
 *
 * El evento `storage` solo dispara en las demas pestañas, no en la que escribio. Por eso los cambios
 * propios se propagan con un evento sintetico que se emite desde `aplicarTema`.
 */
function suscribir (avisar: () => void): () => void {
  window.addEventListener('storage', avisar)
  window.addEventListener(EVENTO_TEMA, avisar)
  return () => {
    window.removeEventListener('storage', avisar)
    window.removeEventListener(EVENTO_TEMA, avisar)
  }
}

/**
 * Selector de tema claro / oscuro / sistema.
 *
 * Usa `useSyncExternalStore` en vez de leer en un efecto: `localStorage` es estado externo a React y
 * vive fuera del servidor. El tercer argumento es la respuesta del servidor (`'sistema'`), asi que no
 * hay diferencia entre el HTML renderizado y el hidratado, y ademas el tema queda sincronizado entre
 * pestañas sin escribir nada mas.
 */
export function SelectorTema ({ className }: { className?: string }) {
  const tema = useSyncExternalStore<Tema>(suscribir, leerTema, () => 'sistema')

  const elegir = useCallback((nuevo: Tema) => { aplicarTema(nuevo) }, [])

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className={cn('bg-superficie-hundida border-linea rounded-control inline-flex gap-0.5 border p-0.5', className)}
    >
      {OPCIONES.map((opcion) => (
        <button
          key={opcion.valor}
          type="button"
          role="radio"
          aria-checked={tema === opcion.valor}
          onClick={() => elegir(opcion.valor)}
          className={cn(
            'rounded-control px-3 py-1 text-xs font-semibold transition-colors duration-150',
            tema === opcion.valor
              ? 'bg-superficie-elevada text-texto shadow-1'
              : 'text-texto-tenue hover:text-texto'
          )}
        >
          {opcion.etiqueta}
        </button>
      ))}
    </div>
  )
}
