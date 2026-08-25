import { Suspense } from 'react'
import { TablaClientes } from '@/componentes/datos/vistas'
import { Cargando } from '@/componentes/estado/Estados'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { cargarLookups, opcionesDeFiltros } from '@/datos/lookups'
import { pedir } from '@/datos/servidor'
import type { Cliente } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { CLIENTES } from '@/definiciones/clientes'

export const metadata = { title: 'Clientes · WiWO Ops' }

/**
 * Lista de Clientes.
 *
 * La primera pagina se resuelve en el servidor para que la tabla no parpadee al montar; de ahi en
 * adelante el motor pide al BFF. El `Suspense` no es decorativo: `TablaRecurso` usa
 * `useSearchParams`, y sin el limite el build de esta ruta falla.
 */
export default async function ClientesPage (props: PageProps<'/clientes'>) {
  const params = paramsDeUrl(await props.searchParams)

  const estado = leerConsulta(params, CLIENTES)
  const consulta = construirConsulta(estado, CLIENTES)

  const [lista, lookups, yo] = await Promise.all([
    pedir<Cliente[]>(`/clients${consulta === '' ? '' : `?${consulta}`}`),
    cargarLookups(),
    pedir<Yo>('/me')
  ])

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-texto">{CLIENTES.titulo.plural}</h1>
      <Suspense fallback={<Cargando />}>
        <TablaClientes
          inicial={{ filas: lista.data, paginacion: lista.meta?.pagination }}
          capacidades={yo.data.permissions.customers}
          opcionesDeFiltro={opcionesDeFiltros(CLIENTES, lookups)}
        />
      </Suspense>
    </section>
  )
}
