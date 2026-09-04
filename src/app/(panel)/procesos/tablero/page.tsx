import { Suspense } from 'react'
import { TableroProcesos } from '@/componentes/datos/vistas'
import { AltaRapidaProceso } from '@/componentes/proyecto/AltaRapidaProceso'
import { Cargando } from '@/componentes/estado/Estados'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { cargarLookups, opcionesDeFiltros } from '@/datos/lookups'
import { pedir, pedirOpcional } from '@/datos/servidor'
import type { Espacio, MiembroEquipo } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { PROCESOS } from '@/definiciones/procesos'

export const metadata = { title: 'Tablero de Tareas · WiWO Ops' }

/**
 * Tablero de Procesos.
 *
 * Los filtros los pone y los saca `TableroProcesos` desde el navegador: no hay un pedido de servidor
 * que resolver aca para el tablero en si. Lo que si se resuelve aca es el enlace de vuelta a la
 * tabla, que tiene que conservar los filtros vigentes.
 *
 * El `Suspense` no es decorativo: `TableroProcesos` usa `useSearchParams` para leer los filtros de la
 * URL, y sin este limite el build de la pagina falla.
 */
export default async function TableroProcesosPage (props: PageProps<'/procesos/tablero'>) {
  const params = paramsDeUrl(await props.searchParams)
  const estado = leerConsulta(params, PROCESOS)
  const consulta = construirConsulta({ ...estado, orden: [], pagina: 1 }, PROCESOS)

  const [lookups, yo, equipo, espacios] = await Promise.all([
    cargarLookups(),
    pedir<Yo>('/me'),
    // Catalogos del alta rapida, iguales a los de la lista: el boton tiene que estar en las dos
    // pantallas, porque la tarea se anota donde uno esta parado. El equipo es opcional por el mismo
    // motivo que en la lista: `/staff` exige `staff.view` y sin permiso responde 403.
    pedirOpcional<MiembroEquipo[]>('/staff?per_page=100'),
    pedir<Espacio[]>('/projects?per_page=100')
  ])

  const catalogosDeAlta = {
    personas: (equipo.datos ?? []).map((p) => ({ id: p.id, full_name: p.full_name })),
    espacios: espacios.data.map((e) => ({ id: e.id, name: e.name })),
    prioridades: lookups.task_priorities.map((p) => ({ id: p.id, name: p.name }))
  }

  return (
    <section className="flex min-h-0 flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-texto">Tablero de {PROCESOS.titulo.plural}</h1>
        <div className="flex items-center gap-3">
          <Segmentado
            etiqueta={`Presentación de ${PROCESOS.titulo.plural.toLowerCase()}`}
            tamano="medio"
            activo="tablero"
            opciones={[
              // `consulta` ya viene sin orden ni pagina: al volver a la lista viajan solo los filtros.
              { valor: 'tabla', etiqueta: 'Tabla', icono: 'tabla', href: `/procesos${consulta === '' ? '' : `?${consulta}`}` },
              { valor: 'tablero', etiqueta: 'Tablero', icono: 'tablero', href: '/procesos/tablero' }
            ]}
          />
          {yo.data.permissions.tasks.includes('create') && (
            <AltaRapidaProceso catalogos={catalogosDeAlta} />
          )}
        </div>
      </header>

      <Suspense fallback={<Cargando alto="min-h-36" mensaje="Cargando el tablero…" />}>
        <TableroProcesos opcionesDeFiltro={opcionesDeFiltros(PROCESOS, lookups)} />
      </Suspense>
    </section>
  )
}
