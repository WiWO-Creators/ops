'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/clases'

export interface Panel {
  /** Valor que viaja en `?tab=`. */
  clave: string
  etiqueta: string
  contenido: React.ReactNode
}

/**
 * Navegacion por pestañas con el estado en la URL.
 *
 * La URL es la unica fuente, igual que en `TablaRecurso`: asi una pestaña se puede compartir por
 * enlace y "atras" hace lo que la persona espera. Se usa `replace` y no `push` por la misma razon que
 * ahi — pasear por las pestañas no deberia llenar el historial.
 *
 * Los paneles llegan ya renderizados desde el servidor y se muestran alternando cual se monta: pasar
 * la pestaña por navegacion volveria a pedir a la API los cinco recursos de la pantalla en cada clic.
 *
 * @param paneles pestañas en el orden en que se muestran; la primera es la de por defecto
 * @returns la barra de pestañas y el panel activo
 */
export function Pestanas ({ paneles }: { paneles: Panel[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const porDefecto = paneles[0]

  if (porDefecto === undefined) return null

  const pedida = params.get('tab')
  const activa = paneles.some((p) => p.clave === pedida) && pedida !== null ? pedida : porDefecto.clave

  /** Escribe la pestaña en la URL conservando el resto de los parametros de la vista. */
  function elegir (clave: string): void {
    const siguientes = new URLSearchParams(params.toString())
    siguientes.set('tab', clave)

    router.replace(`?${siguientes.toString()}`, { scroll: false })
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Secciones del proyecto" className="border-linea flex gap-1 border-b">
        {paneles.map((panel) => (
          <button
            key={panel.clave}
            type="button"
            role="tab"
            id={`pestana-${panel.clave}`}
            aria-selected={panel.clave === activa}
            aria-controls={`panel-${panel.clave}`}
            onClick={() => elegir(panel.clave)}
            className={cn(
              'rounded-t-chico -mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              panel.clave === activa
                ? 'border-acento text-acento'
                : 'text-texto-tenue hover:text-texto hover:bg-hover border-transparent'
            )}
          >
            {panel.etiqueta}
          </button>
        ))}
      </div>

      {paneles
        .filter((panel) => panel.clave === activa)
        .map((panel) => (
          <div key={panel.clave} role="tabpanel" id={`panel-${panel.clave}`} aria-labelledby={`pestana-${panel.clave}`}>
            {panel.contenido}
          </div>
        ))}
    </div>
  )
}
