import { BarraProgreso } from './CabeceraProyecto'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Vacio } from '@/componentes/estado/Estados'
import { GLOSARIO } from '@/dominio/glosario'
import type { Hito } from '@/datos/recursos'

/**
 * Avance de un hito en porcentaje.
 *
 * @param counts contadores del hito
 * @returns el porcentaje, o `null` si el hito no tiene tareas — dividir por cero daria `NaN` y
 *          pintar 0% mentiria: un hito sin tareas no esta atrasado, esta vacio
 */
function avanceDe (counts: Hito['counts']): number | null {
  if (counts.tasks <= 0) return null

  return (counts.tasks_done / counts.tasks) * 100
}

/** Una fila de la lista: identidad del hito, sus fechas y su avance. */
function FilaHito ({ hito }: { hito: Hito }) {
  const avance = avanceDe(hito.counts)

  return (
    <li className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col gap-3 border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {hito.color !== null && hito.color !== '' && (
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: hito.color }} />
          )}
          <span className="text-texto truncate font-medium">{hito.name}</span>
        </span>

        <span className="text-texto-tenue flex items-center gap-2 text-xs">
          <Fecha valor={hito.start_date} />
          <span aria-hidden="true">→</span>
          <Fecha valor={hito.due_date} comoVencimiento />
        </span>
      </div>

      {avance === null
        ? <p className="text-texto-sutil text-xs">Sin {GLOSARIO.proceso.plural.toLowerCase()} asociadas</p>
        : (
          <div className="flex items-center gap-3">
            <BarraProgreso porcentaje={avance} className="min-w-0 flex-1" />
            <span data-numerico className="text-texto-tenue text-xs">
              {hito.counts.tasks_done}/{hito.counts.tasks}
            </span>
          </div>
          )}
    </li>
  )
}

/**
 * Lista de hitos del Proyecto, en el orden en que los devuelve la API.
 *
 * @param hitos los hitos ya cargados
 * @returns la lista, o el estado vacio si el proyecto todavia no tiene ninguno
 */
export function ListaHitos ({ hitos }: { hitos: Hito[] }) {
  if (hitos.length === 0) {
    return (
      <Vacio
        titulo={`Sin ${GLOSARIO.hito.plural.toLowerCase()}`}
        descripcion="Los hitos parten el proyecto en entregas con fecha. Se crean desde el panel."
      />
    )
  }

  return <ul className="flex flex-col gap-2">{hitos.map((hito) => <FilaHito key={hito.id} hito={hito} />)}</ul>
}
