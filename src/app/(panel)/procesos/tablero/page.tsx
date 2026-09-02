import { TableroProcesos } from '@/componentes/datos/vistas'
import { AltaRapidaProceso } from '@/componentes/proyecto/AltaRapidaProceso'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { cargarLookups } from '@/datos/lookups'
import { pedir } from '@/datos/servidor'
import type { Espacio, MiembroEquipo, Proceso } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { PROCESOS } from '@/definiciones/procesos'
import type { GrupoTablero } from '@/componentes/datos/tablero'

export const metadata = { title: 'Tablero de Tareas · WiWO Ops' }

/**
 * Tablero de Procesos.
 *
 * `vista=tablero` devuelve una forma distinta de la del listado: un array de columnas, cada una con
 * su propia paginacion. Las columnas llegan ordenadas por `order` y no por `id` — el orden real es
 * 1, 4, 3, 2, 5.
 *
 * Los filtros se serializan aparte de `vista` y viajan en cada recarga del motor: sin ellos, la
 * pagina siguiente de una columna vendria de otro tablero.
 */
export default async function TableroProcesosPage (props: PageProps<'/procesos/tablero'>) {
  const params = paramsDeUrl(await props.searchParams)
  const estado = leerConsulta(params, PROCESOS)
  const consulta = construirConsulta({ ...estado, orden: [], pagina: 1 }, PROCESOS)

  const [grupos, lookups, yo, equipo, espacios] = await Promise.all([
    pedir<Array<GrupoTablero<Proceso>>>(`/tasks?vista=tablero${consulta === '' ? '' : `&${consulta}`}`),
    cargarLookups(),
    pedir<Yo>('/me'),
    // Catalogos del alta rapida, iguales a los de la lista: el boton tiene que estar en las dos
    // pantallas, porque la tarea se anota donde uno esta parado.
    pedir<MiembroEquipo[]>('/staff?per_page=100'),
    pedir<Espacio[]>('/projects?per_page=100')
  ])

  const catalogosDeAlta = {
    personas: equipo.data.map((p) => ({ id: p.id, full_name: p.full_name })),
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

      <TableroProcesos inicial={grupos.data} consulta={consulta} />
    </section>
  )
}
