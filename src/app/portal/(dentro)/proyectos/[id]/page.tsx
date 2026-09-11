import type { Metadata } from 'next'
import { cache } from 'react'
import { Pestanas, type Panel } from '@/componentes/proyecto/Pestanas'
import { ErrorApi } from '@/datos/errores'
import type { EspacioPortal, TareaPortal } from '@/datos/portal'
import { pestaniasDelProyecto } from '@/definiciones/portal-proyectos'
import { CabeceraProyecto } from '@/componentes/proyecto/CabeceraProyecto'
import { aTextoPlano } from '@/componentes/proyecto/formatos'
import { cargarLookupsDelPortal, listaDe } from '@/datos/lookups'
import { pedirPortal } from '@/datos/servidor'
import type { EmpresaPortal } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { proyectoDelPortal } from '@/dominio/proyecto'
import { cargarDetalle, EstadoDeError, estadoDelPortal } from '../../detalle'
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
  // La empresa es la del propio contacto y la cabecera la pinta como subtitulo, igual que el panel
  // pinta el cliente del Espacio.
  const { data: empresa } = await pedirPortal<EmpresaPortal>('/portal/company')
  // La API devuelve la descripcion como HTML del panel viejo: sin despojarla, el cliente lee los
  // `<p>` en pantalla. Es el mismo tratamiento que le da el panel a la descripcion de una tarea.
  const descripcion = aTextoPlano(proyecto.description ?? '')
  // Las pestañas salen de lo que dijo la API, nunca de una lista fija: cada proyecto comparte cosas
  // distintas, y adivinar significaria dibujar pestañas que responden 403 al abrirlas.
  const pestanias = pestaniasDelProyecto(proyecto.tabs ?? [])
  // La descripcion la lleva la pestaña Descripcion, como en el panel. Se dibuja suelta solo cuando
  // esa pestaña no esta compartida: un proyecto que no la comparte igual tiene derecho a contar de
  // que se trata, y ahi es el unico lugar donde cabe.
  const descripcionSuelta = !pestanias.some((p) => p.clave === 'overview')
  const pendientes = await cargarPendientes(proyecto)

  const paneles: Panel[] = pestanias.map(({ clave, etiqueta }) => ({
    clave,
    etiqueta,
    contenido: contenidoDePestania(clave, proyecto)
  }))

  return (
    <div className="flex flex-col gap-4">
      {/* La MISMA cabecera que ve un colaborador: el componente, no una copia con las mismas
          clases. Lo que cambia es lo que se le pasa —una `ProyectoVista` armada desde el contrato
          del portal, sin capacidades y sin botonera—, no el dibujo. */}
      <CabeceraProyecto
        proyecto={proyectoDelPortal(proyecto, empresa)}
        estado={await estadoDelPortal('project_statuses', proyecto.status)}
        volverA={{ href: '/portal/proyectos', etiqueta: GLOSARIO.espacio.plural }}
      />

      {/* La descripcion vive en la pestaña Descripcion, como en el panel. Suelta acá solo cuando esa
          pestaña no esta compartida: es el unico caso en que si no, no se leeria en ningun lado. */}
      {descripcionSuelta && descripcion !== '' && (
        <p className="text-texto-tenue max-w-prose text-sm whitespace-pre-line">{descripcion}</p>
      )}

      {pendientes.length > 0 && (
        <AprobacionesPendientes
          proyectoId={proyecto.id}
          tareas={pendientes}
          // El catalogo se pide aca y no dentro del panel: `cargarLookupsDelPortal` es `server-only`
          // y el panel es cliente. `cache()` lo comparte con la pestaña de Tareas, asi que la pagina
          // no pide `/portal/lookups` dos veces por pintar la insignia.
          estados={listaDe(await cargarLookupsDelPortal(), 'task_statuses')}
        />
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
