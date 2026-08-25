import Link from 'next/link'
import { Suspense, cache } from 'react'
import { CabeceraProyecto } from '@/componentes/proyecto/CabeceraProyecto'
import { ListaArchivos } from '@/componentes/proyecto/ListaArchivos'
import { ListaHitos } from '@/componentes/proyecto/ListaHitos'
import { ListaMiembros } from '@/componentes/proyecto/ListaMiembros'
import { PanelTareas } from '@/componentes/proyecto/PanelTareas'
import { Pestanas, type Panel } from '@/componentes/proyecto/Pestanas'
import { ResumenProyecto } from '@/componentes/proyecto/ResumenProyecto'
import { Cargando, ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { ErrorApi } from '@/datos/errores'
import { cargarLookups, listaDe } from '@/datos/lookups'
import { pedir } from '@/datos/servidor'
import type { ArchivoProyecto, Espacio, Hito, Lookups, MiembroEquipo } from '@/datos/recursos'
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
  hitos: Hito[]
  miembros: MiembroEquipo[]
  archivos: ArchivoProyecto[]
  lookups: Lookups
  yo: Yo
}

/**
 * Carga todo lo que la pantalla necesita, en paralelo.
 *
 * Los cinco recursos se piden juntos porque ninguno depende del otro: encadenarlos sumaria los cinco
 * viajes a la API en vez de pagar el mas lento.
 *
 * @param id id del proyecto tal como viene de la ruta
 * @returns el detalle completo, o el `ErrorApi` que impidio cargarlo
 */
async function cargarDetalle (id: string): Promise<Detalle | ErrorApi> {
  try {
    const [proyecto, hitos, miembros, archivos, lookups, yo] = await Promise.all([
      traerProyecto(id),
      pedir<Hito[]>(`/projects/${id}/milestones`),
      pedir<MiembroEquipo[]>(`/projects/${id}/members`),
      pedir<ArchivoProyecto[]>(`/projects/${id}/files`),
      cargarLookups(),
      pedir<Yo>('/me')
    ])

    return {
      proyecto: proyecto.data,
      hitos: hitos.data,
      miembros: miembros.data,
      archivos: archivos.data,
      lookups,
      yo: yo.data
    }
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
 * Detalle de un Proyecto.
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

  const { proyecto, hitos, miembros, archivos, lookups, yo } = detalle

  const paneles: Panel[] = [
    {
      clave: 'tareas',
      etiqueta: GLOSARIO.proceso.plural,
      contenido: <PanelTareas proyectoId={proyecto.id} capacidades={yo.permissions.tasks} />
    },
    { clave: 'hitos', etiqueta: GLOSARIO.hito.plural, contenido: <ListaHitos hitos={hitos} /> },
    { clave: 'miembros', etiqueta: 'Equipo', contenido: <ListaMiembros miembros={miembros} /> },
    {
      clave: 'archivos',
      etiqueta: 'Archivos',
      contenido: <ListaArchivos archivos={archivos} miembros={miembros} />
    }
  ]

  return (
    <section className="flex flex-col gap-4">
      <CabeceraProyecto proyecto={proyecto} estado={estadoDelProyecto(lookups, proyecto.status)} />
      <ResumenProyecto proyecto={proyecto} />

      <Suspense fallback={<Cargando />}>
        <Pestanas paneles={paneles} />
      </Suspense>
    </section>
  )
}
