import type { Metadata } from 'next'
import { cache } from 'react'
import { Pestanas, type Panel } from '@/componentes/proyecto/Pestanas'
import { ErrorApi } from '@/datos/errores'
import type { EspacioPortal, TareaPortal } from '@/datos/portal'
import { pestaniasDelProyecto } from '@/definiciones/portal-proyectos'
import { BarraProgreso } from '@/componentes/proyecto/CabeceraProyecto'
import { formatearFecha } from '@/lib/fechas'
import { cargarDetalle, EstadoDeError, EstadoDelPortal, Volver } from '../../detalle'
import { AprobacionesPendientes } from './AprobacionesPendientes'
import {
  PanelArchivos,
  PanelHitos,
  PanelResumen,
  PanelTareas,
  PanelTicketsDelProyecto
} from './PanelesProyecto'
import {
  PanelActividadPortal,
  PanelDiscusiones,
  PanelGantt,
  PanelTiempos
} from './PanelesExtra'

/**
 * Detalle de un proyecto, con las pestañas que el equipo compartio.
 *
 * `cache()` evita que `generateMetadata` y la pagina pidan el proyecto dos veces en la misma
 * peticion.
 */
const cargarProyecto = cache(async (id: string) => await cargarDetalle<EspacioPortal>(`/portal/projects/${id}`))

export async function generateMetadata (props: PageProps<'/portal/proyectos/[id]'>): Promise<Metadata> {
  const { id } = await props.params
  const sobre = await cargarProyecto(id)
  const nombre = sobre instanceof ErrorApi ? 'Proyecto' : sobre.data.name

  return { title: `${nombre} · Portal de clientes` }
}

export default async function ProyectoPagina (props: PageProps<'/portal/proyectos/[id]'>) {
  const { id } = await props.params
  const sobre = await cargarProyecto(id)

  if (sobre instanceof ErrorApi) {
    return <EstadoDeError error={sobre} volverA="/portal/proyectos" etiqueta="Proyectos" />
  }

  const proyecto = sobre.data
  // Las pestañas salen de lo que dijo la API, nunca de una lista fija: cada proyecto comparte cosas
  // distintas, y adivinar significaria dibujar pestañas que responden 403 al abrirlas.
  const pestanias = pestaniasDelProyecto(proyecto.tabs ?? [])
  const pendientes = await cargarPendientes(proyecto)

  const paneles: Panel[] = pestanias.map(({ clave, etiqueta }) => ({
    clave,
    etiqueta,
    contenido: contenidoDePestania(clave, proyecto)
  }))

  return (
    <div className="flex flex-col gap-4">
      <Volver href="/portal/proyectos">Proyectos</Volver>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-texto text-xl font-semibold">{proyecto.name}</h1>
          <EstadoDelPortal catalogo="project_statuses" valor={proyecto.status} />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <BarraProgreso porcentaje={proyecto.progress} className="max-w-xs" />
          <span className="text-texto-tenue text-sm tabular-nums">{proyecto.progress}%</span>
          {proyecto.deadline !== null && (
            <span className="text-texto-tenue text-sm">Entrega: {formatearFecha(proyecto.deadline)}</span>
          )}
        </div>

        {/* La descripcion vive en el encabezado y no en el panel Resumen: un proyecto que no comparte
            la pestaña de resumen igual tiene derecho a contar de que se trata. */}
        {proyecto.description !== null && proyecto.description !== '' && (
          <p className="text-texto-tenue max-w-prose text-sm whitespace-pre-line">{proyecto.description}</p>
        )}
      </header>

      {pendientes.length > 0 && (
        <AprobacionesPendientes proyectoId={proyecto.id} tareas={pendientes} />
      )}

      {paneles.length > 0 ? <Pestanas paneles={paneles} /> : <PanelResumen proyecto={proyecto} />}
    </div>
  )
}

/** Que dibuja cada pestaña. */
function contenidoDePestania (clave: string, proyecto: EspacioPortal): React.ReactNode {
  switch (clave) {
    case 'tasks':
      return <PanelTareas proyectoId={proyecto.id} />
    case 'milestones':
      return <PanelHitos proyectoId={proyecto.id} />
    case 'files':
      return <PanelArchivos proyectoId={proyecto.id} />
    case 'tickets':
      return <PanelTicketsDelProyecto proyectoId={proyecto.id} />
    case 'discussions':
      return <PanelDiscusiones proyectoId={proyecto.id} />
    case 'timesheets':
      return <PanelTiempos proyectoId={proyecto.id} />
    case 'gantt':
      return <PanelGantt proyectoId={proyecto.id} />
    case 'activity':
      return <PanelActividadPortal proyectoId={proyecto.id} />
    default:
      return <PanelResumen proyecto={proyecto} />
  }
}

/**
 * Las tareas de este proyecto que esperan el visto bueno del contacto.
 *
 * Se pide solo si el proyecto comparte la pestaña de tareas: sin ella la API responde 403, y un error
 * por un bloque que probablemente este vacio no puede tumbar la pantalla entera. Cualquier fallo
 * —incluido el 404 del guard de tabla, cuando `wiwo_core` no esta instalado— devuelve lista vacia y
 * el bloque no se dibuja.
 *
 * El filtro `aprobacion` es del backend: filtrar en el cliente traeria las cien tareas del proyecto
 * para mostrar dos.
 */
async function cargarPendientes (proyecto: EspacioPortal): Promise<TareaPortal[]> {
  if (!(proyecto.tabs ?? []).includes('tasks')) return []

  const sobre = await cargarDetalle<TareaPortal[]>(
    `/portal/projects/${proyecto.id}/tasks?filter[aprobacion]=pendiente&per_page=50`
  )

  return sobre instanceof ErrorApi ? [] : sobre.data
}
