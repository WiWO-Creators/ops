import { BotonCompletados } from '@/componentes/proyecto/BotonCompletados'
import { Suspense } from 'react'
import { TablaProcesos } from '@/componentes/datos/vistas'
import { Cargando } from '@/componentes/estado/Estados'
import { AltaRapidaProceso } from '@/componentes/proyecto/AltaRapidaProceso'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import { iaHabilitada } from '@/datos/ajustes'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { cargarLookups, opcionesDeFiltros } from '@/datos/lookups'
import { RUTA_DE_ASIGNABLES } from '@/datos/asignables'
import { pedir, pedirOpcional } from '@/datos/servidor'
import type { Espacio, PersonaAsignable, Proceso } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { PROCESOS } from '@/definiciones/procesos'
import { opcionesDeCliente } from './opciones-de-cliente'

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
  // El tablero pagina por columna y no admite orden, asi que el salto lleva los filtros y descarta
  // orden y pagina — lo mismo que hace `/procesos/tablero` al armar su propia consulta. Sin esto,
  // filtrar la lista y pasar al tablero devolvia el tablero sin filtrar.
  const consultaTablero = construirConsulta({ ...estado, orden: [], pagina: 1 }, PROCESOS)

  const [lista, lookups, yo, equipo, espacios, clientes, conIa] = await Promise.all([
    pedir<Proceso[]>(`/tasks${consulta === '' ? '' : `?${consulta}`}`),
    cargarLookups(),
    pedir<Yo>('/me'),
    // Catalogos del alta rapida: son para resolver `@` y `#` mientras se escribe, no para paginar,
    // asi que se piden ENTEROS. Con el tope anterior de 100 entraba poco mas de la mitad de las 184
    // personas y de los 275 Espacios, y todo lo que quedaba fuera se veia como "no existe": `#Test`
    // terminaba en el titulo como texto suelto. El equipo sale de `/staff/asignables`, la misma
    // fuente que el selector de la tarea: `/staff` exige `staff.view` y le contestaba 403 a casi
    // todo el equipo, que veia el campo "Responsable" vacio. Sigue con `pedirOpcional` porque un
    // catalogo del alta no puede tumbar la pantalla entera.
    pedirOpcional<PersonaAsignable[]>(`/${RUTA_DE_ASIGNABLES}`),
    pedir<Espacio[]>('/projects?per_page=500'),
    opcionesDeCliente(),
    // Decide si el alta ofrece el texto libre: con la capa apagada la API responde 404 a `/ia/*`.
    iaHabilitada()
  ])

  const catalogosDeAlta = {
    personas: (equipo.datos ?? []).map((p) => ({ id: p.id, full_name: p.full_name })),
    espacios: espacios.data.map((e) => ({ id: e.id, name: e.name })),
    prioridades: lookups.task_priorities.map((p) => ({ id: p.id, name: p.name }))
  }

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-texto">{PROCESOS.titulo.plural}</h1>
        <div className="flex items-center gap-3">
          <Suspense><BotonCompletados /></Suspense>
          <Segmentado
            etiqueta={`Presentación de ${PROCESOS.titulo.plural.toLowerCase()}`}
            tamano="medio"
            activo="tabla"
            opciones={[
              { valor: 'tabla', etiqueta: 'Tabla', icono: 'tabla', href: '/procesos' },
              {
                valor: 'tablero',
                etiqueta: 'Tablero',
                icono: 'tablero',
                href: `/procesos/tablero${consultaTablero === '' ? '' : `?${consultaTablero}`}`
              }
            ]}
          />
          {yo.data.permissions.tasks.includes('create') && (
            <AltaRapidaProceso catalogos={catalogosDeAlta} etiquetas={lookups.tags} conIa={conIa} />
          )}
        </div>
      </header>

      <Suspense fallback={<Cargando alto="min-h-36" mensaje={`Cargando ${PROCESOS.titulo.plural.toLowerCase()}…`} />}>
        <TablaProcesos
          inicial={{ filas: lista.data, paginacion: lista.meta?.pagination }}
          capacidades={yo.data.permissions.tasks}
          opcionesDeFiltro={{ ...opcionesDeFiltros(PROCESOS, lookups), clients: clientes }}
        />
      </Suspense>
    </section>
  )
}
