import { Suspense } from 'react'
import { Cargando, ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { ErrorApi } from '@/datos/errores'
import { cargarLookupsDelPortal, opcionesDeFiltros } from '@/datos/lookups'
import { pedirPortal } from '@/datos/servidor'
import type { DefinicionRecurso, ResultadoLista } from '@/definiciones/tipos'
import { TablaPortal, type SeccionDeVenta } from './TablaPortal'

/**
 * Una seccion de listado del portal.
 *
 * Las seis secciones de venta y soporte son la misma pagina con otra definicion, asi que se escribe
 * una vez. Cada `page.tsx` queda en tres lineas: su metadata y una llamada aca.
 *
 * La primera pagina se resuelve en el servidor para que la tabla no parpadee al montar; de ahi en
 * adelante el motor pide al BFF. El `Suspense` no es decorativo: `TablaRecurso` usa
 * `useSearchParams`, y sin el limite el build de la ruta falla.
 *
 * El 403 se trata como una pantalla y no como una excepcion. La navegacion ya esconde las secciones
 * que el contacto no tiene, pero la URL se puede escribir a mano —y con suscripciones pasa aunque la
 * seccion figure, porque ahi la puerta es ser el contacto primario. Dejarlo lanzar rompia la pagina
 * entera en vez de explicar que no hay acceso.
 */
export async function SeccionDePortal<T extends { id: number }> ({
  seccion,
  definicion,
  parametrosDeUrl
}: {
  seccion: SeccionDeVenta
  definicion: DefinicionRecurso<T>
  parametrosDeUrl: Record<string, string | string[] | undefined>
}) {
  const estado = leerConsulta(paramsDeUrl(parametrosDeUrl), definicion)
  const consulta = construirConsulta(estado, definicion)

  let lista: ResultadoLista<T>

  try {
    const sobre = await pedirPortal<T[]>(`/${definicion.ruta}${consulta === '' ? '' : `?${consulta}`}`)
    lista = { filas: sobre.data, paginacion: sobre.meta?.pagination }
  } catch (error) {
    if (error instanceof ErrorApi && error.estado === 403) return <SinPermiso />
    if (error instanceof ErrorApi) return <ErrorEstado detalle={error.message} />

    throw error
  }

  const lookups = await cargarLookupsDelPortal()

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-texto text-xl font-semibold">{definicion.titulo.plural}</h1>
      <Suspense
        fallback={<Cargando alto="min-h-36" mensaje={`Cargando ${definicion.titulo.plural.toLowerCase()}…`} />}
      >
        <TablaPortal
          seccion={seccion}
          inicial={lista}
          opcionesDeFiltro={opcionesDeFiltros(definicion, lookups)}
        />
      </Suspense>
    </section>
  )
}
