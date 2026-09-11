import { Suspense } from 'react'
import Link from 'next/link'
import { VistaEquipo } from '@/componentes/equipo/VistaEquipo'
import { Cargando } from '@/componentes/estado/Estados'
import { TotalDelListado } from '@/componentes/datos/TotalDelListado'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
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
      <TituloModulo
        titulo={EQUIPO.titulo.plural}
        acciones={
          <div className="flex items-center gap-3">
            {/* La entrada a Jerarquías vive acá y no en la barra lateral: agregarla al menú toca
                `(panel)/layout.tsx`, que es de otro frente. Quien no dirige nada recibe 403 de la
                API al entrar, así que el enlace no revela nada que la pantalla no cuide. */}
            <Link
              href="/equipo/jerarquia"
              className="text-acento text-sm font-semibold hover:underline"
            >
              Jerarquías
            </Link>
            <TotalDelListado paginacion={lista.meta?.pagination} />
          </div>
        }
      />

      <Suspense fallback={<Cargando alto="min-h-36" mensaje={`Cargando ${EQUIPO.titulo.plural.toLowerCase()}…`} />}>
        <VistaEquipo
          inicial={{ filas: lista.data, paginacion: lista.meta?.pagination }}
          capacidades={yo.data.permissions.staff}
          modeloDePermisos={yo.data.modelo_permisos}
          opcionesDeFiltro={opcionesDeFiltros(EQUIPO, lookups)}
        />
      </Suspense>
    </section>
  )
}
