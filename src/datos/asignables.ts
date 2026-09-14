import { pedirSobre } from './cliente.ts'
import type { EstadoLookup, PersonaAsignable } from './recursos.ts'
import type { DefinicionRecurso } from '../definiciones/tipos.ts'

/**
 * Tope de la unica pagina que se pide.
 *
 * La instalacion tiene 184 personas y la ruta pagina de a 25 por defecto: sin tope, el selector
 * ofreceria las primeras 25 y el resto se veria como "no existe". 500 deja margen para crecer sin
 * volver a tocar esto, y sigue siendo una sola respuesta de cinco claves por fila.
 */
const TOPE_DE_ASIGNABLES = 500

/** La ruta, sin barra inicial: asi la piden el navegador (via BFF) y el servidor con un `/` delante. */
export const RUTA_DE_ASIGNABLES = `staff/asignables?per_page=${TOPE_DE_ASIGNABLES}`

/**
 * La peticion en vuelo o ya resuelta, compartida por todos los que la pidan.
 *
 * Es un modulo, asi que vive lo que viva la pestaña: el catalogo de personas cambia cuando alguien
 * entra o sale del equipo, no mientras se edita una tarea.
 */
let enMemoria: Promise<PersonaAsignable[]> | null = null

/**
 * Las personas a las que se le puede asignar un Proceso, pedidas **una sola vez por pestaña**.
 *
 * Todas las pantallas que ofrecen asignados salen de aca: el selector de la tarea, las acciones
 * masivas y el alta rapida. Que cada una tuviera su propia fuente era lo que hacia que dos personas
 * vieran listas distintas en el mismo selector.
 *
 * La busqueda del selector filtra esta lista en el navegador (`filtrarPersonas`) en vez de pedir con
 * `q`: son 184 filas ya en memoria, y una peticion por tecla no agrega ningun nombre que no este.
 *
 * Sin señal de aborto a proposito: la promesa la comparten varios componentes, y abortarla porque
 * uno se desmonto le romperia la carga a los demas. Quien la use tiene que descartar la respuesta si
 * ya se desmonto.
 *
 * @returns la lista completa, ordenada por nombre como la devuelve la API
 * @throws Error con el mensaje del contrato si la peticion falla; el proximo llamado reintenta
 */
export async function cargarAsignables (): Promise<PersonaAsignable[]> {
  enMemoria ??= pedirSobre<PersonaAsignable[]>(RUTA_DE_ASIGNABLES, new AbortController().signal)
    .then((sobre) => sobre.data)
    .catch((fallo: unknown) => {
      // Un fallo no se cachea: si se guardara, el primer error dejaria el selector vacio para siempre.
      enMemoria = null
      throw fallo
    })

  return await enMemoria
}

/** Olvida lo cacheado. Solo para las pruebas: en la pantalla no hay ningun momento que lo pida. */
export function olvidarAsignables (): void {
  enMemoria = null
}

/**
 * El equipo como catalogo de filtros, para las vistas que se arman en el navegador.
 *
 * Los filtros por persona —Asignado, Creado por, Seguidor— salen de aca y no de `/lookups`, que no
 * trae al equipo. Se pide solo si la definicion lo declara: los paneles de Notas o de Archivos no
 * preguntan por personas y no tienen por que gastar un viaje.
 *
 * Un fallo devuelve la lista vacia en vez de propagarse: esos filtros quedan sin opciones —el motor
 * los dibuja diciendolo— y el resto de la tabla se pinta igual.
 *
 * @param definicion El recurso que se esta listando.
 * @returns El catalogo con la forma de un lookup, o vacio si no hace falta.
 */
export async function staffParaFiltros<T> (definicion: DefinicionRecurso<T>): Promise<EstadoLookup[]> {
  if (!definicion.filtros.some((filtro) => filtro.desdeLookup === 'staff')) return []

  const personas = await cargarAsignables().catch(() => [])

  return personas.map((persona) => ({ id: persona.id, name: persona.full_name }))
}
