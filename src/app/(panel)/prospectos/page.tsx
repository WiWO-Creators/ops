import { Suspense } from 'react'
import { Cargando } from '@/componentes/estado/Estados'
import { TotalDelListado } from '@/componentes/datos/TotalDelListado'
import { VistaProspectos } from '@/componentes/prospecto/VistaProspectos'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { listaDe } from '@/datos/catalogos'
import { cargarLookups } from '@/datos/lookups'
import { pedir } from '@/datos/servidor'
import type { EstadoLookup, Prospecto } from '@/datos/recursos'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import type { Yo } from '@/datos/tipos'
import { PROSPECTOS } from '@/definiciones/prospectos'

export const metadata = { title: 'Prospectos · WiWO Ops' }

/**
 * Lista de Prospectos: las empresas a las que se les esta licitando.
 *
 * La primera pagina se resuelve en el servidor para que la lista no parpadee al montar; de ahi en
 * adelante el motor pide al BFF. El `Suspense` no es decorativo: la vista usa `useSearchParams`, y
 * sin el limite el build de esta ruta falla.
 */
export default async function ProspectosPage (props: PageProps<'/prospectos'>) {
  const params = paramsDeUrl(await props.searchParams)

  const estado = leerConsulta(params, PROSPECTOS)
  const consulta = construirConsulta(estado, PROSPECTOS)

  const [lista, lookups, yo] = await Promise.all([
    pedir<Prospecto[]>(`/prospectos${consulta === '' ? '' : `?${consulta}`}`),
    cargarLookups(),
    pedir<Yo>('/me')
  ])

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold text-texto">{PROSPECTOS.titulo.plural}</h1>
        <TotalDelListado paginacion={lista.meta?.pagination} />
      </div>

      <Suspense fallback={<Cargando alto="min-h-36" mensaje="Cargando prospectos…" />}>
        <VistaProspectos
          usuarioId={yo.data.id}
          inicial={{ filas: lista.data, paginacion: lista.meta?.pagination }}
          capacidades={yo.data.permissions.projects}
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
