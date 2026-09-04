'use client'

import { ViewTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/clases'

/**
 * Nombre de transicion del subrayado activo.
 *
 * Al vivir en un solo elemento del documento —el de la pestaña activa—, el navegador reconoce el
 * subrayado de antes y el de despues como la misma cosa e interpola su posicion y su ancho solo. Es
 * la razon de que no haya que medir nada con `getBoundingClientRect`.
 */
const NOMBRE_INDICADOR = 'pestana-activa'

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
 * El movimiento se apoya en que `router.replace` ya es una transicion de React: eso basta para que
 * `<ViewTransition>` y el `view-transition-name` del subrayado se activen sin coordinar tiempos a
 * mano. El subrayado se desliza de una pestaña a la otra y el panel hace crossfade en vez de saltar.
 *
 * @param paneles pestañas en el orden en que se muestran; la primera es la de por defecto
 * @param etiqueta nombre accesible de la barra; nombra la pantalla que la monta, no "pestañas"
 * @returns la barra de pestañas y el panel activo
 */
export function Pestanas ({
  paneles,
  etiqueta = 'Secciones del proyecto'
}: {
  paneles: Panel[]
  etiqueta?: string
}) {
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
      <div role="tablist" aria-label={etiqueta} className="border-linea flex gap-1 border-b">
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
              'rounded-t-chico relative px-3 py-2 text-sm font-medium transition-colors',
              panel.clave === activa ? 'text-acento' : 'text-texto-tenue hover:text-texto hover:bg-hover'
            )}
          >
            {panel.etiqueta}
            {panel.clave === activa && (
              <span
                aria-hidden="true"
                style={{ viewTransitionName: NOMBRE_INDICADOR }}
                className="bg-acento absolute inset-x-0 -bottom-px h-0.5"
              />
            )}
          </button>
        ))}
      </div>

      {paneles
        .filter((panel) => panel.clave === activa)
        .map((panel) => (
          // `default="none"`: sin eso el panel entero haria crossfade en cada transicion ajena —un
          // filtro de la tabla que tiene adentro, sin ir mas lejos—, que es movimiento sin motivo.
          <ViewTransition key={panel.clave} enter="auto" exit="auto" default="none">
            <div role="tabpanel" id={`panel-${panel.clave}`} aria-labelledby={`pestana-${panel.clave}`}>
              {panel.contenido}
            </div>
          </ViewTransition>
        ))}
    </div>
  )
}
