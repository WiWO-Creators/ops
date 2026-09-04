import { Suspense } from 'react'
import { VistaEspacios } from '@/componentes/proyecto/TarjetasProyectos'
import { Cargando } from '@/componentes/estado/Estados'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { cargarLookups, opcionesDeFiltros } from '@/datos/lookups'
import { pedir, pedirOpcional } from '@/datos/servidor'
import type {
  CampoPersonalizadoMeta,
  Cliente,
  EstadisticaEstado,
  Espacio,
  MiembroEquipo,
  PlantillaEspacio
} from '@/datos/recursos'
import type { OpcionFiltro } from '@/definiciones/tipos'
import type { Yo } from '@/datos/tipos'
import { ESPACIOS } from '@/definiciones/espacios'

export const metadata = { title: 'Proyectos · WiWO Ops' }

/**
 * Tope de opciones que se traen para los selectores de Cliente y de Miembros.
 *
 * Es el maximo que acepta la API en una pagina. Con mas clientes que eso, el selector deja de ser
 * exhaustivo: el reemplazo es un filtro con busqueda contra el servidor, no subir el numero.
 */
const TOPE_DE_OPCIONES = 100

/** Opciones de un selector a partir de una lista de la API. */
function opcionesDe<T> (lista: T[] | null, valor: (item: T) => string, etiqueta: (item: T) => string): OpcionFiltro[] {
  return (lista ?? []).map((item) => ({ valor: valor(item), etiqueta: etiqueta(item) }))
}

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

  const [lista, lookups, yo, estadisticas, campos, clientes, equipo, plantillas] = await Promise.all([
    pedir<Espacio[]>(`/projects${consulta === '' ? '' : `?${consulta}`}`),
    cargarLookups(),
    pedir<Yo>('/me'),
    pedirOpcional<EstadisticaEstado[]>('/projects/stats'),
    pedirOpcional<CampoPersonalizadoMeta[]>('/custom-fields?para=projects'),
    pedirOpcional<Cliente[]>(`/clients?per_page=${TOPE_DE_OPCIONES}`),
    pedirOpcional<MiembroEquipo[]>(`/staff?per_page=${TOPE_DE_OPCIONES}`),
    // Opcional por el mismo motivo que las demas: una instalacion sin la migracion `0120` aplicada
    // devuelve 404 aca, y eso no puede dejar el listado de Espacios en blanco.
    pedirOpcional<PlantillaEspacio[]>('/project-templates')
  ])

  // Clientes y equipo no son catalogos de `/lookups`, pero los filtros los consumen igual: se
  // indexan con la misma clave que declara `desdeLookup` para no inventar un segundo mecanismo.
  const opcionesDeFiltro = {
    ...opcionesDeFiltros(ESPACIOS, lookups),
    clients: opcionesDe(clientes.datos, (c) => String(c.id), (c) => c.company),
    staff: opcionesDe(equipo.datos, (m) => String(m.id), (m) => m.full_name),
    task_statuses: opcionesDe(lookups.task_statuses, (e) => String(e.id), (e) => e.name)
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-texto">{ESPACIOS.titulo.plural}</h1>

      <Suspense fallback={<Cargando alto="min-h-36" mensaje={`Cargando ${ESPACIOS.titulo.plural.toLowerCase()}…`} />}>
        <VistaEspacios
          inicial={{ filas: lista.data, paginacion: lista.meta?.pagination }}
          capacidades={yo.data.permissions.projects}
          opcionesDeFiltro={opcionesDeFiltro}
          vistaInicial={vista}
          estadisticas={estadisticas.datos}
          errorEstadisticas={estadisticas.error}
          campos={campos.datos ?? []}
          plantillas={plantillas.datos ?? []}
        />
      </Suspense>
    </section>
  )
}
