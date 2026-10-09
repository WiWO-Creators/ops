import { cn } from '@/lib/clases'

interface PropsBarraProgreso {
  /** Porcentaje ya calculado, 0-100. Se acota: la API puede mandar 103 en un hito sobrecumplido. */
  porcentaje: number
  className?: string
}

/**
 * Barra de avance del sistema.
 *
 * Una sola barra para todo avance del panel y del portal: Proyecto, Hito, plazos, calidad, Tarea de
 * ticket. El alto y el ancho los pone quien la monta con `className`.
 *
 * @param porcentaje avance en 0-100; se acota a ese rango antes de pintar
 * @returns la barra, anunciada como `progressbar` para lectores de pantalla
 */
export function BarraProgreso ({ porcentaje, className }: PropsBarraProgreso) {
  const valor = Math.max(0, Math.min(100, Math.round(porcentaje)))

  return (
    <span
      role="progressbar"
      aria-valuenow={valor}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('bg-relleno-neutro block h-2 w-full overflow-hidden rounded-full', className)}
    >
      <span className="bg-acento block h-full rounded-full" style={{ width: `${valor}%` }} />
    </span>
  )
}
