import { Suspense } from 'react'
import { Cargando, ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { ResumenCalidad } from './ResumenCalidad'
import { VistaCalidadTareas } from './VistaCalidadTareas'
import { construirConsulta, leerConsulta } from '@/datos/consulta'
import { ErrorApi } from '@/datos/errores'
import { cargarLookups, opcionesDeFiltros } from '@/datos/lookups'
import { pedir, pedirOpcional } from '@/datos/servidor'
import type { Espacio, ResumenCalidadTareas, TareaCalidad } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { CALIDAD_TAREAS } from '@/definiciones/calidad-tareas'
import { GLOSARIO } from '@/dominio/glosario'

/** Cuantos Proyectos se traen para el desplegable del filtro. El mismo tope que usa `/procesos`. */
const ESPACIOS_DEL_FILTRO = 500

/**
 * La pestaña de calidad: el detector de tareas insuficientes.
 *
 * Contesta una sola pregunta —cuales de nuestras Tareas no dicen lo suficiente como para poder
 * trabajarlas— y la contesta con una nota de 0 a 100 sobre tres ejes: si la descripcion explica que
 * hay que hacer, si hay alguien a cargo y si hay fecha. Los dos ultimos los sabe la base; el primero
 * lo puntua la IA, y por eso puede llegar sin evaluar.
 *
 * === Por que el resumen y la tabla son dos lecturas ===
 *
 * Porque cuentan cosas distintas: el resumen cuenta sobre TODAS las Tareas visibles y la tabla
 * muestra una pagina filtrada. Si el resumen saliera de las filas, filtrar por un Proyecto apagaria
 * el problema del resto y el numero dejaria de ser comparable de un dia para otro.
 *
 * === Por que el listado manda y el resto no ===
 *
 * Un `403` en el listado es la pantalla entera: se muestra "sin permiso" y se termina. Que falle el
 * resumen o el catalogo de filtros no puede dejar sin tabla a quien vino a arreglar descripciones,
 * asi que esos dos van con `pedirOpcional` y degradan solos.
 *
 * @param params Los parametros de la URL, ya normalizados por la pagina.
 * @param yo Quien mira, para las capacidades sobre Tareas del detalle.
 */
export async function PanelCalidadTareas ({ params, yo }: { params: URLSearchParams, yo: Yo }) {
  const estado = leerConsulta(params, CALIDAD_TAREAS)
  const consulta = construirConsulta(estado, CALIDAD_TAREAS)

  let lista
  try {
    lista = await pedir<TareaCalidad[]>(`/${CALIDAD_TAREAS.ruta}${consulta === '' ? '' : `?${consulta}`}`)
  } catch (error) {
    if (!(error instanceof ErrorApi)) throw error
    if (error.codigo === 'forbidden') return <SinPermiso className="mt-10" />

    return <ErrorEstado detalle={error.message} className="mt-10" />
  }

  const [resumen, lookups, espacios] = await Promise.all([
    pedirOpcional<ResumenCalidadTareas>(`/${CALIDAD_TAREAS.ruta}/summary`),
    cargarLookups(),
    pedirOpcional<Espacio[]>(`/projects?per_page=${ESPACIOS_DEL_FILTRO}`)
  ])

  return (
    <section className="flex flex-col gap-4">
      <ResumenCalidad resumen={resumen.datos} error={resumen.error} />

      {/* `TablaRecurso` usa `useSearchParams`: sin este limite de Suspense el build de la ruta falla. */}
      <Suspense fallback={<Cargando alto="min-h-36" mensaje={`Cargando la calidad de las ${GLOSARIO.proceso.plural.toLowerCase()}…`} />}>
        <VistaCalidadTareas
          inicial={{ filas: lista.data, paginacion: lista.meta?.pagination }}
          capacidades={yo.permissions.tasks}
          opcionesDeFiltro={{
            ...opcionesDeFiltros(CALIDAD_TAREAS, lookups),
            // El catalogo de Proyectos no viaja en `/lookups`, y aca **no** se antepone la opcion
            // "Sin proyecto" que usa `/procesos`: el contrato de `filter[project_id]` solo acepta
            // un id, y el valor sintetico `ninguno` seria un 422.
            projects: (espacios.datos ?? []).map((espacio) => ({
              valor: String(espacio.id),
              etiqueta: espacio.name
            }))
          }}
        />
      </Suspense>
    </section>
  )
}
