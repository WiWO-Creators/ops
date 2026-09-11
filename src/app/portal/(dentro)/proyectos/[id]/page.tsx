import type { Metadata } from 'next'
import { cache } from 'react'
import { Pestanas, type Panel } from '@/componentes/proyecto/Pestanas'
import { ErrorApi } from '@/datos/errores'
import type { EspacioPortal, TareaPortal } from '@/datos/portal'
import { pestaniasDelProyecto } from '@/definiciones/portal-proyectos'
import Link from 'next/link'
import { BarraProgreso } from '@/componentes/proyecto/CabeceraProyecto'
import { aTextoPlano } from '@/componentes/proyecto/formatos'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { GrupoAvatares } from '@/componentes/presentadores/Avatar'
import { GLOSARIO } from '@/dominio/glosario'
import { cargarDetalle, EstadoDeError, EstadoDelPortal } from '../../detalle'
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
  // La API devuelve la descripcion como HTML del panel viejo: sin despojarla, el cliente lee los
  // `<p>` en pantalla. Es el mismo tratamiento que le da el panel a la descripcion de una tarea.
  const descripcion = aTextoPlano(proyecto.description ?? '')
  // Las pestañas salen de lo que dijo la API, nunca de una lista fija: cada proyecto comparte cosas
  // distintas, y adivinar significaria dibujar pestañas que responden 403 al abrirlas.
  const pestanias = pestaniasDelProyecto(proyecto.tabs ?? [])
  // La descripcion la lleva la pestaña Descripcion, como en el panel. Se queda en la cabecera solo
  // cuando esa pestaña no esta compartida: un proyecto que no la comparte igual tiene derecho a
  // contar de que se trata, y ahi es el unico lugar donde cabe.
  const descripcionEnLaCabecera = !pestanias.some((p) => p.clave === 'overview')
  const pendientes = await cargarPendientes(proyecto)

  const paneles: Panel[] = pestanias.map(({ clave, etiqueta }) => ({
    clave,
    etiqueta,
    contenido: contenidoDePestania(clave, proyecto)
  }))

  return (
    <div className="flex flex-col gap-4">
      {/* La cabecera es la misma tarjeta que ve un colaborador en el panel: mismo envoltorio, mismo
          orden y los mismos presentadores —`Fecha`, `GrupoAvatares`, `BarraProgreso` y la pildora de
          estado—. Lo que falta respecto del panel es lo que el portal no recibe o no deja tocar:
          imagen, etiquetas, patente y las acciones sobre el proyecto. No es una diferencia de
          estilo. */}
      <header className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col gap-4 border p-5">
        <Link
          href="/portal/proyectos"
          className="text-texto-tenue hover:text-texto w-fit text-xs font-medium transition-colors"
        >
          ← {GLOSARIO.espacio.plural}
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-texto text-titulo min-w-0 font-semibold">{proyecto.name}</h1>
          <EstadoDelPortal catalogo="project_statuses" valor={proyecto.status} />
        </div>

        <dl className="flex flex-wrap items-start gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <dt className="text-texto-sutil">Inicio</dt>
            <dd className="text-texto"><Fecha valor={proyecto.start_date} /></dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-texto-sutil">Entrega</dt>
            <dd><Fecha valor={proyecto.deadline} comoVencimiento /></dd>
          </div>
          {/* El equipo solo llega con `view_team_members`; sin el permiso la fila no se dibuja. */}
          {proyecto.members !== undefined && (
            <div className="flex min-w-0 max-w-full items-center gap-2">
              <dt className="text-texto-sutil">Equipo</dt>
              <dd className="min-w-0"><GrupoAvatares personas={proyecto.members} maximo={5} /></dd>
            </div>
          )}
        </dl>

        {descripcionEnLaCabecera && descripcion !== '' && (
          <p className="text-texto-tenue max-w-prose text-sm whitespace-pre-line">{descripcion}</p>
        )}

        <div className="flex items-center gap-3">
          <BarraProgreso porcentaje={proyecto.progress} className="min-w-0 flex-1" />
          <span data-numerico className="text-texto text-sm font-semibold">
            {Math.round(proyecto.progress)}%
          </span>
        </div>
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
