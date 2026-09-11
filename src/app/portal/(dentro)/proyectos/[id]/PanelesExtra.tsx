import { Vacio } from '@/componentes/estado/Estados'
import {
  CeldaEncabezado,
  CeldaTabla,
  CuerpoTabla,
  EncabezadoTabla,
  FilaTabla,
  Tabla
} from '@/componentes/datos/Tabla'
import { GLOSARIO } from '@/dominio/glosario'
import { formatearFecha } from '@/lib/fechas'
import { pedirPortal } from '@/datos/servidor'
import type {
  ActividadPortal,
  ColumnaGanttPortal,
  ComentarioPortal,
  DiscusionPortal,
  TiempoPortal
} from '@/datos/portal'
import { ComentarioDeDiscusion } from '@/componentes/proyecto/ComentarioDeDiscusion'
import { LineaDeActividad } from '@/componentes/proyecto/LineaDeActividad'
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

  // La misma tarjeta que ve el equipo: avatar, la marca de quien es del cliente, la hora y el
  // adjunto. Antes era una burbuja propia sin nada de eso.
  return (
    <ul className="flex flex-col gap-2">
      {data.map((comentario) => (
        <ComentarioDeDiscusion key={comentario.id} comentario={comentario} />
      ))}
    </ul>
  )
}

/**
 * Registro de actividad del proyecto, solo lo que el equipo marcó como visible.
 *
 * La misma linea de tiempo que ve el equipo, sin el interruptor de visibilidad: eso es lo unico que
 * cambia, y por eso es una prop y no otro componente. Antes acá habia una lista plana sin autor ni
 * hora, o sea que la misma actividad se leia distinto segun quien la mirara.
 */
export async function PanelActividadPortal ({ proyectoId }: { proyectoId: number }) {
  const { data } = await pedirPortal<ActividadPortal[]>(
    `/portal/projects/${proyectoId}/activity?per_page=50`
  )

  return (
    <LineaDeActividad
      entradas={data}
      vacio={{ titulo: 'Sin actividad', descripcion: 'Todavía no hay movimientos para mostrar.' }}
    />
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

      {/* La tabla del sistema y no un `<table>` a mano: el portal y el panel tienen que envejecer
          juntos, y esta era la ultima grilla del portal dibujada por fuera. */}
      <Tabla>
        <EncabezadoTabla>
          <tr>
            <CeldaEncabezado>{GLOSARIO.proceso.singular}</CeldaEncabezado>
            <CeldaEncabezado>Quién</CeldaEncabezado>
            <CeldaEncabezado>Fecha</CeldaEncabezado>
            <CeldaEncabezado numerica>Tiempo</CeldaEncabezado>
          </tr>
        </EncabezadoTabla>
        <CuerpoTabla>
          {data.map((registro) => (
            <FilaTabla key={registro.id}>
              <CeldaTabla className="text-texto">{registro.task.name}</CeldaTabla>
              <CeldaTabla className="text-texto-tenue">{registro.staff?.full_name ?? ''}</CeldaTabla>
              <CeldaTabla className="text-texto-tenue" sinCortar>
                {formatearFecha(registro.start_time)}
              </CeldaTabla>
              <CeldaTabla numerica>{registro.duration_hm}</CeldaTabla>
            </FilaTabla>
          ))}
        </CuerpoTabla>
      </Tabla>
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
