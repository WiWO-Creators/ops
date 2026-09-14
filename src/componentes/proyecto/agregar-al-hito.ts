import type { CuerpoMover } from '@/componentes/datos/tablero'

/**
 * Logica pura del "+" de una columna del kanban de Hitos: crear una tarea ya colgada del hito, o
 * sumarle una de las que hoy no tienen ninguno.
 *
 * Vive fuera del `.tsx` por la razon de siempre en este proyecto: Node sabe despojar los tipos de un
 * `.ts` pero no el JSX, asi que una funcion declarada dentro del componente no se puede probar. Aca
 * no hay React ni `fetch`.
 *
 * Sin imports de valor: los `import type` desaparecen al despojar tipos, pero un import normal con el
 * alias `@/` no lo resolveria el runner de Node.
 */

/**
 * Valor del filtro `milestone_id` que el backend interpreta como "sin hito".
 *
 * Es el mismo 0 con el que viaja la columna sintetica "Sin categorizar" del tablero, y no una
 * casualidad: el listado que alimenta el dialogo tiene que traer exactamente lo que se ve en esa
 * columna.
 */
export const SIN_HITO = 0

/** Cuantas tareas sin hito se traen de una. Mas que eso no entra en un dialogo sin paginar. */
export const MAXIMO_SIN_HITO = 100

/** Lo minimo que el dialogo necesita saber de una tarea candidata. */
export interface TareaCandidata {
  id: number
  name: string
}

/**
 * Ruta del BFF con las tareas del Espacio que todavia no cuelgan de ningun hito.
 *
 * @param proyectoId el Espacio que se esta mirando
 * @returns la ruta sin barra inicial, lista para `pedirSobre`
 */
export function rutaTareasSinHito (proyectoId: number): string {
  const params = new URLSearchParams({
    'filter[project_id]': String(proyectoId),
    'filter[milestone_id]': String(SIN_HITO),
    per_page: String(MAXIMO_SIN_HITO)
  })

  return `tasks?${params.toString()}`
}

/**
 * Acota la lista de candidatas a lo que la persona escribio en el buscador.
 *
 * El filtrado es en el navegador y no una peticion mas: la lista ya esta entera en memoria y son
 * cien filas como mucho. Sin acentos ni mayusculas, para que "grafica" encuentre "Gráfica".
 *
 * @param tareas las candidatas ya traidas
 * @param texto lo escrito en el buscador; vacio devuelve todas
 * @returns las que coinciden, en el mismo orden
 */
export function filtrarCandidatas<T extends TareaCandidata> (tareas: T[], texto: string): T[] {
  const buscado = normalizar(texto)

  if (buscado === '') return tareas

  return tareas.filter((tarea) => normalizar(tarea.name).includes(buscado))
}

/** Minusculas y sin diacriticos, para comparar lo que se escribe con lo que se ve. */
function normalizar (texto: string): string {
  return texto.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/*
 * Aca vivian `AltaEnHito`, `validarAltaEnHito` y `cuerpoDeAltaEnHito`: un segundo camino de alta que
 * armaba el `POST /tasks` con `name`, `priority` y `due_date` y **sin `description`**. Se borraron y
 * no se arreglaron porque el camino bueno ya existe: la pestaña "Crear nueva" de `AgregarAlHito`
 * monta `AltaRapidaProceso`, que exige la descripcion antes de viajar (`errorDeDescripcion`) igual
 * que la exige `POST /tasks` con su 422. Dejar las dos formas de crear una Tarea era garantizar que
 * la proxima pantalla que necesitara un alta rapida tomara la que se saltea la regla.
 */

/**
 * Cuerpo de `POST /tasks/{id}/mover-hito` para sumar una tarea suelta al hito.
 *
 * Es el mismo movimiento que hace el arrastre, y por eso se arma con la forma que ya habla el motor
 * de tablero en vez de inventar otra. La tarjeta entra **primera** —`posicion: 1`— porque acaba de
 * elegirse a mano y el fondo de una columna larga es donde no se la vuelve a ver.
 *
 * `columna_completa` va vacia a proposito: el dialogo no conoce el orden de la columna destino, y
 * mandar una lista incompleta haria que el backend empuje al fondo todo lo que no le mandaron
 * (`Tablero::reordenar()`). Vacia, la API arma el orden desde la base e inserta en la posicion.
 *
 * @param hitoId la columna destino
 * @returns el cuerpo tal como lo espera `moverTarjeta`, antes de `cuerpoMoverHito`
 */
export function movimientoAlHito (hitoId: number): CuerpoMover {
  return { columna: hitoId, posicion: 1, columna_completa: [] }
}
