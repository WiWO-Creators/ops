import Link from 'next/link'
import { Suspense, cache } from 'react'
import { AccionesLicitacion } from '@/componentes/licitacion/AccionesLicitacion'
import { FichaLicitacion } from '@/componentes/licitacion/FichaLicitacion'
import { CabeceraProyecto } from '@/componentes/proyecto/CabeceraProyecto'
import { PanelActividad } from '@/componentes/proyecto/PanelActividad'
import { PanelArchivos } from '@/componentes/proyecto/PanelArchivos'
import { PanelDescripcion } from '@/componentes/proyecto/PanelDescripcion'
import { PanelDiscusiones } from '@/componentes/proyecto/PanelDiscusiones'
import { PanelHitos } from '@/componentes/proyecto/PanelHitos'
import { PanelTareas } from '@/componentes/proyecto/PanelTareas'
import { PanelTiempos } from '@/componentes/proyecto/PanelTiempos'
import { Pestanas, type Panel } from '@/componentes/proyecto/Pestanas'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import { Cargando, ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { listaDe, nombreDe } from '@/datos/catalogos'
import { ErrorApi } from '@/datos/errores'
import { cargarLookups } from '@/datos/lookups'
import { pedir } from '@/datos/servidor'
import type { EstadoLookup, LicitacionDetalle, Lookups } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'

/**
 * Pide la Licitacion una sola vez por peticion.
 *
 * `generateMetadata` y la pagina corren en la misma peticion y necesitan el mismo recurso; sin
 * `cache` serian dos llamadas a la API por cada visita.
 */
const traerLicitacion = cache(async (id: string) => {
  return await pedir<LicitacionDetalle>(`/licitaciones/${id}`)
})

/**
 * Titulo de la pestaña del navegador.
 *
 * Un `ErrorApi` no puede tumbar la metadata: la pagina ya muestra el estado que corresponda. Todo lo
 * demas se relanza — `pedir` señaliza la sesion vencida con el `redirect` de Next, que viaja como
 * excepcion y tragarlo dejaria a la persona mirando una pantalla en blanco.
 */
export async function generateMetadata (props: PageProps<'/licitaciones/[id]'>) {
  const { id } = await props.params

  try {
    const { data } = await traerLicitacion(id)

    return { title: `${data.company} · WiWO Ops` }
  } catch (error) {
    if (!(error instanceof ErrorApi)) throw error

    return { title: `${GLOSARIO.licitacion.singular} · WiWO Ops` }
  }
}

interface Detalle {
  licitacion: LicitacionDetalle
  lookups: Lookups
  yo: Yo
}

/**
 * Carga lo minimo que la pantalla necesita para pintarse: la licitacion, los catalogos y quien mira.
 *
 * **Los datos de cada pestaña NO se piden aca.** Cada panel es un componente cliente que pide lo suyo
 * al montarse, y `Pestanas` monta solo la activa: la pestaña que nadie abre no cuesta ninguna
 * peticion. Es el mismo reparto que en el detalle de un Espacio.
 *
 * @param id id de la licitacion tal como viene de la ruta
 * @returns el detalle, o el `ErrorApi` que impidio cargarlo
 */
async function cargarDetalle (id: string): Promise<Detalle | ErrorApi> {
  try {
    const [licitacion, lookups, yo] = await Promise.all([
      traerLicitacion(id),
      cargarLookups(),
      pedir<Yo>('/me')
    ])

    return { licitacion: licitacion.data, lookups, yo: yo.data }
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/** Estado de licitacion inexistente: la API respondio 404 o el id de la URL no es de nadie. */
function NoEncontrada () {
  return (
    <Vacio
      titulo={`Esa ${GLOSARIO.licitacion.singular.toLowerCase()} no existe`}
      descripcion="Puede que la hayan borrado, o que el enlace esté mal escrito."
      accion={
        <Link href="/licitaciones" className="text-acento text-sm font-semibold underline underline-offset-4">
          Volver a {GLOSARIO.licitacion.plural}
        </Link>
      }
    />
  )
}

/**
 * Detalle de una Licitacion.
 *
 * Las pestañas de trabajo son **las mismas** del detalle de un Espacio, montadas con
 * `licitacion.espacio.id` en lugar de `proyecto.id`: una licitacion es un Espacio con una empresa
 * candidata colgada, y sus tareas, hitos, tiempos y archivos ya viven en los endpoints de Espacio. No
 * hay envoltorios ni paneles propios; es el mismo patron de `PanelesCliente.tsx`.
 *
 * Ganada o perdida, las pestañas siguen ahi: el trabajo que se hizo no desaparece porque se haya
 * resuelto la licitacion. Lo que cambia son las acciones de la cabecera.
 *
 * El `Suspense` no es decorativo: `Pestanas` usa `useSearchParams`, y sin ese limite el build de la
 * ruta falla.
 */
export default async function LicitacionPage (props: PageProps<'/licitaciones/[id]'>) {
  const { id } = await props.params
  const detalle = await cargarDetalle(id)

  if (detalle instanceof ErrorApi) {
    if (detalle.codigo === 'not_found') return <NoEncontrada />
    if (detalle.codigo === 'forbidden') return <SinPermiso />

    return <ErrorEstado detalle={detalle.message} />
  }

  const { licitacion, lookups, yo } = detalle
  const espacio = licitacion.espacio
  const capacidadesProyecto = yo.permissions.projects
  const capacidadesTareas = yo.permissions.tasks
  const paises = listaDe(lookups, 'countries')

  const paneles: Panel[] = [
    {
      clave: 'ficha',
      etiqueta: 'Ficha',
      contenido: (
        <div className="flex flex-col gap-6">
          <FichaLicitacion licitacion={licitacion} paises={paises} />
          <PanelDescripcion
            proyecto={espacio}
            estado={estadoDelEspacio(lookups, espacio.status)}
            tipoFacturacion={nombreDe(listaDe(lookups, 'billing_types'), espacio.billing_type)}
            puedeVerMontos={capacidadesProyecto.includes('edit')}
          />
        </div>
      )
    },
    {
      clave: 'tareas',
      etiqueta: GLOSARIO.proceso.plural,
      // Sin IA: el chat de proyecto es del detalle de Espacio, y aca todavia no hay proyecto ganado.
      contenido: <PanelTareas proyectoId={espacio.id} capacidades={capacidadesTareas} conIa={false} />
    },
    {
      clave: 'hitos',
      etiqueta: GLOSARIO.hito.plural,
      contenido: (
        <PanelHitos
          proyecto={espacio}
          capacidades={capacidadesProyecto}
          capacidadesTareas={capacidadesTareas}
        />
      )
    },
    {
      clave: 'tiempos',
      etiqueta: 'Tiempos',
      contenido: <PanelTiempos proyectoId={espacio.id} capacidades={capacidadesTareas} />
    },
    { clave: 'archivos', etiqueta: 'Archivos', contenido: <PanelArchivos proyectoId={espacio.id} /> },
    {
      clave: 'discusiones',
      etiqueta: 'Discusiones',
      contenido: <PanelDiscusiones proyectoId={espacio.id} capacidades={capacidadesProyecto} />
    },
    {
      clave: 'actividad',
      etiqueta: 'Actividad',
      contenido: <PanelActividad proyectoId={espacio.id} capacidades={capacidadesProyecto} />
    }
  ]

  return (
    <section className="flex flex-col gap-4">
      <CabeceraProyecto
        proyecto={espacio}
        estado={estadoDelEspacio(lookups, espacio.status)}
        estados={listaDe(lookups, 'project_statuses')}
        capacidadesProyecto={capacidadesProyecto}
        capacidadesTareas={capacidadesTareas}
        volverA={{ href: '/licitaciones', etiqueta: GLOSARIO.licitacion.plural }}
        subtitulo={licitacion.company}
        acciones={
          <AccionesLicitacion
            licitacion={licitacion}
            paises={comoOpciones(paises)}
            capacidades={capacidadesProyecto}
          />
        }
      />

      <Suspense fallback={<Cargando alto="min-h-36" mensaje="Cargando el detalle…" />}>
        <Pestanas paneles={paneles} etiqueta={`Secciones de la ${GLOSARIO.licitacion.singular.toLowerCase()}`} />
      </Suspense>
    </section>
  )
}

/**
 * Resuelve el estado del Espacio contra `project_statuses`.
 *
 * @param lookups catalogos ya cargados
 * @param status id del estado que trae el Espacio
 * @returns nombre legible y color; un id que el catalogo no conoce se muestra como `#id` sin color
 */
function estadoDelEspacio (lookups: Lookups, status: number): { nombre: string, color: string | null } {
  const encontrado = listaDe(lookups, 'project_statuses').find((item) => item.id === status)

  return { nombre: encontrado?.name ?? `#${status}`, color: encontrado?.color ?? null }
}

/** Un catalogo de `/lookups` en la forma que espera un campo `seleccion` del formulario. */
function comoOpciones (lista: EstadoLookup[]): OpcionCampo[] {
  return lista.map((item) => ({ valor: String(item.id), etiqueta: item.name }))
}
