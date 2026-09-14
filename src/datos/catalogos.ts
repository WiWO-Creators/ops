import { GLOSARIO } from '../dominio/glosario.ts'
import type { EstadoLookup, Lookups } from './recursos.ts'
import type { DefinicionRecurso, Filtro, OpcionFiltro } from '../definiciones/tipos.ts'

/**
 * Lectura de los catalogos configurables de Perfex.
 *
 * Sin dependencias de Next: la carga vive en `lookups.ts`, que si las tiene. Esta separacion no es
 * estetica — Node no puede ejecutar un modulo que importe `next/navigation`, asi que la logica que
 * merece prueba tiene que vivir de este lado.
 */

/**
 * Devuelve una lista de catalogo por su clave, para poblar el selector de un filtro.
 *
 * @param clave La misma que declara `Filtro.desdeLookup`. Ej: `task_statuses`.
 * @returns La lista, o vacia si esa clave no existe — un filtro mal declarado deja un selector sin
 *          opciones, no una pantalla rota.
 */
export function listaDe (lookups: Lookups, clave: string): EstadoLookup[] {
  const lista = (lookups as unknown as Record<string, unknown>)[clave]

  return Array.isArray(lista) ? lista as EstadoLookup[] : []
}

/**
 * Las columnas del tablero, en el orden en que deben pintarse.
 *
 * **La API ya las devuelve ordenadas por `order`, no por `id`** — el orden real en produccion es
 * 1, 4, 3, 2, 5. Esta funcion respeta ese orden y lo reafirma cuando `order` viene: reordenar por id
 * da un tablero equivocado, y es el error mas facil de cometer aca.
 */
export function columnasDelTablero (lookups: Lookups, clave: string): EstadoLookup[] {
  const lista = listaDe(lookups, clave)

  if (lista.every((c) => typeof c.order === 'number')) {
    return [...lista].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }

  return lista
}

/** Nombre legible de un valor de catalogo. Un id sin correspondencia se muestra como tal. */
export function nombreDe (lista: EstadoLookup[], id: number): string {
  return lista.find((item) => item.id === id)?.name ?? `#${id}`
}

/**
 * Resuelve las opciones de los filtros que las sacan de `/lookups`.
 *
 * Se hace en el servidor y baja hecho: si cada tabla pidiera los catalogos por su cuenta, la pantalla
 * los pediria una vez por tabla y los filtros apareceria despues de pintar, delante de alguien que ya
 * empezo a usarlos.
 *
 * @param definicion El recurso, con sus filtros declarados.
 * @param lookups Los catalogos ya cargados.
 * @returns Un mapa indexado por `Filtro.desdeLookup`, listo para pasar a `TablaRecurso`.
 */
/**
 * Clave con la que un filtro busca su catalogo ya resuelto.
 *
 * No alcanza con `desdeLookup`: un mismo catalogo se usa de dos maneras —el Asignado va por id de
 * persona y el Seguidor por su nombre— y con una sola clave el segundo pisaria las opciones del
 * primero.
 *
 * @param filtro El filtro, con su origen declarado.
 * @returns La clave del mapa de opciones, o cadena vacia si el filtro no saca opciones de un catalogo.
 */
export function claveDeCatalogo (filtro: Filtro): string {
  if (filtro.desdeLookup === undefined) return ''

  return filtro.valorPorNombre === true ? `${filtro.desdeLookup}:nombre` : filtro.desdeLookup
}

export function opcionesDeFiltros<T> (
  definicion: DefinicionRecurso<T>,
  lookups: Lookups
): Record<string, OpcionFiltro[]> {
  const mapa: Record<string, OpcionFiltro[]> = {}

  for (const filtro of definicion.filtros) {
    const clave = claveDeCatalogo(filtro)

    if (clave === '' || mapa[clave] !== undefined) continue

    const lista = listaDe(lookups, filtro.desdeLookup as string).map((item) => ({
      valor: filtro.valorPorNombre === true ? item.name : String(item.id),
      etiqueta: item.name,
      ...(item.color === undefined ? {} : { color: item.color })
    }))

    // Por nombre, el catalogo casi siempre repite: `task_types` trae una fila por Espacio y el
    // equipo tiene homonimos. Dos opciones con el mismo valor son la misma pregunta escrita dos
    // veces, y ademas rompen la clave de React.
    mapa[clave] = filtro.valorPorNombre === true ? sinRepetidos(lista) : lista
  }

  return mapa
}

/**
 * Valor del filtro de Espacio que pide los Procesos que no cuelgan de ninguno.
 *
 * Es el valor sintetico que entiende la API (`filter[project_id]=ninguno`), no un id: un Espacio con
 * id `0` no existe, y mandar `0` o vacio devolvia cero filas sin decir por que. Los demas valores del
 * filtro son ids numericos, asi que no colisiona con ninguno.
 */
export const SIN_ESPACIO = 'ninguno'

/**
 * Opciones del filtro por Espacio de un listado de Procesos.
 *
 * "Sin proyecto" va primera porque es la unica opcion que no se puede alcanzar de otra forma: las
 * tareas sin Espacio estan en la lista pero repartidas entre las ultimas paginas, y hasta que este
 * filtro existio no habia manera de pedirlas para asignarles uno con "Agregar a proyecto".
 *
 * Vive aca y no en cada pagina porque las tres vistas de Procesos —tabla, tablero y calendario—
 * arman este mismo catalogo, y una copia que se desincronice deja una vista filtrando distinto que
 * las otras.
 *
 * A diferencia de `opcionesDeFiltroDeHito`, un catalogo vacio NO deja el desplegable vacio: "Sin
 * proyecto" sigue siendo una pregunta que se puede contestar aunque no haya ningun Espacio a la
 * vista.
 *
 * @param espacios Los Espacios visibles, tal como los devuelve `GET /projects`.
 * @returns Las opciones para `ControlesTabla`, con "Sin proyecto" al frente.
 */
export function opcionesDeFiltroDeEspacio (espacios: Array<{ id: number, name: string }>): OpcionFiltro[] {
  return [
    { valor: SIN_ESPACIO, etiqueta: `Sin ${GLOSARIO.espacio.singular.toLowerCase()}` },
    ...espacios.map((espacio) => ({ valor: String(espacio.id), etiqueta: espacio.name }))
  ]
}

/** Deja una sola opcion por valor, conservando el orden en que llegaron. */
function sinRepetidos (opciones: OpcionFiltro[]): OpcionFiltro[] {
  const vistos = new Set<string>()

  return opciones.filter((opcion) => {
    if (opcion.valor === '' || vistos.has(opcion.valor)) return false

    vistos.add(opcion.valor)

    return true
  })
}
