import type { AreaDelEquipo } from '../datos/jerarquia.ts'

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

/**
 * La gente propia de un área que sigue en el equipo, sin la de las que cuelgan.
 *
 * Las bajas se descuentan: `areas[].personas` **no** las filtra —la API consulta por `area_id` y
 * nada más— y contarlas haría que un área diga "3 personas" donde solo trabajan 2, y que el alcance
 * prometa gente que ya no está.
 */
export function cuantosEn (area: AreaDelEquipo): number {
  return area.personas.filter((persona) => persona.active).length
}

/**
 * Arma el árbol de áreas a partir del listado plano de la API.
 *
 * `GET /jerarquia` devuelve filas sueltas con `area_superior_id`; anidarlas es trabajo de la
 * pantalla.
 *
 * La pieza fina es el **superior efectivo**: el `area_superior_id` de una fila sirve solo si esa área
 * vino en el listado y no es ella misma. Sin esa distinción se rompe el caso más común de todos —el
 * de cualquiera que no administre—, porque la API le manda **solo su rama**, y la raíz de esa rama
 * cuelga de un área que no le llegó. Subiendo la cadena entera hasta encontrar el hueco se
 * promovería a raíz también a las hijas, y la jefatura vería su organigrama plano: sin sangría, sin
 * niveles y sin el "ve a N con lo que cuelga", que es justamente lo que la pantalla existe para
 * mostrar. Cortando solo el eslabón roto, la estructura de abajo queda intacta.
 *
 * Un ciclo se corta igual de fino. La API lo rechaza al escribir, pero puede quedar uno de un
 * `UPDATE` a mano, y un árbol con un ciclo no termina de recorrerse nunca. Se promueve a raíz cada
 * área que forma parte del ciclo —y solo esas, no las que cuelgan de ellas— para que se vea y se
 * pueda arreglar.
 *
 * @param areas el listado plano tal como llega de la API
 * @returns las raíces, ordenadas por nombre, con sus hijas anidadas y ordenadas igual
 */
export function construirArbol (areas: AreaDelEquipo[]): NodoArea[] {
  const nodos = new Map<number, NodoArea>(
    areas.map((area) => [area.id, { area, hijas: [], nivel: 0, alcance: cuantosEn(area) }])
  )

  // El superior efectivo de cada área: `undefined` si no vino, si apunta a sí misma o si no está en
  // el listado. Es lo único que se mira de acá en adelante.
  const padreDe = new Map<number, number | undefined>(areas.map((area) => {
    const superior = area.area_superior_id

    return [area.id, superior !== null && superior !== area.id && nodos.has(superior) ? superior : undefined]
  }))

  const raices: NodoArea[] = []

  for (const area of areas) {
    const nodo = nodos.get(area.id)

    if (nodo === undefined) continue

    const padreNodo = nodos.get(padreDe.get(area.id) ?? -1)

    if (padreNodo === undefined || estaEnUnCiclo(area.id, padreDe)) raices.push(nodo)
    else padreNodo.hijas.push(nodo)
  }

  ordenarRama(raices, 0)

  return raices
}

/**
 * Si subir por los superiores desde esta área vuelve a ella: está dentro de un ciclo.
 *
 * Lleva el conjunto de lo ya visto, así que termina también cuando la cadena entra en un ciclo del
 * que esta área **no** forma parte — y ahí devuelve `false`, porque el área de abajo no tiene la
 * culpa y arrancarla de su lugar sería aplanar de más.
 *
 * @param id el área desde la que se sube
 * @param padreDe el superior efectivo de cada área
 */
function estaEnUnCiclo (id: number, padreDe: Map<number, number | undefined>): boolean {
  const vistas = new Set<number>([id])
  let actual = padreDe.get(id)

  while (actual !== undefined) {
    if (actual === id) return true
    if (vistas.has(actual)) return false

    vistas.add(actual)
    actual = padreDe.get(actual)
  }

  return false
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
export function descendenciaDe (areas: Array<Pick<AreaDelEquipo, 'id' | 'area_superior_id'>>, id: number): Set<number> {
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
 * Cuántas áreas todavía no tienen quién las dirija.
 *
 * Un área sin jefatura es el fallo silencioso que la pantalla existe para evitar: su gente no reporta
 * a nadie y no aparece en el tablero de ninguna jefatura. Por fila se ve una a una; el total es lo
 * que hace que con veinte áreas alguien se entere.
 *
 * @param areas el listado plano
 * @returns cuántas están sin jefatura
 */
export function areasSinJefatura (areas: AreaDelEquipo[]): number {
  return areas.filter((area) => area.jefe_staffid === null).length
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

  const gente = cuantosEn(nodo.area)

  if (gente > 0) partes.push(gente === 1 ? '1 persona asignada' : `${gente} personas asignadas`)

  if (nodo.hijas.length > 0) {
    partes.push(nodo.hijas.length === 1 ? '1 área que cuelga de ella' : `${nodo.hijas.length} áreas que cuelgan de ella`)
  }

  return partes.length === 0 ? null : partes.join(' y ')
}
