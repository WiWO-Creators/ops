import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { VistaEspacios } from '@/componentes/proyecto/TarjetasProyectos'
import { Cargando } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { RUTA_DE_ASIGNABLES } from '@/datos/asignables'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { ErrorApi } from '@/datos/errores'
import { cargarLookups, opcionesDeFiltros } from '@/datos/lookups'
import { pedir, pedirOpcional } from '@/datos/servidor'
import type {
  CampoPersonalizadoMeta,
  SolicitudDeEliminacion,
  ClienteMinimo,
  EstadisticaEstado,
  Espacio,
  PersonaAsignable,
  PlantillaEspacio
} from '@/datos/recursos'
import type { OpcionFiltro } from '@/definiciones/tipos'
import type { Yo } from '@/datos/tipos'
import { ESPACIOS, espaciosConCampos, filtrosDeEntradaDeEspacios } from '@/definiciones/espacios'
import { cn } from '@/lib/clases'

export const metadata = { title: 'Proyectos · WiWO Ops' }

/**
 * Tope de opciones que se traen para el selector de Cliente.
 *
 * Es el maximo que acepta la API en una pagina. Cien no alcanzaba: la cartera pasa de ciento veinte y
 * el orden es alfabetico, asi que todo lo que venia despues de la "P" —el propio "Wiwo" incluido— no
 * existia para el alta de un Proyecto.
 *
 * Las personas no pasan por aca: salen de `RUTA_DE_ASIGNABLES`, que trae a las 184 de una y no exige
 * `staff.view`.
 */
const TOPE_DE_OPCIONES = 500

/** Opciones de un selector a partir de una lista de la API. */
function opcionesDe<T> (lista: T[] | null, valor: (item: T) => string, etiqueta: (item: T) => string): OpcionFiltro[] {
  return (lista ?? []).map((item) => ({ valor: valor(item), etiqueta: etiqueta(item) }))
}

/**
 * Cuantos pedidos de eliminacion esperan decision, o 0 si no se pudieron contar.
 *
 * `per_page=1` porque lo unico que se usa es el total: traer las filas seria pagar una pagina de
 * datos para pintar un numero. No usa `pedirOpcional` porque ese devuelve `data` y descarta `meta`,
 * que es justo donde viaja el total.
 *
 * El fallo se traga y devuelve 0 a proposito: una base sin la migracion 0850 contesta 409 acá, y un
 * contador que no se pudo leer no puede dejar el listado de Proyectos en blanco. Con 0 el aviso no
 * se dibuja, que es exactamente lo que corresponde cuando no se sabe si hay algo.
 */
async function contarPendientes (): Promise<number> {
  try {
    const lista = await pedir<SolicitudDeEliminacion[]>(
      '/deletion-requests?filter[estado]=pendiente&per_page=1'
    )

    return lista.meta?.pagination?.total ?? 0
  } catch (error) {
    if (error instanceof ErrorApi) return 0

    throw error
  }
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
export default async function EspaciosPage (props: PageProps<'/proyectos'>) {
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
    if (filtros !== null) redirect(`/proyectos?${construirConsulta({ ...estado, filtros }, definicion)}`)
  }

  const [lista, lookups, yo, estadisticas, clientes, equipo, plantillas] = await Promise.all([
    pedir<Espacio[]>(`/projects${consulta === '' ? '' : `?${consulta}`}`),
    cargarLookups(),
    pedir<Yo>('/me'),
    pedirOpcional<EstadisticaEstado[]>('/projects/stats'),
    // `/clients/minimos` y no `/clients`: trae la cartera entera con lo unico que el selector usa
    // —id y razon social— y corre antes de la compuerta de `customers.view`, que le respondia 403 a
    // parte del equipo y dejaba el alta sin ningun Cliente que elegir.
    pedirOpcional<ClienteMinimo[]>(`/clients/minimos?sort=company&per_page=${TOPE_DE_OPCIONES}`),
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

  const cuantasPendientes = yo.data.is_admin ? await contarPendientes() : 0

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo={ESPACIOS.titulo.plural}
        acciones={yo.data.is_admin
          ? (
            // El enlace esta siempre, no solo cuando hay algo esperando: sin el, un admin sin
            // pendientes no tendria por donde llegar al historial de lo ya decidido. Lo que cambia
            // con los pendientes es el tono y el texto, que es lo que hace que se note.
            <Link
              href="/proyectos/solicitudes"
              className={cn(
                'rounded-control px-3 py-1.5 text-sm',
                cuantasPendientes > 0
                  ? 'border border-relleno-peligro text-texto-peligro'
                  : 'border border-linea text-texto-tenue hover:bg-hover'
              )}
            >
              {cuantasPendientes === 0
                ? 'Solicitudes de eliminación'
                : cuantasPendientes === 1
                  ? '1 eliminación por resolver'
                  : `${cuantasPendientes} eliminaciones por resolver`}
            </Link>
            )
          : undefined}
      />

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
