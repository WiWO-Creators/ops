import type { ReactNode } from 'react'
import { GLOSARIO } from '@/dominio/glosario'
import type { TareaEnPantalla } from '@/datos/pantalla-area'
import { Cara, Nada, Ocultos, TituloDeEscena } from './piezas'

/**
 * Las Tareas abiertas del area, por urgencia.
 *
 * El orden lo decide la API —vencidas, despues por fecha, y las sin fecha al final— y la pantalla no
 * lo toca: reordenar acá haria que la lista se reacomode sola en cada sondeo mientras alguien la esta
 * leyendo.
 *
 * Lo vencido se marca con color y con la palabra, no solo con color: a cuatro metros y con el reflejo
 * de una ventana, un rojo y un naranja son el mismo color.
 */
export function EscenaProcesos ({ items, ocultos, total }: {
  items: TareaEnPantalla[]
  ocultos: number
  total: number
}): ReactNode {
  if (items.length === 0) return <Nada texto={`Sin ${GLOSARIO.proceso.plural.toLowerCase()} abiertas`} />

  return (
    <div className="flex min-h-0 flex-col">
      <TituloDeEscena>
        {GLOSARIO.proceso.plural} del área
        <span className="text-texto-sutil ml-[1.5vmin] font-normal tabular-nums">{total}</span>
      </TituloDeEscena>

      <ul className="flex flex-col gap-[1.4vmin]">
        {items.map((tarea) => (
          <li
            key={tarea.id}
            className="border-linea bg-superficie-elevada flex items-center gap-[2vmin] rounded-[1.6vmin] border px-[2.5vmin] py-[1.4vmin]"
          >
            <span
              className="h-[5vmin] w-[0.8vmin] shrink-0 rounded-full"
              style={{ backgroundColor: tarea.status?.color ?? 'var(--color-linea-fuerte)' }}
            />

            <div className="flex min-w-0 flex-1 flex-col gap-[0.3vmin]">
              <p className="text-texto truncate text-[3.2vmin] font-semibold">{tarea.name}</p>
              <p className="text-texto-tenue truncate text-[2.6vmin]">
                {tarea.project?.name ?? `Sin ${GLOSARIO.espacio.singular.toLowerCase()}`}
                {tarea.status !== null && ` · ${tarea.status.name}`}
              </p>
            </div>

            <Avance progreso={tarea.progress} />

            <Vencimiento fecha={tarea.due_date} vencida={tarea.overdue} />

            <ul className="flex shrink-0 -space-x-[1.2vmin]">
              {tarea.assignees.slice(0, 3).map((persona) => (
                <li key={persona.staff_id}>
                  <Cara nombre={persona.name} imagen={persona.avatar} tamano="5vmin" />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <Ocultos cuantos={ocultos} />
    </div>
  )
}

/**
 * El avance en checklist, cuando lo hay.
 *
 * `percent` es `null` cuando la Tarea no tiene checklist, y entonces no se muestra nada: un cero
 * inventado se lee como "no empezó", que es una afirmacion que la API no hizo.
 */
function Avance ({ progreso }: { progreso: TareaEnPantalla['progress'] }): ReactNode {
  if (progreso.percent === null) return null

  return (
    <div className="hidden shrink-0 items-center gap-[1vmin] sm:flex">
      <div className="bg-linea-suave h-[0.8vmin] w-[10vmin] overflow-hidden rounded-full">
        <div className="bg-acento h-full rounded-full" style={{ width: `${progreso.percent}%` }} />
      </div>
      <span className="text-texto-tenue w-[6vmin] text-[2.4vmin] tabular-nums">
        {progreso.percent}%
      </span>
    </div>
  )
}

/** La fecha de vencimiento, con la palabra y no solo el color. */
function Vencimiento ({ fecha, vencida }: { fecha: string | null, vencida: boolean }): ReactNode {
  if (fecha === null) return null

  return (
    <span
      className={[
        'shrink-0 rounded-[1vmin] px-[1.5vmin] py-[0.6vmin] text-[2.6vmin] font-semibold tabular-nums',
        vencida ? 'bg-superficie-peligro text-texto-peligro' : 'text-texto-tenue'
      ].join(' ')}
    >
      {vencida && 'Vencida · '}{formatoCorto(fecha)}
    </span>
  )
}

/**
 * `YYYY-MM-DD` a `DD/MM`.
 *
 * A mano y no con `Intl`: la fecha llega como dia calendario, sin hora ni zona, y pasarla por `Date`
 * la interpreta en UTC y la corre un dia en cuanto el televisor esta al oeste de Greenwich.
 */
function formatoCorto (fecha: string): string {
  const [, mes, dia] = fecha.split('-')

  return dia === undefined || mes === undefined ? fecha : `${dia}/${mes}`
}
