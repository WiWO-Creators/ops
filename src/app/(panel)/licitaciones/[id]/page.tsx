import Link from 'next/link'
import { cache } from 'react'
import { AccionesLicitacion } from '@/componentes/licitacion/AccionesLicitacion'
import { FichaLicitacion } from '@/componentes/licitacion/FichaLicitacion'
import { DetalleDeEspacio } from '@/componentes/proyecto/DetalleDeEspacio'
import { ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { ErrorApi } from '@/datos/errores'
import { cargarLookups } from '@/datos/lookups'
import { pedir } from '@/datos/servidor'
import type { LicitacionDetalle, Lookups } from '@/datos/recursos'
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
        <Link href="/prospectos" className="text-acento text-sm font-semibold underline underline-offset-4">
          Volver a Prospectos
        </Link>
      }
    />
  )
}

/**
 * Detalle de una Licitacion.
 *
 * Las pestañas de trabajo son **las mismas** del detalle de un Espacio: las monta `DetalleDeEspacio`
 * con `licitacion.espacio`, el mismo componente que usa Upselling. Aca solo se decide que va en la
 * pestaña Ficha y que botones tiene la cabecera.
 *
 * Ganada o perdida, las pestañas siguen ahi: el trabajo que se hizo no desaparece porque se haya
 * resuelto la licitacion. Lo que cambia son las acciones de la cabecera.
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

  return (
    <DetalleDeEspacio
      espacio={licitacion.espacio}
      lookups={lookups}
      capacidadesProyecto={yo.permissions.projects}
      capacidadesTareas={yo.permissions.tasks}
      volverA={{ href: `/prospectos/${licitacion.prospecto_id}?tab=licitaciones`, etiqueta: licitacion.company }}
      subtitulo={licitacion.company}
      acciones={
        <AccionesLicitacion licitacion={licitacion} capacidades={yo.permissions.projects} />
      }
      ficha={<FichaLicitacion licitacion={licitacion} />}
      etiquetaPestanas={`Secciones de la ${GLOSARIO.licitacion.singular.toLowerCase()}`}
    />
  )
}
