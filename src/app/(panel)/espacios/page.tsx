import { Suspense } from 'react'
import { VistaEspacios } from '@/componentes/proyecto/TarjetasProyectos'
import { Cargando } from '@/componentes/estado/Estados'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { cargarLookups, opcionesDeFiltros } from '@/datos/lookups'
import { pedir } from '@/datos/servidor'
import type { Espacio } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { ESPACIOS } from '@/definiciones/espacios'

export const metadata = { title: 'Proyectos · WiWO Ops' }

/**
 * Lista de Espacios, en tarjetas o en tabla.
 *
 * La pagina se resuelve en el servidor para que la lista no parpadee al montar; el `Suspense` no es
 * decorativo: la vista usa `useSearchParams`, y sin ese limite el build de la ruta falla.
 *
 * `vista` no pasa por `leerConsulta`: no es parte de la consulta a la API —el motor descarta lo que
 * la definicion no declara— sino de como se presenta el resultado.
 */
export default async function EspaciosPage (props: PageProps<'/espacios'>) {
  const params = paramsDeUrl(await props.searchParams)
  const estado = leerConsulta(params, ESPACIOS)
  const consulta = construirConsulta(estado, ESPACIOS)
  const vista = params.get('vista') === 'tabla' ? 'tabla' : 'tarjetas'

  const [lista, lookups, yo] = await Promise.all([
    pedir<Espacio[]>(`/projects${consulta === '' ? '' : `?${consulta}`}`),
    cargarLookups(),
    pedir<Yo>('/me')
  ])

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-texto">{ESPACIOS.titulo.plural}</h1>

      <Suspense fallback={<Cargando />}>
        <VistaEspacios
          inicial={{ filas: lista.data, paginacion: lista.meta?.pagination }}
          capacidades={yo.data.permissions.projects}
          opcionesDeFiltro={opcionesDeFiltros(ESPACIOS, lookups)}
          vistaInicial={vista}
        />
      </Suspense>
    </section>
  )
}
