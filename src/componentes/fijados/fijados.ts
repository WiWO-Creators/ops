/**
 * Fijados y recientes: la forma que devuelve la API y las reglas puras que los usan.
 *
 * La API (`/me/fijados`, `/me/recientes`; migracion `0900` de wiwo-board) ya devuelve solo lo que la
 * persona puede ver: un Proyecto que dejo de ver no llega aunque siga fijado. Nada de esto vuelve a
 * preguntar permisos; solo ordena y arma enlaces.
 */

/** Lo que se puede fijar, con el vocabulario de la API. */
export type TipoFijable = 'project' | 'client'

export interface ElementoPersonal {
  type: TipoFijable
  id: number
  name: string
  /** El cliente de un Proyecto; `null` en un Cliente o en un Proyecto sin cliente. */
  client: { id: number, company: string } | null
}

export interface Fijado extends ElementoPersonal {
  position: number
}

export interface Reciente extends ElementoPersonal {
  viewed_at: string | null
}

/**
 * La ficha a la que lleva un elemento.
 *
 * @param elemento Proyecto o Cliente
 * @returns la ruta del panel
 */
export function hrefDeElemento (elemento: Pick<ElementoPersonal, 'type' | 'id'>): string {
  return elemento.type === 'project' ? `/proyectos/${elemento.id}` : `/clientes/${elemento.id}`
}

/**
 * Clave unica de un elemento, para `key` de React y para comparar.
 *
 * @param elemento Proyecto o Cliente
 * @returns `project:12`, `client:4`
 */
export function claveDeElemento (elemento: Pick<ElementoPersonal, 'type' | 'id'>): string {
  return `${elemento.type}:${elemento.id}`
}

/**
 * Si un elemento esta entre los fijados.
 *
 * @param fijados la lista vigente
 * @param tipo tipo del elemento
 * @param id id del elemento
 * @returns `true` si esta fijado
 */
export function estaFijado (fijados: readonly Pick<ElementoPersonal, 'type' | 'id'>[], tipo: TipoFijable, id: number): boolean {
  return fijados.some((fijado) => fijado.type === tipo && fijado.id === id)
}

/**
 * Pone los Proyectos fijados delante en "Mis proyectos", sin repetir y respetando el tope.
 *
 * Los fijados van en el orden que eligio la persona, no en el de la lista de miembro: es lo que ella
 * dijo que quiere ver primero. Un fijado que no llego en `fijadosCompletos` (la API no lo devolvio en
 * el listado, por ejemplo una Licitacion) no se inventa: se salta.
 *
 * @param propios los Proyectos de los que la persona es miembro, en su orden
 * @param fijadosCompletos los Proyectos fijados, con la forma completa del listado
 * @param orden ids de Proyecto fijados, en el orden de la persona
 * @param tope cuantas filas entran
 * @returns la lista a mostrar, con los fijados marcados
 */
export function priorizarFijados<T extends { id: number }> (
  propios: readonly T[],
  fijadosCompletos: readonly T[],
  orden: readonly number[],
  tope: number
): Array<{ espacio: T, fijado: boolean }> {
  const porId = new Map(fijadosCompletos.map((espacio) => [espacio.id, espacio]))
  const salida: Array<{ espacio: T, fijado: boolean }> = []
  const vistos = new Set<number>()

  for (const id of orden) {
    const espacio = porId.get(id)
    if (espacio === undefined || vistos.has(id)) continue
    salida.push({ espacio, fijado: true })
    vistos.add(id)
  }

  for (const espacio of propios) {
    if (vistos.has(espacio.id)) continue
    salida.push({ espacio, fijado: false })
    vistos.add(espacio.id)
  }

  return salida.slice(0, Math.max(0, tope))
}
