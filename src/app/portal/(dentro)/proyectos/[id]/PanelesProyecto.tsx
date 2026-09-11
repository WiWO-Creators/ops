import Link from 'next/link'
import { Vacio } from '@/componentes/estado/Estados'
import { formatearFecha } from '@/lib/fechas'
import { aTextoPlano, formatearImporte } from '@/componentes/proyecto/formatos'
import { BarraProgreso } from '@/componentes/proyecto/CabeceraProyecto'
import { Metrica, formatearNumero, textoPlazo } from '@/componentes/proyecto/ResumenProyecto'
import { DatoDeFicha } from '@/componentes/proyecto/DatoDeFicha'
import { Fecha } from '@/componentes/presentadores/Fecha'
import type { EmpresaPortal } from '@/datos/tipos'
import { pedirPortal } from '@/datos/servidor'
import { cargarLookupsDelPortal, opcionesDeFiltros } from '@/datos/lookups'
import { PORTAL_TAREAS } from '@/definiciones/portal-proyectos'
import { GLOSARIO } from '@/dominio/glosario'
import type {
  ArchivoPortal,
  EspacioPortal,
  HitoPortal,
  TareaPortal,
  TicketPortal
} from '@/datos/portal'
import { EstadoDelPortal, NombreDeArchivo } from '../../detalle'
import { TablaDeTareas } from './TablaDeTareas'

/**
 * El contenido de cada pestaña del proyecto.
 *
 * Cada panel se pide en el servidor y solo cuando la pestaña esta habilitada: pedirlos todos por si
 * acaso serian siete llamadas a la API para mostrar una.
 */

/**
 * La pestaña Descripcion, que es la misma que abre un colaborador en el panel.
 *
 * Mismo armado que `PanelDescripcion`: barra de avance arriba, la ficha a la izquierda y las
 * metricas a la derecha. Las filas de la ficha son las mismas, con el mismo rotulo y en el mismo
 * orden, y salen del mismo componente.
 *
 * Faltan cuatro filas que el panel muestra y la API del portal no manda: tipo de facturacion, fecha
 * de creacion, campos personalizados y etiquetas. No es una decision de producto sino el contrato:
 * el dia que `GET /portal/projects/{id}` las emita, se agregan acá y la ficha queda identica.
 *
 * Las metricas tampoco son las cuatro del panel. `Gastos` sale del modulo de ventas, que produccion
 * no usa, y el registro total de horas necesita el `overview` del panel, que el portal no tiene.
 */
export async function PanelResumen ({ proyecto }: { proyecto: EspacioPortal }) {
  const { data: empresa } = await pedirPortal<EmpresaPortal>('/portal/company')
  const descripcion = aTextoPlano(proyecto.description ?? '')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <BarraProgreso porcentaje={proyecto.progress} className="min-w-0 flex-1" />
        <span data-numerico className="text-texto text-sm font-semibold">
          {Math.round(proyecto.progress)}%
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col gap-3 border p-5">
          <h2 className="text-texto text-sm font-semibold">
            Resumen del {GLOSARIO.espacio.singular.toLowerCase()}
          </h2>

          <dl className="flex flex-col">
            <DatoDeFicha termino={`${GLOSARIO.espacio.singular} #`}>{proyecto.id}</DatoDeFicha>
            <DatoDeFicha termino={GLOSARIO.cliente.singular}>{empresa.company}</DatoDeFicha>

            {/* Los importes solo llegan con `view_finance_overview`: la API ni siquiera emite las
                claves cuando no, asi que `undefined` significa "no corresponde" y no "vacio". */}
            {proyecto.project_cost !== undefined && proyecto.project_cost !== null && (
              <DatoDeFicha termino="Costo total">{formatearImporte(proyecto.project_cost, null)}</DatoDeFicha>
            )}
            {proyecto.project_rate_per_hour !== undefined && proyecto.project_rate_per_hour !== null && (
              <DatoDeFicha termino="Tarifa por hora">
                {formatearImporte(proyecto.project_rate_per_hour, null)}
              </DatoDeFicha>
            )}

            <DatoDeFicha termino="Estado">
              <EstadoDelPortal catalogo="project_statuses" valor={proyecto.status} />
            </DatoDeFicha>
            <DatoDeFicha termino="Fecha de inicio"><Fecha valor={proyecto.start_date} /></DatoDeFicha>

            {proyecto.deadline !== null && (
              <DatoDeFicha termino="Fecha límite"><Fecha valor={proyecto.deadline} comoVencimiento /></DatoDeFicha>
            )}
            {proyecto.date_finished !== null && (
              <DatoDeFicha termino="Fecha de finalización">
                <span className="text-texto-exito"><Fecha valor={proyecto.date_finished} /></span>
              </DatoDeFicha>
            )}

            <DatoDeFicha termino="Horas estimadas">{formatearNumero(proyecto.estimated_hours, ' h')}</DatoDeFicha>
          </dl>

          <div className="flex flex-col gap-1">
            <h3 className="text-texto-sutil text-xs">Descripción</h3>
            <p className="text-texto text-sm whitespace-pre-line">
              {descripcion === '' ? 'Sin descripción' : descripcion}
            </p>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 self-start md:grid-cols-3">
          <Metrica
            etiqueta={`${GLOSARIO.proceso.plural} abiertas`}
            valor={`${proyecto.counts.tasks_open} / ${proyecto.counts.tasks}`}
          />
          <Metrica etiqueta="Días restantes" valor={textoPlazo(proyecto.deadline)} />
          <Metrica etiqueta={GLOSARIO.hito.plural} valor={String(proyecto.counts.milestones)} />
        </div>
      </div>
    </div>
  )
}

export async function PanelTareas ({ proyectoId }: { proyectoId: number }) {
  const { data, meta } = await pedirPortal<TareaPortal[]>(`/portal/projects/${proyectoId}/tasks?per_page=100`)

  if (data.length === 0) {
    return <Vacio titulo={`Sin ${GLOSARIO.proceso.plural.toLowerCase()}`} descripcion="Todavía no hay nada que mostrar acá." />
  }

  // Sin el catalogo de estados la columna Estado muestra el numero crudo que devuelve la API, y el
  // filtro se queda sin opciones que ofrecer.
  const lookups = await cargarLookupsDelPortal()

  return (
    <TablaDeTareas
      proyectoId={proyectoId}
      inicial={{ filas: data, paginacion: meta?.pagination }}
      opcionesDeFiltro={opcionesDeFiltros(PORTAL_TAREAS, lookups)}
    />
  )
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
      {data.map((archivo) => {
        const rotulado = archivo.subject !== null && archivo.subject !== ''

        return (
          <li
            key={archivo.id}
            className="rounded-chico border-linea flex flex-wrap items-baseline gap-x-3 gap-y-1 border p-3"
          >
            <NombreDeArchivo archivo={archivo} />
            {rotulado && <span className="text-texto-tenue text-sm">{archivo.subject}</span>}
            <span className="text-texto-tenue ml-auto text-xs">{formatearFecha(archivo.date_added)}</span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Tickets de soporte acotados a este proyecto.
 *
 * Se dibuja como lista y no con `TablaRecurso`: es un subconjunto chico dentro de una pestaña, y
 * meter ahi un motor de tabla con su propio estado en la URL chocaria con el `?tab=` del proyecto.
 */
export async function PanelTicketsDelProyecto ({ proyectoId }: { proyectoId: number }) {
  const { data } = await pedirPortal<TicketPortal[]>(`/portal/projects/${proyectoId}/tickets?per_page=100`)

  if (data.length === 0) {
    return <Vacio titulo="Nada por acá" descripcion="Este proyecto todavía no tiene tickets." />
  }

  return (
    <ul className="flex flex-col gap-2">
      {data.map((ticket) => (
        <li key={ticket.id} className="rounded-chico border-linea flex flex-wrap items-center gap-3 border p-3">
          <Link
            href={`/portal/soporte/${ticket.id}`}
            className="text-texto hover:text-acento text-sm font-medium underline-offset-4 hover:underline"
          >
            {ticket.subject}
          </Link>
          <EstadoDelPortal catalogo="ticket_statuses" valor={ticket.status} />
          <span className="text-texto-tenue ml-auto text-sm">{formatearFecha(ticket.date)}</span>
        </li>
      ))}
    </ul>
  )
}
