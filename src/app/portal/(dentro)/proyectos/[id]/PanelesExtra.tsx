import { Vacio } from '@/componentes/estado/Estados'
import { formatearFecha } from '@/lib/fechas'
import { cn } from '@/lib/clases'
import { pedirPortal } from '@/datos/servidor'
import type {
  ActividadPortal,
  ColumnaGanttPortal,
  ComentarioPortal,
  DiscusionPortal,
  TiempoPortal
} from '@/datos/portal'
import { Bloque } from '../../detalle'

/**
 * Las cuatro pestañas que el equipo puede compartir además de las básicas.
 *
 * Ninguna permite escribir: el cliente lee la conversación, el registro y las horas, pero responder,
 * comentar o cargar tiempo sigue viviendo en el portal de Perfex.
 */

/** Discusiones compartidas, con sus comentarios ya desplegados. */
export async function PanelDiscusiones ({ proyectoId }: { proyectoId: number }) {
  const { data } = await pedirPortal<DiscusionPortal[]>(
    `/portal/projects/${proyectoId}/discussions?per_page=100`
  )

  if (data.length === 0) {
    return <Vacio titulo="Sin conversaciones" descripcion="Todavía no compartimos ninguna discusión de este proyecto." />
  }

  return (
    <div className="flex flex-col gap-4">
      {data.map((hilo) => (
        <Bloque key={hilo.id} titulo={hilo.subject}>
          {hilo.description !== null && hilo.description !== '' && (
            <p className="text-texto-tenue mb-3 text-sm whitespace-pre-line">{hilo.description}</p>
          )}
          <Comentarios proyectoId={proyectoId} hiloId={hilo.id} cantidad={hilo.counts.comments} />
        </Bloque>
      ))}
    </div>
  )
}

/**
 * Comentarios de un hilo.
 *
 * Se piden por hilo y no todos juntos: la API los cuelga de la discusión, y traerlos en una sola
 * llamada obligaría a un endpoint que hoy no existe. Con las pocas discusiones que un proyecto
 * comparte, son pocas llamadas.
 */
async function Comentarios ({
  proyectoId,
  hiloId,
  cantidad
}: {
  proyectoId: number
  hiloId: number
  cantidad: number
}) {
  if (cantidad === 0) {
    return <p className="text-texto-sutil text-sm">Sin respuestas todavía.</p>
  }

  const { data } = await pedirPortal<ComentarioPortal[]>(
    `/portal/projects/${proyectoId}/discussions/${hiloId}/comments`
  )

  return (
    <ol className="flex flex-col gap-3">
      {data.map((comentario) => (
        <li
          key={comentario.id}
          className={cn(
            'rounded-chico border p-3',
            comentario.author?.es_cliente === true
              ? 'border-linea-suave bg-transparent'
              : 'border-linea bg-superficie'
          )}
        >
          <p className="text-texto-tenue mb-1 text-xs">
            <span className="text-texto font-medium">{comentario.author?.full_name ?? 'Alguien'}</span>
            {' · '}
            {formatearFecha(comentario.created)}
          </p>
          <p className="text-texto text-sm whitespace-pre-line">{comentario.content}</p>
        </li>
      ))}
    </ol>
  )
}

/** Registro de actividad del proyecto, solo lo que el equipo marcó como visible. */
export async function PanelActividadPortal ({ proyectoId }: { proyectoId: number }) {
  const { data } = await pedirPortal<ActividadPortal[]>(
    `/portal/projects/${proyectoId}/activity?per_page=50`
  )

  if (data.length === 0) {
    return <Vacio titulo="Sin actividad" descripcion="Todavía no hay movimientos para mostrar." />
  }

  return (
    <ol className="flex flex-col gap-2">
      {data.map((entrada) => (
        <li key={entrada.id} className="border-linea-suave flex flex-wrap gap-x-3 border-b pb-2 text-sm last:border-0">
          <span className="text-texto">{entrada.description}</span>
          <span className="text-texto-tenue ml-auto whitespace-nowrap">
            {formatearFecha(entrada.date_added)}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Horas registradas sobre tareas que el cliente puede ver. */
export async function PanelTiempos ({ proyectoId }: { proyectoId: number }) {
  const { data } = await pedirPortal<TiempoPortal[]>(
    `/portal/projects/${proyectoId}/timesheets?per_page=100`
  )

  if (data.length === 0) {
    return <Vacio titulo="Sin horas registradas" descripcion="Todavía no hay tiempo cargado en este proyecto." />
  }

  const total = data.reduce((suma, r) => suma + r.duration_seconds, 0)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-texto-tenue text-sm">
        Total: <span className="text-texto font-medium tabular-nums">{horasYMinutos(total)}</span>
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-texto-sutil border-linea-suave border-b text-left text-xs tracking-wide uppercase">
              <th className="pb-2 font-medium">Tarea</th>
              <th className="pb-2 font-medium">Quién</th>
              <th className="pb-2 font-medium">Fecha</th>
              <th className="pb-2 text-right font-medium">Tiempo</th>
            </tr>
          </thead>
          <tbody>
            {data.map((registro) => (
              <tr key={registro.id} className="border-linea-suave border-b last:border-0">
                <td className="text-texto py-2">{registro.task.name}</td>
                <td className="text-texto-tenue py-2">{registro.staff?.full_name ?? ''}</td>
                <td className="text-texto-tenue py-2">{formatearFecha(registro.start_time)}</td>
                <td className="text-texto py-2 text-right tabular-nums">{registro.duration_hm}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * Gantt, como lista de hitos con sus barras.
 *
 * No es el Gantt arrastrable del panel: el cliente mira las fechas, no las mueve. Dibujarlo con la
 * misma librería sugeriría que puede reprogramar el proyecto desde acá.
 */
export async function PanelGantt ({ proyectoId }: { proyectoId: number }) {
  const { data } = await pedirPortal<ColumnaGanttPortal[]>(`/portal/projects/${proyectoId}/gantt`)

  if (data.length === 0) {
    return <Vacio titulo="Sin planificación" descripcion="Todavía no hay hitos con fechas para mostrar." />
  }

  return (
    <div className="flex flex-col gap-4">
      {data.map((columna) => (
        <Bloque key={columna.id} titulo={columna.nombre}>
          <ul className="flex flex-col gap-2">
            {columna.tareas.map((tarea) => (
              <li key={tarea.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="text-texto">{tarea.name}</span>
                <span className="text-texto-tenue tabular-nums">
                  {formatearFecha(tarea.start)}
                  {tarea.end !== null && ` → ${formatearFecha(tarea.end)}`}
                </span>
              </li>
            ))}
          </ul>
        </Bloque>
      ))}
    </div>
  )
}

/** Segundos como `Xh Ym`, el mismo formato que usa `duration_hm` del backend. */
function horasYMinutos (segundos: number): string {
  const horas = Math.floor(segundos / 3600)
  const minutos = Math.floor((segundos % 3600) / 60)

  return `${horas}h ${String(minutos).padStart(2, '0')}m`
}
