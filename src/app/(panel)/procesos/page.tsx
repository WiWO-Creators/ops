import Link from 'next/link'
import { Suspense } from 'react'
import { TablaProcesos } from '@/componentes/datos/vistas'
import { Cargando } from '@/componentes/estado/Estados'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { cargarLookups, opcionesDeFiltros } from '@/datos/lookups'
import { pedir } from '@/datos/servidor'
import type { Proceso } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { PROCESOS } from '@/definiciones/procesos'

export const metadata = { title: 'Tareas · WiWO Ops' }

/**
 * Lista de Procesos.
 *
 * La primera pagina se resuelve en el servidor para que la tabla no parpadee al montar; de ahi en
 * adelante el motor pide al BFF. El `Suspense` no es decorativo: `TablaRecurso` usa
 * `useSearchParams`, y sin ese limite el build de la ruta falla.
 */
export default async function ProcesosPage (props: PageProps<'/procesos'>) {
  const params = paramsDeUrl(await props.searchParams)
  const estado = leerConsulta(params, PROCESOS)
  const consulta = construirConsulta(estado, PROCESOS)

  const [lista, lookups, yo] = await Promise.all([
    pedir<Proceso[]>(`/tasks${consulta === '' ? '' : `?${consulta}`}`),
    cargarLookups(),
    pedir<Yo>('/me')
  ])

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-texto">{PROCESOS.titulo.plural}</h1>
        <Link href="/procesos/tablero" className="text-sm text-texto-tenue underline hover:text-texto">
          Ver tablero
        </Link>
      </header>

      <Suspense fallback={<Cargando alto="min-h-36" mensaje={`Cargando ${PROCESOS.titulo.plural.toLowerCase()}…`} />}>
        <TablaProcesos
          inicial={{ filas: lista.data, paginacion: lista.meta?.pagination }}
          capacidades={yo.data.permissions.tasks}
          opcionesDeFiltro={opcionesDeFiltros(PROCESOS, lookups)}
        />
      </Suspense>
    </section>
  )
}
