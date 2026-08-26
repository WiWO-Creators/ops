import { Vacio } from '@/componentes/estado/Estados'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { formatearFecha } from '@/lib/fechas'
import { formatearImporte } from '@/componentes/proyecto/formatos'
import { BarraProgreso } from '@/componentes/proyecto/CabeceraProyecto'
import { Metrica } from '@/componentes/proyecto/ResumenProyecto'
import { pedirPortal } from '@/datos/servidor'
import { GLOSARIO } from '@/dominio/glosario'
import type {
  ArchivoPortal,
  DocumentoPortal,
  EspacioPortal,
  HitoPortal,
  TareaPortal,
  TicketPortal
} from '@/datos/portal'
import { Bloque, EstadoDelPortal } from '../../detalle'
import { TablaDeTareas } from './TablaDeTareas'

/**
 * El contenido de cada pestaña del proyecto.
 *
 * Cada panel se pide en el servidor y solo cuando la pestaña esta habilitada: pedirlos todos por si
 * acaso serian siete llamadas a la API para mostrar una.
 */

export async function PanelResumen ({ proyecto }: { proyecto: EspacioPortal }) {
  const finanzas = proyecto.project_cost !== undefined || proyecto.estimated_hours !== undefined

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metrica etiqueta="Avance" valor={`${proyecto.progress}%`} />
        <Metrica etiqueta={GLOSARIO.proceso.plural} valor={String(proyecto.counts.tasks)} />
        <Metrica etiqueta="Pendientes" valor={String(proyecto.counts.tasks_open)} />
        <Metrica etiqueta={GLOSARIO.hito.plural} valor={String(proyecto.counts.milestones)} />
      </div>

      {proyecto.description !== null && proyecto.description !== '' && (
        <Bloque titulo="Descripción">
          <p className="text-texto text-sm whitespace-pre-line">{proyecto.description}</p>
        </Bloque>
      )}

      {/* Los importes aparecen solo si el proyecto los comparte: la API ni siquiera emite las
          claves cuando no, asi que `undefined` aca significa "no corresponde" y no "vacio". */}
      {finanzas && (
        <Bloque titulo="Presupuesto">
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
            {proyecto.project_cost !== undefined && proyecto.project_cost !== null && (
              <Dato rotulo="Costo" valor={formatearImporte(proyecto.project_cost, null)} />
            )}
            {proyecto.project_rate_per_hour !== undefined && proyecto.project_rate_per_hour !== null && (
              <Dato rotulo="Por hora" valor={formatearImporte(proyecto.project_rate_per_hour, null)} />
            )}
            {proyecto.estimated_hours !== undefined && proyecto.estimated_hours !== null && (
              <Dato rotulo="Horas estimadas" valor={String(proyecto.estimated_hours)} />
            )}
          </dl>
        </Bloque>
      )}

      {proyecto.members !== undefined && proyecto.members.length > 0 && (
        <Bloque titulo="Equipo">
          <ul className="flex flex-wrap gap-2">
            {proyecto.members.map((persona) => (
              <li key={persona.id}>
                <Insignia>{persona.full_name}</Insignia>
              </li>
            ))}
          </ul>
        </Bloque>
      )}
    </div>
  )
}

function Dato ({ rotulo, valor }: { rotulo: string, valor: string }) {
  return (
    <div>
      <dt className="text-texto-sutil text-xs tracking-wide uppercase">{rotulo}</dt>
      <dd className="text-texto mt-0.5 text-sm">{valor}</dd>
    </div>
  )
}

export async function PanelTareas ({ proyectoId }: { proyectoId: number }) {
  const { data, meta } = await pedirPortal<TareaPortal[]>(`/portal/projects/${proyectoId}/tasks?per_page=100`)

  if (data.length === 0) {
    return <Vacio titulo={`Sin ${GLOSARIO.proceso.plural.toLowerCase()}`} descripcion="Todavía no hay nada que mostrar acá." />
  }

  return <TablaDeTareas proyectoId={proyectoId} inicial={{ filas: data, paginacion: meta?.pagination }} />
}

/**
 * Hitos, como lista con su avance.
 *
 * No es un tablero como en el panel: el cliente mira el estado, no lo mueve, y un kanban sugiere que
 * se puede arrastrar.
 */
export async function PanelHitos ({ proyectoId }: { proyectoId: number }) {
  const { data } = await pedirPortal<HitoPortal[]>(`/portal/projects/${proyectoId}/milestones`)

  if (data.length === 0) {
    return <Vacio titulo={`Sin ${GLOSARIO.hito.plural.toLowerCase()}`} descripcion="Todavía no hay nada que mostrar acá." />
  }

  return (
    <ul className="flex flex-col gap-3">
      {data.map((hito) => {
        const avance = hito.counts.tasks === 0 ? 0 : Math.round(hito.counts.tasks_done * 100 / hito.counts.tasks)

        return (
          <li
            key={hito.id}
            className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 border p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-titular text-texto font-semibold">{hito.name}</span>
              <span className="text-texto-tenue text-sm">
                {hito.due_date !== null && formatearFecha(hito.due_date)}
                {hito.vencido && <span className="text-texto-peligro ml-2">Vencido</span>}
              </span>
            </div>

            {hito.description !== null && hito.description !== '' && (
              <p className="text-texto-tenue mt-1 text-sm whitespace-pre-line">{hito.description}</p>
            )}

            <BarraProgreso porcentaje={avance} className="mt-3" />
            <p className="text-texto-sutil mt-1 text-xs">
              {hito.counts.tasks_done} de {hito.counts.tasks} {GLOSARIO.proceso.plural.toLowerCase()}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

export async function PanelArchivos ({ proyectoId }: { proyectoId: number }) {
  const { data } = await pedirPortal<ArchivoPortal[]>(`/portal/projects/${proyectoId}/files`)

  if (data.length === 0) {
    return <Vacio titulo="Sin archivos" descripcion="Todavía no compartimos archivos en este proyecto." />
  }

  return (
    <ul className="flex flex-col gap-2">
      {data.map((archivo) => (
        <li
          key={archivo.id}
          className="rounded-chico border-linea flex flex-wrap items-baseline justify-between gap-2 border p-3"
        >
          <span className="text-texto text-sm">
            {archivo.subject !== null && archivo.subject !== '' ? archivo.subject : archivo.file_name}
          </span>
          <span className="text-texto-tenue text-xs">{formatearFecha(archivo.date_added)}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Facturas, presupuestos o tickets acotados a este proyecto.
 *
 * Se dibujan como lista y no con `TablaRecurso`: son subconjuntos chicos dentro de una pestaña, y
 * meter ahi un motor de tabla con su propio estado en la URL chocaria con el `?tab=` del proyecto.
 */
export async function PanelDocumentosDelProyecto ({
  proyectoId,
  recurso
}: {
  proyectoId: number
  recurso: 'invoices' | 'estimates' | 'tickets'
}) {
  const seccion = { invoices: 'facturas', estimates: 'presupuestos', tickets: 'soporte' }[recurso]
  const catalogo = {
    invoices: 'invoice_statuses',
    estimates: 'estimate_statuses',
    tickets: 'ticket_statuses'
  }[recurso]

  const { data } = await pedirPortal<Array<DocumentoPortal | TicketPortal>>(
    `/portal/projects/${proyectoId}/${recurso}?per_page=100`
  )

  if (data.length === 0) {
    return <Vacio titulo="Nada por acá" descripcion="Este proyecto todavía no tiene documentos de este tipo." />
  }

  return (
    <ul className="flex flex-col gap-2">
      {data.map((fila) => (
        <li key={fila.id} className="rounded-chico border-linea flex flex-wrap items-center gap-3 border p-3">
          <a
            href={`/portal/${seccion}/${fila.id}`}
            className="text-texto hover:text-acento text-sm font-medium underline-offset-4 hover:underline"
          >
            {'number' in fila ? fila.number : fila.subject}
          </a>
          <EstadoDelPortal catalogo={catalogo} valor={fila.status} />
          <span className="text-texto-tenue ml-auto text-sm">{formatearFecha(fila.date)}</span>
        </li>
      ))}
    </ul>
  )
}
