import { Suspense } from 'react'
import { VistaClientes } from '@/componentes/cliente/VistaClientes'
import { Cargando } from '@/componentes/estado/Estados'
import { TotalDelListado } from '@/componentes/datos/TotalDelListado'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { cargarLookups, opcionesDeFiltros } from '@/datos/lookups'
import { pedir } from '@/datos/servidor'
import type { Cliente } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { CLIENTES } from '@/definiciones/clientes'

export const metadata = { title: 'Clientes · WiWO Ops' }

/**
 * Lista de Clientes, en tabla o en tarjetas.
 *
 * La primera pagina se resuelve en el servidor para que la lista no parpadee al montar; de ahi en
 * adelante el motor pide al BFF. El `Suspense` no es decorativo: la vista usa `useSearchParams`, y sin
 * el limite el build de esta ruta falla.
 *
 * `vista` no pasa por `leerConsulta`: no es parte de la consulta a la API —el motor descarta lo que la
 * definicion no declara— sino de como se presenta el resultado. Misma clave que en `/espacios`.
 */
export default async function ClientesPage (props: PageProps<'/clientes'>) {
  const params = paramsDeUrl(await props.searchParams)

  const estado = leerConsulta(params, CLIENTES)
  const consulta = construirConsulta(estado, CLIENTES)
  const vista = params.get('vista') === 'tarjetas' ? 'tarjetas' : 'tabla'

  const [lista, lookups, yo] = await Promise.all([
    pedir<Cliente[]>(`/clients${consulta === '' ? '' : `?${consulta}`}`),
    cargarLookups(),
    pedir<Yo>('/me')
  ])

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold text-texto">{CLIENTES.titulo.plural}</h1>
        <TotalDelListado paginacion={lista.meta?.pagination} />
      </div>

      <Suspense fallback={<Cargando alto="min-h-36" mensaje={`Cargando ${CLIENTES.titulo.plural.toLowerCase()}…`} />}>
        <VistaClientes
          inicial={{ filas: lista.data, paginacion: lista.meta?.pagination }}
          capacidades={yo.data.permissions.customers}
          opcionesDeFiltro={opcionesDeFiltros(CLIENTES, lookups)}
          vistaInicial={vista}
        />
      </Suspense>
    </section>
  )
}
