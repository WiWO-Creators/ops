import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { VistaEspacios } from '@/componentes/proyecto/TarjetasProyectos'
import { Cargando } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { RUTA_DE_ASIGNABLES } from '@/datos/asignables'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { cargarLookups, opcionesDeFiltros } from '@/datos/lookups'
import { pedir, pedirOpcional } from '@/datos/servidor'
import type {
  CampoPersonalizadoMeta,
  Cliente,
  EstadisticaEstado,
  Espacio,
  PersonaAsignable,
  PlantillaEspacio
} from '@/datos/recursos'
import type { OpcionFiltro } from '@/definiciones/tipos'
import type { Yo } from '@/datos/tipos'
import { ESPACIOS, espaciosConCampos, filtrosDeEntradaDeEspacios } from '@/definiciones/espacios'

export const metadata = { title: 'Proyectos · WiWO Ops' }

/**
 * Tope de opciones que se traen para el selector de Cliente.
 *
 * Es el maximo que acepta la API en una pagina. Con mas clientes que eso, el selector deja de ser
 * exhaustivo: el reemplazo es un filtro con busqueda contra el servidor, no subir el numero.
 *
 * Las personas no pasan por aca: salen de `RUTA_DE_ASIGNABLES`, que trae a las 184 de una y no exige
 * `staff.view`.
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
  const campos = await pedir<CampoPersonalizadoMeta[]>('/custom-fields?para=projects')
  const definicion = espaciosConCampos(campos.data)
  const estado = leerConsulta(params, definicion)
  const consulta = construirConsulta(estado, definicion)
  const vista = params.get('vista') === 'tabla' ? 'tabla' : 'tarjetas'

  // La regla del filtro de entrada vive en `filtrosDeEntradaDeEspacios`; este `if` solo evita pedir el
  // catalogo en serie delante del listado en las visitas que ya traen consulta, que son la mayoria.
  // `cargarLookups` esta memoizado por peticion, asi que el `Promise.all` de abajo no lo repite.
  if (params.toString() === '') {
    const { project_statuses: estadosDeEspacio } = await cargarLookups()
    const filtros = filtrosDeEntradaDeEspacios(params, estadosDeEspacio.map((opcion) => String(opcion.id)))

    // Se redirige en vez de filtrar por dentro: asi las pastillas, los controles y la tabla leen el
    // mismo estado desde la URL —una sola fuente— y al quitar el estado queda una URL con parametros,
    // que ya no vuelve a disparar el defecto.
    if (filtros !== null) redirect(`/espacios?${construirConsulta({ ...estado, filtros }, definicion)}`)
  }

  const [lista, lookups, yo, estadisticas, clientes, equipo, plantillas] = await Promise.all([
    pedir<Espacio[]>(`/projects${consulta === '' ? '' : `?${consulta}`}`),
    cargarLookups(),
    pedir<Yo>('/me'),
    pedirOpcional<EstadisticaEstado[]>('/projects/stats'),
    pedirOpcional<Cliente[]>(`/clients?per_page=${TOPE_DE_OPCIONES}`),
    // Misma fuente que el selector de asignados de la tarea. `/staff` exige `staff.view` —lo tienen
    // 19 de 184 personas— y ademas cortaba en 100: dos motivos para que el filtro por persona
    // mostrara gente distinta segun quien abriera la pantalla.
    pedirOpcional<PersonaAsignable[]>(`/${RUTA_DE_ASIGNABLES}`),
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
      <TituloModulo titulo={ESPACIOS.titulo.plural} />

      <Suspense fallback={<Cargando alto="min-h-36" mensaje={`Cargando ${ESPACIOS.titulo.plural.toLowerCase()}…`} />}>
        <VistaEspacios
          inicial={{ filas: lista.data, paginacion: lista.meta?.pagination }}
          capacidades={yo.data.permissions.projects}
          opcionesDeFiltro={opcionesDeFiltro}
          vistaInicial={vista}
          estadisticas={estadisticas.datos}
          errorEstadisticas={estadisticas.error}
          campos={campos.data}
          plantillas={plantillas.datos ?? []}
        />
      </Suspense>
    </section>
  )
}
