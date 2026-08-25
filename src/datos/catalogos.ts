import type { EstadoLookup, Lookups } from './recursos.ts'
import type { DefinicionRecurso, OpcionFiltro } from '../definiciones/tipos.ts'

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
export function opcionesDeFiltros<T> (
  definicion: DefinicionRecurso<T>,
  lookups: Lookups
): Record<string, OpcionFiltro[]> {
  const mapa: Record<string, OpcionFiltro[]> = {}

  for (const filtro of definicion.filtros) {
    if (filtro.desdeLookup === undefined || mapa[filtro.desdeLookup] !== undefined) continue

    mapa[filtro.desdeLookup] = listaDe(lookups, filtro.desdeLookup).map((item) => ({
      valor: String(item.id),
      etiqueta: item.name,
      ...(item.color === undefined ? {} : { color: item.color })
    }))
  }

  return mapa
}
