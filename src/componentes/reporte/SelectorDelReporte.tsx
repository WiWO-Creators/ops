import { rotularMes } from '@/dominio/gestion'
import { GLOSARIO } from '@/dominio/glosario'
import type { Referencia } from '@/datos/recursos'

/** Clases compartidas de los dos desplegables, las mismas del selector de mes de gestión. */
const DESPLEGABLE = 'border-linea rounded-medio bg-superficie text-texto h-9 w-full max-w-64 min-w-0 border px-2 text-sm'

/**
 * Mes y {espacio} del reporte, como `<form method="get">`.
 *
 * El estado vive en la URL (`?mes=` y `?project_id=`), igual que en el tablero de gestión: el
 * reporte se comparte por enlace, que es lo que se hace con un reporte mensual. Sin JavaScript
 * propio.
 *
 * Con un solo {espacio} el desplegable de {espacios} no se dibuja: elegir entre uno no es elegir.
 *
 * @param mes el mes que se está mirando, `YYYY-MM`
 * @param meses los meses ofrecidos, del más nuevo al más viejo
 * @param proyectos todos los {espacios} del contacto
 * @param proyectoId el {espacio} elegido, o `undefined` para todos
 */
export function SelectorDelReporte (
  { mes, meses, proyectos, proyectoId }:
  { mes: string, meses: string[], proyectos: Referencia[], proyectoId?: string }
) {
  return (
    <form method="get" className="flex max-w-full flex-wrap items-end gap-3">
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-texto-tenue text-xs font-medium">Mes</span>
        <select name="mes" defaultValue={mes} className={DESPLEGABLE}>
          {meses.map((opcion) => (
            <option key={opcion} value={opcion}>{rotularMes(opcion)}</option>
          ))}
        </select>
      </label>

      {proyectos.length > 1 && (
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-texto-tenue text-xs font-medium">{GLOSARIO.espacio.singular}</span>
          <select name="project_id" defaultValue={proyectoId ?? ''} className={DESPLEGABLE}>
            <option value="">Todos</option>
            {proyectos.map((proyecto) => (
              <option key={proyecto.id} value={String(proyecto.id)}>{proyecto.name}</option>
            ))}
          </select>
        </label>
      )}

      <button
        type="submit"
        className="border-linea rounded-medio bg-superficie-elevada text-texto hover:bg-hover focus-visible:ring-acento h-9 cursor-pointer border px-4 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
      >
        Ver reporte
      </button>
    </form>
  )
}
