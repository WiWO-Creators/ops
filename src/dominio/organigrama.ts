import type { AreaDelEquipo } from '../datos/recursos.ts'

/**
 * Un área ya ubicada en el árbol.
 *
 * `alcance` es la razón de ser de la pantalla: quien dirige un área ve en «En vivo» a su gente y a
 * la de todas las áreas que cuelgan de la suya, así que es ese número —y no el de su propia gente—
 * el que responde "¿a cuánta gente ve esta persona?".
 */
export interface NodoArea {
  area: AreaDelEquipo
  hijas: NodoArea[]
  /** Profundidad en el árbol. `0` son las raíces. */
  nivel: number
  /** Gente de esta área más la de todas las que cuelgan de ella, a cualquier profundidad. */
  alcance: number
}

/** La gente propia de un área, sin la de las que cuelgan. */
function cuantosEn (area: AreaDelEquipo): number {
  return area.personas.length
}

/**
 * Arma el árbol de áreas a partir del listado plano de la API.
 *
 * `GET /jerarquia` devuelve filas sueltas con `area_superior_id`; anidarlas es trabajo de la
 * pantalla.
 *
 * Dos casos que **no** se descartan, porque descartarlos escondería áreas que existen y dejaría a su
 * gente invisible sin que nadie se entere:
 *
 *  - Un área cuyo `area_superior_id` apunta a otra que no vino en el listado (porque la borraron
 *    entre dos peticiones) se dibuja como raíz.
 *  - Un ciclo en los datos —A cuelga de B y B de A— también se rompe dibujando esas áreas como
 *    raíces, en vez de colgarse en un recorrido infinito.
 *
 * @param areas el listado plano tal como llega de la API
 * @returns las raíces, ordenadas por nombre, con sus hijas anidadas y ordenadas igual
 */
export function construirArbol (areas: AreaDelEquipo[]): NodoArea[] {
  const porId = new Map(areas.map((area) => [area.id, area]))
  const nodos = new Map<number, NodoArea>(
    areas.map((area) => [area.id, { area, hijas: [], nivel: 0, alcance: cuantosEn(area) }])
  )
  const raices: NodoArea[] = []

  for (const area of areas) {
    const nodo = nodos.get(area.id)
    const padre = area.area_superior_id === null ? undefined : nodos.get(area.area_superior_id)

    if (nodo === undefined) continue

    if (padre === undefined || !cuelgaDeUnaRaiz(porId, area)) raices.push(nodo)
    else padre.hijas.push(nodo)
  }

  ordenarRama(raices, 0)

  return raices
}

/**
 * `true` si subiendo por `area_superior_id` se llega a una raíz sin repetir ninguna.
 *
 * Devuelve `false` tanto para un ciclo como para un área cuyo superior no está en el listado: los
 * dos casos terminan igual —esa área se dibuja como raíz— y por eso no hace falta distinguirlos.
 */
function cuelgaDeUnaRaiz (porId: Map<number, AreaDelEquipo>, area: AreaDelEquipo): boolean {
  const vistas = new Set<number>([area.id])
  let actual = area

  while (actual.area_superior_id !== null) {
    const padre = porId.get(actual.area_superior_id)

    if (padre === undefined || vistas.has(padre.id)) return false

    vistas.add(padre.id)
    actual = padre
  }

  return true
}

/**
 * Ordena una rama por nombre, le fija el nivel y acumula el alcance hacia arriba.
 *
 * Muta los nodos a propósito: son objetos recién creados por `construirArbol` y nadie más los tiene.
 *
 * @param rama los nodos hermanos de un mismo nivel
 * @param nivel la profundidad que les corresponde
 * @returns la gente que suman entre todos, con sus descendientes
 */
function ordenarRama (rama: NodoArea[], nivel: number): number {
  rama.sort((una, otra) => una.area.name.localeCompare(otra.area.name, 'es'))

  let total = 0

  for (const nodo of rama) {
    nodo.nivel = nivel
    nodo.alcance = cuantosEn(nodo.area) + ordenarRama(nodo.hijas, nivel + 1)
    total += nodo.alcance
  }

  return total
}

/**
 * Recorre el árbol en profundidad y devuelve los nodos en el orden en que se dibujan.
 *
 * @param raices las raíces que devolvió `construirArbol`
 * @returns un nodo por área, cada uno con su `nivel` para indentarlo
 */
export function aplanarArbol (raices: NodoArea[]): NodoArea[] {
  return raices.flatMap((nodo) => [nodo, ...aplanarArbol(nodo.hijas)])
}

/**
 * Los ids de un área y de todo lo que cuelga de ella, a cualquier profundidad.
 *
 * @param areas el listado plano
 * @param id el área de la que se parte
 * @returns el conjunto, con el id propio incluido
 */
export function descendenciaDe (areas: AreaDelEquipo[], id: number): Set<number> {
  const dentro = new Set([id])
  let crecio = true

  // Barridos sucesivos sobre la lista plana en vez de recursión sobre el árbol: así un ciclo ya
  // guardado en la base termina igual en vez de desbordar la pila.
  while (crecio) {
    crecio = false

    for (const area of areas) {
      if (area.area_superior_id !== null && dentro.has(area.area_superior_id) && !dentro.has(area.id)) {
        dentro.add(area.id)
        crecio = true
      }
    }
  }

  return dentro
}

/**
 * Las áreas que pueden ser el superior de otra, en el orden del árbol y con su nivel.
 *
 * Saca del selector el área que se está editando y todo lo que cuelga de ella: colgarla ahí sería
 * el `ciclo` que la API rechaza con un 422, y ofrecerlo para después explicar que no se puede es
 * hacerle perder un viaje a quien completa el formulario.
 *
 * @param areas el listado plano
 * @param idEditada el área que se está editando, o `null` en un alta (donde todas sirven)
 * @returns los nodos elegibles, ya ordenados y con `nivel` para indentar la opción
 */
export function areasElegiblesComoSuperior (areas: AreaDelEquipo[], idEditada: number | null): NodoArea[] {
  const prohibidas = idEditada === null ? new Set<number>() : descendenciaDe(areas, idEditada)

  return aplanarArbol(construirArbol(areas)).filter((nodo) => !prohibidas.has(nodo.area.id))
}

/**
 * Lo que la pantalla ya sabe que retiene a un área, para anticiparlo antes de intentar borrarla.
 *
 * Son dos de las tres cuentas que mira la API: la gente asignada y las áreas que cuelgan. **La
 * tercera no se puede saber desde acá** —cuántos Procesos están marcados con ese nombre— y es
 * justamente la que sorprende: un área puede verse vacía en el árbol y aun así no poder borrarse.
 * Por eso el diálogo avisa de las dos que conoce y advierte de la tercera, en vez de prometer que se
 * va a poder.
 *
 * @param nodo el área a borrar, ya ubicada en el árbol
 * @returns la frase con lo que la retiene, o `null` si por lo que se ve está libre
 */
export function loQueRetieneElArea (nodo: NodoArea): string | null {
  const partes: string[] = []

  if (nodo.area.personas.length > 0) {
    partes.push(nodo.area.personas.length === 1
      ? '1 persona asignada'
      : `${nodo.area.personas.length} personas asignadas`)
  }

  if (nodo.hijas.length > 0) {
    partes.push(nodo.hijas.length === 1 ? '1 área que cuelga de ella' : `${nodo.hijas.length} áreas que cuelgan de ella`)
  }

  return partes.length === 0 ? null : partes.join(' y ')
}
