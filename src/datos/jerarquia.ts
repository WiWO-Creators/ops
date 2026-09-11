/**
 * El árbol de dependencias del equipo (`GET /jerarquia`).
 *
 * Módulo propio y no un bloque más en `recursos.ts` por lo mismo que `datos/live.ts`: lo consume una
 * sola pantalla y tiene su propia forma. La fuente es `modules/api/Escritura/Jerarquia.php`.
 *
 * **La jerarquía es por área, no persona a persona.** El jefe de alguien es quien dirige el área que
 * lleva puesta; sus subordinados directos son la gente de las áreas que dirige. No hay tabla de
 * "jefe de una persona" y no hace falta: se deriva. El porqué está en el docblock de la clase PHP.
 */

/**
 * Una persona en el árbol: lo mínimo para dibujarla y moverla.
 *
 * Sin `area_id`: en `areas[].personas` lo dice el área que la contiene y en `sin_area` es `null` por
 * definición, así que emitirlo sería un segundo lugar donde el mismo hecho puede quedar desfasado.
 */
export interface PersonaDelArbol {
  id: number
  full_name: string
  active: boolean
}

/** Un área con su lugar en el árbol y su gente. */
export interface AreaDelArbol {
  id: number
  name: string
  /** De qué área cuelga. `null` es una raíz del organigrama. */
  area_superior_id: number | null
  /** Quién la dirige. `null` es un área sin jefatura: su gente no reporta a nadie. */
  jefe_staffid: number | null
  /** Si quien mira puede moverla. La API ya lo resolvió; la pantalla no lo vuelve a decidir. */
  editable: boolean
  personas: PersonaDelArbol[]
}

/** Respuesta de `GET /jerarquia`. */
export interface ArbolDeJerarquia {
  /** `false` en una instalación sin las columnas del árbol: no hay nada que configurar todavía. */
  hay_organigrama: boolean
  /** Administra el sistema: ve el organigrama entero y puede crear áreas. */
  es_admin: boolean
  areas: AreaDelArbol[]
  /** Gente activa sin área. Es el trabajo pendiente que la pantalla existe para que alguien haga. */
  sin_area: PersonaDelArbol[]
  /** Catálogo de personas activas para los selectores de jefatura y de destino. */
  asignables: PersonaDelArbol[]
}

/** Un área con sus hijas ya colgadas, para pintar el árbol sin recorrerlo en cada fila. */
export interface NodoDelArbol {
  area: AreaDelArbol
  hijas: NodoDelArbol[]
}

/**
 * Arma el bosque a partir de la lista plana de áreas.
 *
 * Una jefatura recibe sólo su rama, así que la raíz de lo que ve puede tener `area_superior_id`
 * apuntando a un área que no está en la lista: esas cuelgan del bosque como raíces igual, porque si
 * no, no se dibujarían.
 *
 * **Un ciclo en los datos no puede llegar al árbol.** La API lo rechaza al escribir, pero puede
 * quedar uno de un `UPDATE` a mano, y un árbol con un ciclo hace que el componente que se dibuja a
 * sí mismo por cada hija no termine nunca: pestaña colgada, sin error y sin pantalla. Por eso cada
 * área que forma parte de un ciclo se corta de su superior y se dibuja como raíz: se ve, se puede
 * arreglar, y no hay forma de bajar dos veces por el mismo nodo.
 *
 * @param areas las áreas planas tal como vienen de `GET /jerarquia`
 * @returns las raíces, cada una con sus hijas, en el orden en que venían
 */
export function armarArbol (areas: AreaDelArbol[]): NodoDelArbol[] {
  const nodos = new Map<number, NodoDelArbol>(
    areas.map((area) => [area.id, { area, hijas: [] }])
  )

  // El superior efectivo: `undefined` si no vino, si apunta a sí misma o si no está en la lista.
  const padreDe = new Map<number, number | undefined>()
  for (const area of areas) {
    const superior = area.area_superior_id
    padreDe.set(
      area.id,
      superior !== null && superior !== area.id && nodos.has(superior) ? superior : undefined
    )
  }

  const raices: NodoDelArbol[] = []

  for (const area of areas) {
    const nodo = nodos.get(area.id)
    if (nodo === undefined) continue

    const padre = padreDe.get(area.id)
    const padreNodo = padre === undefined ? undefined : nodos.get(padre)

    if (padreNodo === undefined || vuelveASiMisma(area.id, padreDe)) {
      raices.push(nodo)
      continue
    }

    padreNodo.hijas.push(nodo)
  }

  return raices
}

/**
 * Si subir por los superiores desde esta área vuelve a ella: está dentro de un ciclo.
 *
 * Lleva el conjunto de lo ya visto, así que termina también cuando la cadena entra en un ciclo del
 * que esta área no forma parte.
 *
 * @param id el área desde la que se sube
 * @param padreDe el superior efectivo de cada área
 */
function vuelveASiMisma (id: number, padreDe: Map<number, number | undefined>): boolean {
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
 * Las áreas que no pueden ser el superior de otra sin dejar un ciclo: ella misma y su descendencia.
 *
 * Espeja `Escritura\Jerarquia::exigirSinCiclo()`, que es la que manda: esto sólo evita ofrecer en el
 * selector una opción que la API va a rechazar con un 422.
 *
 * Pide lo mínimo que necesita —el id y el superior— y no el `AreaDelArbol` entero: el panel de
 * accesos administra las mismas áreas con otra forma (`AreaDeAccesos`), y la regla del ciclo es una
 * sola. Con el tipo ancho las dos pantallas la comparten en vez de tener cada una su copia.
 *
 * @param areas las áreas planas
 * @param id el área que se está editando
 * @returns los ids que hay que esconder del selector de área superior
 */
export function areasProhibidasComoSuperior (
  areas: Array<Pick<AreaDelArbol, 'id' | 'area_superior_id'>>,
  id: number
): Set<number> {
  const prohibidas = new Set<number>([id])

  // Por niveles, como el recorrido de la API. Se corta cuando una pasada no agrega nada, así que un
  // ciclo en los datos termina igual en vez de colgar la pestaña.
  let crecio = true
  while (crecio) {
    crecio = false
    for (const area of areas) {
      if (area.area_superior_id === null) continue
      if (prohibidas.has(area.id)) continue
      if (!prohibidas.has(area.area_superior_id)) continue

      prohibidas.add(area.id)
      crecio = true
    }
  }

  return prohibidas
}
