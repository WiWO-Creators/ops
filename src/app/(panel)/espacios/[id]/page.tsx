import Link from 'next/link'
import { Suspense, cache } from 'react'
import { CabeceraProyecto } from '@/componentes/proyecto/CabeceraProyecto'
import { PanelActividad } from '@/componentes/proyecto/PanelActividad'
import { PanelConfiguracionEspacio } from '@/componentes/proyecto/PanelConfiguracionEspacio'
import { PanelArchivos } from '@/componentes/proyecto/PanelArchivos'
import { PanelDescripcion } from '@/componentes/proyecto/PanelDescripcion'
import { PanelDiscusiones } from '@/componentes/proyecto/PanelDiscusiones'
import { PanelGantt } from '@/componentes/proyecto/PanelGantt'
import { PanelHitos } from '@/componentes/proyecto/PanelHitos'
import { PanelNotas } from '@/componentes/proyecto/PanelNotas'
import { PanelTareas } from '@/componentes/proyecto/PanelTareas'
import { PanelTiempos } from '@/componentes/proyecto/PanelTiempos'
import { Pestanas, type Panel } from '@/componentes/proyecto/Pestanas'
import { Cargando, ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { listaDe, nombreDe } from '@/datos/catalogos'
import { ErrorApi } from '@/datos/errores'
import { cargarLookups } from '@/datos/lookups'
import { pedir } from '@/datos/servidor'
import type { Espacio, Lookups } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'

/**
 * Pide el Proyecto una sola vez por peticion.
 *
 * `generateMetadata` y la pagina corren en la misma peticion y necesitan el mismo recurso; sin
 * `cache` serian dos llamadas a la API por cada visita.
 */
const traerProyecto = cache(async (id: string) => {
  return await pedir<Espacio>(`/projects/${id}?include=custom_fields,members`)
})

/**
 * Titulo de la pestaña del navegador.
 *
 * Un `ErrorApi` no puede tumbar la metadata: la pagina ya muestra el estado que corresponda. Todo lo
 * demas se relanza — `pedir` señaliza la sesion vencida con el `redirect` de Next, que viaja como
 * excepcion y tragarlo dejaria a la persona mirando una pantalla en blanco.
 */
export async function generateMetadata (props: PageProps<'/espacios/[id]'>) {
  const { id } = await props.params

  try {
    const { data } = await traerProyecto(id)

    return { title: `${data.name} · WiWO Ops` }
  } catch (error) {
    if (!(error instanceof ErrorApi)) throw error

    return { title: `${GLOSARIO.espacio.singular} · WiWO Ops` }
  }
}

interface Detalle {
  proyecto: Espacio
  lookups: Lookups
  yo: Yo
}

/**
 * Carga lo minimo que la pantalla necesita para pintarse: el proyecto, los catalogos y quien mira.
 *
 * **Los datos de cada pestaña NO se piden aca.** Son diez pestañas, y bajarlas todas del servidor
 * costaria diez viajes a la API por visita para mostrar una. Cada panel es un componente cliente que
 * pide lo suyo al montarse, y `Pestanas` monta solo la activa: la pestaña que nadie abre no cuesta
 * ninguna peticion.
 *
 * @param id id del proyecto tal como viene de la ruta
 * @returns el detalle, o el `ErrorApi` que impidio cargarlo
 */
async function cargarDetalle (id: string): Promise<Detalle | ErrorApi> {
  try {
    const [proyecto, lookups, yo] = await Promise.all([
      traerProyecto(id),
      cargarLookups(),
      pedir<Yo>('/me')
    ])

    return { proyecto: proyecto.data, lookups, yo: yo.data }
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/**
 * Resuelve el estado del proyecto contra `project_statuses`.
 *
 * @param lookups catalogos ya cargados
 * @param status id del estado que trae el proyecto
 * @returns nombre legible y color; un id que el catalogo no conoce se muestra como `#id` sin color
 */
function estadoDelProyecto (lookups: Lookups, status: number): { nombre: string, color: string | null } {
  const encontrado = listaDe(lookups, 'project_statuses').find((item) => item.id === status)

  return { nombre: encontrado?.name ?? `#${status}`, color: encontrado?.color ?? null }
}

/** Estado de proyecto inexistente: la API respondio 404 o el id de la URL no es de nadie. */
function NoEncontrado () {
  return (
    <Vacio
      titulo={`Ese ${GLOSARIO.espacio.singular.toLowerCase()} no existe`}
      descripcion="Puede que lo hayan borrado, o que el enlace esté mal escrito."
      accion={
        <Link href="/espacios" className="text-acento text-sm font-semibold underline underline-offset-4">
          Volver a {GLOSARIO.espacio.plural}
        </Link>
      }
    />
  )
}

/**
 * Detalle de un Proyecto, con sus diez pestañas.
 *
 * El `Suspense` no es decorativo: `Pestanas` usa `useSearchParams`, y sin ese limite el build de la
 * ruta falla.
 */
export default async function ProyectoPage (props: PageProps<'/espacios/[id]'>) {
  const { id } = await props.params
  const detalle = await cargarDetalle(id)

  if (detalle instanceof ErrorApi) {
    if (detalle.codigo === 'not_found') return <NoEncontrado />
    if (detalle.codigo === 'forbidden') return <SinPermiso />

    return <ErrorEstado detalle={detalle.message} />
  }

  const { proyecto, lookups, yo } = detalle
  const capacidadesProyecto = yo.permissions.projects
  const capacidadesTareas = yo.permissions.tasks
  const estados = listaDe(lookups, 'project_statuses')
  // La primera de las tres capas del patron de `administracion/acceso`: si no corresponde, la pestaña
  // ni se agrega. La segunda es el propio panel, que devuelve `SinPermiso`; la tercera —la unica que
  // de verdad protege— es el 403 de `GET|PUT /projects/{id}/task-types`.
  const puedeConfigurar =
    yo.id === proyecto.added_from || yo.is_admin || yo.is_superadmin || yo.is_director

  const paneles: Panel[] = [
    {
      clave: 'descripcion',
      etiqueta: 'Descripción',
      contenido: (
        <PanelDescripcion
          proyecto={proyecto}
          estado={estadoDelProyecto(lookups, proyecto.status)}
          tipoFacturacion={nombreDe(listaDe(lookups, 'billing_types'), proyecto.billing_type)}
          puedeVerMontos={capacidadesProyecto.includes('edit')}
        />
      )
    },
    {
      clave: 'tareas',
      etiqueta: GLOSARIO.proceso.plural,
      contenido: <PanelTareas proyectoId={proyecto.id} capacidades={capacidadesTareas} />
    },
    {
      clave: 'tiempos',
      etiqueta: 'Tiempos',
      contenido: <PanelTiempos proyectoId={proyecto.id} capacidades={capacidadesTareas} />
    },
    {
      clave: 'hitos',
      etiqueta: GLOSARIO.hito.plural,
      contenido: <PanelHitos proyecto={proyecto} capacidades={capacidadesProyecto} />
    },
    { clave: 'archivos', etiqueta: 'Archivos', contenido: <PanelArchivos proyectoId={proyecto.id} /> },
    {
      clave: 'discusiones',
      etiqueta: 'Discusiones',
      contenido: <PanelDiscusiones proyectoId={proyecto.id} capacidades={capacidadesProyecto} />
    },
    { clave: 'gantt', etiqueta: 'Diagrama de Gantt', contenido: <PanelGantt proyectoId={proyecto.id} /> },
    { clave: 'notas', etiqueta: 'Meeting Paper', contenido: <PanelNotas proyectoId={proyecto.id} /> },
    {
      clave: 'actividad',
      etiqueta: 'Actividad',
      contenido: <PanelActividad proyectoId={proyecto.id} capacidades={capacidadesProyecto} />
    },
    ...(puedeConfigurar
      ? [{
          clave: 'configuracion',
          etiqueta: 'Configuración',
          contenido: <PanelConfiguracionEspacio proyectoId={proyecto.id} puedeConfigurar />
        }]
      : [])
  ]

  return (
    <section className="flex flex-col gap-4">
      <CabeceraProyecto
        proyecto={proyecto}
        estado={estadoDelProyecto(lookups, proyecto.status)}
        estados={estados}
        capacidadesProyecto={capacidadesProyecto}
        capacidadesTareas={capacidadesTareas}
      />

      <Suspense fallback={<Cargando alto="min-h-36" mensaje="Cargando el detalle…" />}>
        <Pestanas paneles={paneles} />
      </Suspense>
    </section>
  )
}
