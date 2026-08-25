import { Suspense } from 'react'
import { TablaEspacios } from '@/componentes/datos/vistas'
import { Cargando } from '@/componentes/estado/Estados'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { cargarLookups, opcionesDeFiltros } from '@/datos/lookups'
import { pedir } from '@/datos/servidor'
import type { Espacio } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { ESPACIOS } from '@/definiciones/espacios'

export const metadata = { title: 'Espacios · WiWO Ops' }

/**
 * Lista de Espacios.
 *
 * La primera pagina se resuelve en el servidor para que la tabla no parpadee al montar; de ahi en
 * adelante el motor pide al BFF. El `Suspense` no es decorativo: `TablaRecurso` usa
 * `useSearchParams`, y sin ese limite el build de la ruta falla.
 */
export default async function EspaciosPage (props: PageProps<'/espacios'>) {
  const params = paramsDeUrl(await props.searchParams)
  const estado = leerConsulta(params, ESPACIOS)
  const consulta = construirConsulta(estado, ESPACIOS)

  const [lista, lookups, yo] = await Promise.all([
    pedir<Espacio[]>(`/projects${consulta === '' ? '' : `?${consulta}`}`),
    cargarLookups(),
    pedir<Yo>('/me')
  ])

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-texto">{ESPACIOS.titulo.plural}</h1>

      <Suspense fallback={<Cargando />}>
        <TablaEspacios
          inicial={{ filas: lista.data, paginacion: lista.meta?.pagination }}
          capacidades={yo.data.permissions.projects}
          opcionesDeFiltro={opcionesDeFiltros(ESPACIOS, lookups)}
        />
      </Suspense>
    </section>
  )
}
