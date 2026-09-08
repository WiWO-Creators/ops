import { Suspense } from 'react'
import { Cargando } from '@/componentes/estado/Estados'
import { TotalDelListado } from '@/componentes/datos/TotalDelListado'
import { VistaLicitaciones } from '@/componentes/licitacion/VistaLicitaciones'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { listaDe } from '@/datos/catalogos'
import { cargarLookups, opcionesDeFiltros } from '@/datos/lookups'
import { pedir } from '@/datos/servidor'
import type { EstadoLookup, Licitacion } from '@/datos/recursos'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import type { Yo } from '@/datos/tipos'
import { LICITACIONES } from '@/definiciones/licitaciones'

export const metadata = { title: 'Licitaciones · WiWO Ops' }

/**
 * Lista de Licitaciones.
 *
 * La primera pagina se resuelve en el servidor para que la lista no parpadee al montar; de ahi en
 * adelante el motor pide al BFF. El `Suspense` no es decorativo: la vista usa `useSearchParams`, y sin
 * el limite el build de esta ruta falla.
 *
 * Sin filtro la API devuelve las tres —abiertas, ganadas y perdidas—: el historico se consulta desde
 * la misma pantalla, y esconderlo por defecto obligaria a saber que existe un filtro para encontrarlo.
 */
export default async function LicitacionesPage (props: PageProps<'/licitaciones'>) {
  const params = paramsDeUrl(await props.searchParams)

  const estado = leerConsulta(params, LICITACIONES)
  const consulta = construirConsulta(estado, LICITACIONES)

  const [lista, lookups, yo] = await Promise.all([
    pedir<Licitacion[]>(`/licitaciones${consulta === '' ? '' : `?${consulta}`}`),
    cargarLookups(),
    pedir<Yo>('/me')
  ])

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold text-texto">{LICITACIONES.titulo.plural}</h1>
        <TotalDelListado paginacion={lista.meta?.pagination} />
      </div>

      <Suspense fallback={<Cargando alto="min-h-36" mensaje={`Cargando ${LICITACIONES.titulo.plural.toLowerCase()}…`} />}>
        <VistaLicitaciones
          inicial={{ filas: lista.data, paginacion: lista.meta?.pagination }}
          capacidades={yo.data.permissions.projects}
          opcionesDeFiltro={opcionesDeFiltros(LICITACIONES, lookups)}
          paises={comoOpciones(listaDe(lookups, 'countries'))}
        />
      </Suspense>
    </section>
  )
}

/**
 * Un catalogo de `GET /lookups` en la forma que espera un campo `seleccion`.
 *
 * El id viaja como cadena porque un `<select>` no conoce otro tipo; `cuerpoDelFormulario` lo vuelve
 * numero antes de mandarlo.
 */
function comoOpciones (lista: EstadoLookup[]): OpcionCampo[] {
  return lista.map((item) => ({ valor: String(item.id), etiqueta: item.name }))
}
