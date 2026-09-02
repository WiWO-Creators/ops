import { Suspense } from 'react'
import { VistaEquipo } from '@/componentes/equipo/VistaEquipo'
import { Cargando } from '@/componentes/estado/Estados'
import { TotalDelListado } from '@/componentes/datos/TotalDelListado'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { cargarLookups, opcionesDeFiltros } from '@/datos/lookups'
import { pedir } from '@/datos/servidor'
import type { MiembroEquipo } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { EQUIPO } from '@/definiciones/equipo'

export const metadata = { title: 'Equipo · WiWO Ops' }

/**
 * Lista del Equipo.
 *
 * La primera pagina se resuelve en el servidor para que la tabla no parpadee al montar; de ahi en
 * adelante el motor pide al BFF. El `Suspense` no es decorativo: `TablaRecurso` usa
 * `useSearchParams`, y sin el limite el build de esta ruta falla.
 */
export default async function EquipoPage (props: PageProps<'/equipo'>) {
  const params = paramsDeUrl(await props.searchParams)

  const estado = leerConsulta(params, EQUIPO)
  const consulta = construirConsulta(estado, EQUIPO)

  const [lista, lookups, yo] = await Promise.all([
    pedir<MiembroEquipo[]>(`/staff${consulta === '' ? '' : `?${consulta}`}`),
    cargarLookups(),
    pedir<Yo>('/me')
  ])

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold text-texto">{EQUIPO.titulo.plural}</h1>
        <TotalDelListado paginacion={lista.meta?.pagination} />
      </div>

      <Suspense fallback={<Cargando alto="min-h-36" mensaje={`Cargando ${EQUIPO.titulo.plural.toLowerCase()}…`} />}>
        <VistaEquipo
          inicial={{ filas: lista.data, paginacion: lista.meta?.pagination }}
          capacidades={yo.data.permissions.staff}
          opcionesDeFiltro={opcionesDeFiltros(EQUIPO, lookups)}
        />
      </Suspense>
    </section>
  )
}
