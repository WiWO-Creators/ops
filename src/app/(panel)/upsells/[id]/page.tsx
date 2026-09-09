import Link from 'next/link'
import { cache } from 'react'
import { AccionesUpsell } from '@/componentes/upsell/AccionesUpsell'
import { FichaUpsell } from '@/componentes/upsell/FichaUpsell'
import { DetalleDeEspacio } from '@/componentes/proyecto/DetalleDeEspacio'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import { ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { listaDe } from '@/datos/catalogos'
import { ErrorApi } from '@/datos/errores'
import { cargarLookups } from '@/datos/lookups'
import { pedir } from '@/datos/servidor'
import type { EstadoLookup, Lookups, UpsellDetalle } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'

/**
 * Pide el Upsell una sola vez por peticion.
 *
 * `generateMetadata` y la pagina corren en la misma peticion y necesitan el mismo recurso; sin
 * `cache` serian dos llamadas a la API por cada visita.
 */
const traerUpsell = cache(async (id: string) => {
  return await pedir<UpsellDetalle>(`/upsells/${id}`)
})

/**
 * Titulo de la pestaña del navegador.
 *
 * Un `ErrorApi` no puede tumbar la metadata: la pagina ya muestra el estado que corresponda. Todo lo
 * demas se relanza — `pedir` señaliza la sesion vencida con el `redirect` de Next, que viaja como
 * excepcion y tragarlo dejaria a la persona mirando una pantalla en blanco.
 */
export async function generateMetadata (props: PageProps<'/upsells/[id]'>) {
  const { id } = await props.params

  try {
    const { data } = await traerUpsell(id)

    return { title: `${data.espacio.name} · WiWO Ops` }
  } catch (error) {
    if (!(error instanceof ErrorApi)) throw error

    return { title: `${GLOSARIO.upsell.singular} · WiWO Ops` }
  }
}

interface Detalle {
  upsell: UpsellDetalle
  lookups: Lookups
  yo: Yo
}

/**
 * Carga lo minimo que la pantalla necesita: la oportunidad, los catalogos y quien mira.
 *
 * **Los datos de cada pestaña NO se piden aca.** Cada panel es un componente cliente que pide lo
 * suyo al montarse, y `Pestanas` monta solo la activa: la pestaña que nadie abre no cuesta ninguna
 * peticion. Es el mismo reparto que en el detalle de un Espacio.
 *
 * @param id id del upsell tal como viene de la ruta
 * @returns el detalle, o el `ErrorApi` que impidio cargarlo
 */
async function cargarDetalle (id: string): Promise<Detalle | ErrorApi> {
  try {
    const [upsell, lookups, yo] = await Promise.all([
      traerUpsell(id),
      cargarLookups(),
      pedir<Yo>('/me')
    ])

    return { upsell: upsell.data, lookups, yo: yo.data }
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/** Estado de oportunidad inexistente: la API respondio 404 o el id de la URL no es de nadie. */
function NoEncontrada () {
  return (
    <Vacio
      titulo="Esa oportunidad no existe"
      descripcion="Puede que la hayan borrado, o que el enlace esté mal escrito."
      accion={
        <Link href="/upsells" className="text-acento text-sm font-semibold underline underline-offset-4">
          Volver a {GLOSARIO.upsell.plural}
        </Link>
      }
    />
  )
}

/**
 * Detalle de una oportunidad de Upselling.
 *
 * Las pestañas de trabajo son **las mismas** del detalle de un Espacio: las monta `DetalleDeEspacio`
 * con `upsell.espacio`, el mismo componente que usa Licitaciones. Acá solo se decide que va en la
 * pestaña Ficha y que botones tiene la cabecera.
 *
 * Ganada o perdida, las pestañas siguen ahi: el trabajo que se hizo no desaparece porque se haya
 * resuelto la oportunidad. Lo que cambia son las acciones de la cabecera.
 */
export default async function UpsellPage (props: PageProps<'/upsells/[id]'>) {
  const { id } = await props.params
  const detalle = await cargarDetalle(id)

  if (detalle instanceof ErrorApi) {
    if (detalle.codigo === 'not_found') return <NoEncontrada />
    if (detalle.codigo === 'forbidden') return <SinPermiso />

    return <ErrorEstado detalle={detalle.message} />
  }

  const { upsell, lookups, yo } = detalle
  const monedas = listaDe(lookups, 'currencies')

  return (
    <DetalleDeEspacio
      espacio={upsell.espacio}
      lookups={lookups}
      capacidadesProyecto={yo.permissions.projects}
      capacidadesTareas={yo.permissions.tasks}
      volverA={{ href: '/upsells', etiqueta: GLOSARIO.upsell.plural }}
      subtitulo={upsell.client?.company}
      acciones={
        <AccionesUpsell
          upsell={upsell}
          monedas={comoOpciones(monedas)}
          capacidades={yo.permissions.projects}
        />
      }
      ficha={<FichaUpsell upsell={upsell} monedas={monedas} />}
      etiquetaPestanas="Secciones de la oportunidad"
    />
  )
}

/** Un catalogo de `/lookups` en la forma que espera un campo `seleccion` del formulario. */
function comoOpciones (lista: EstadoLookup[]): OpcionCampo[] {
  return lista.map((item) => ({ valor: String(item.id), etiqueta: item.name }))
}
