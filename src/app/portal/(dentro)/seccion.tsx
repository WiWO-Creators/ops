import { Suspense, type ReactElement, type ReactNode } from 'react'
import { Cargando, ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { ErrorApi } from '@/datos/errores'
import { cargarLookupsDelPortal, opcionesDeFiltros } from '@/datos/lookups'
import { pedirPortal } from '@/datos/servidor'
import type { Referencia } from '@/datos/recursos'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import type { DefinicionRecurso, OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'

/**
 * Lo que la pagina del servidor le entrega a la tabla cliente de una seccion.
 *
 * Todo es serializable: la definicion (con sus funciones) se resuelve del lado del cliente.
 */
export interface DatosDeTablaDelPortal<T> {
  /** La primera pagina, resuelta en el servidor. */
  inicial: ResultadoLista<T>
  /** La consulta con la que el servidor armo `inicial`; ver `TablaRecurso`. */
  consultaDelInicial?: string
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
}

/** La primera pagina del listado, o la pantalla que explica por que no hay. */
type LecturaDelListado<T> = { lista: ResultadoLista<T> } | { pantalla: ReactElement }

/**
 * Pide la primera pagina del listado.
 *
 * El 403 y los errores de la API se vuelven una pantalla; todo lo demas sigue su camino.
 *
 * @param ruta la ruta del recurso, ya con su consulta
 * @returns la lista o la pantalla de error
 * @throws lo que no sea `ErrorApi`, incluidos los redirects de sesion
 */
async function leerListado<T> (ruta: string): Promise<LecturaDelListado<T>> {
  try {
    const sobre = await pedirPortal<T[]>(ruta)

    return { lista: { filas: sobre.data, paginacion: sobre.meta?.pagination } }
  } catch (error) {
    if (error instanceof ErrorApi && error.estado === 403) return { pantalla: <SinPermiso /> }
    if (error instanceof ErrorApi) return { pantalla: <ErrorEstado detalle={error.message} /> }

    throw error
  }
}

/**
 * Una seccion de listado del portal.
 *
 * Soporte y Proyectos son la misma pagina con otra definicion y otra tabla, asi que se escribe una
 * vez. Cada `page.tsx` pasa su definicion y la funcion `tabla` que dibuja los datos con su tabla
 * cliente (`TablaSolicitudes`, `TablaProyectos`).
 *
 * La primera pagina se resuelve en el servidor para que la tabla no parpadee al montar; de ahi en
 * adelante el motor pide al BFF. El `Suspense` no es decorativo: `TablaRecurso` usa
 * `useSearchParams`, y sin el limite el build de la ruta falla.
 *
 * El listado, los catalogos y los {espacios} se piden **a la vez**: la tabla espera al mas lento, no a
 * la suma de los tres.
 *
 * El 403 se trata como una pantalla y no como una excepcion. La navegacion ya esconde las secciones
 * que el contacto no tiene, pero la URL se puede escribir a mano. Dejarlo lanzar rompia la pagina
 * entera en vez de explicar que no hay acceso.
 */
export async function SeccionDePortal<T extends { id: number }> ({
  definicion,
  parametrosDeUrl,
  tabla,
  acciones,
  espacios
}: {
  definicion: DefinicionRecurso<T>
  parametrosDeUrl: Record<string, string | string[] | undefined>
  /**
   * Dibuja la tabla cliente de la seccion con los datos del servidor. Es una funcion porque se llama
   * en el servidor: solo viaja al cliente el elemento que devuelve, con datos serializables. Recibe
   * ademas los {espacios} del contacto, para el listado que los nombra (Soporte).
   */
  tabla: (datos: DatosDeTablaDelPortal<T>, espacios: Referencia[] | undefined) => ReactNode
  /**
   * Lo que se puede hacer en esta seccion, al lado del titulo. Solo Soporte tiene: Proyectos no se
   * crean desde el portal. Va acá y no en cada `page.tsx` porque el titulo lo dibuja este componente,
   * y un boton afuera quedaria en una fila propia, leyendose como si no fuera del listado.
   */
  acciones?: ReactNode
  /**
   * Los {espacios} del contacto, para nombrar la columna de un listado que la tiene (Soporte). Puede
   * llegar como promesa ya iniciada, para que se pida junto con el listado y no despues de el.
   */
  espacios?: Referencia[] | Promise<Referencia[]>
}) {
  const estado = leerConsulta(paramsDeUrl(parametrosDeUrl), definicion)
  const consulta = construirConsulta(estado, definicion)

  const [lectura, lookups, espaciosDelContacto] = await Promise.all([
    leerListado<T>(`/${definicion.ruta}${consulta === '' ? '' : `?${consulta}`}`),
    cargarLookupsDelPortal(),
    espacios
  ])

  if ('pantalla' in lectura) return lectura.pantalla

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo titulo={definicion.titulo.plural} acciones={acciones} />
      <Suspense
        fallback={<Cargando alto="min-h-36" mensaje={`Cargando ${definicion.titulo.plural.toLowerCase()}…`} />}
      >
        {tabla(
          {
            inicial: lectura.lista,
            consultaDelInicial: consulta,
            opcionesDeFiltro: opcionesDeFiltros(definicion, lookups)
          },
          espaciosDelContacto
        )}
      </Suspense>
    </section>
  )
}
