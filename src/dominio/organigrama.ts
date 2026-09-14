/**
 * La lógica del organigrama: armar el árbol de un área, saber qué jefes se pueden ofrecer y qué
 * color le toca a cada área.
 *
 * Vive en un `.ts` y no dentro del componente por la regla de `docs/convenciones.md`: Node despoja
 * los tipos de un `.ts` pero no el JSX, así que sólo lo que está fuera del componente se puede
 * probar. Y esto es justamente lo que hay que poder probar: un árbol mal armado se ve raro, pero un
 * selector de jefes que ofrece a un subordinado propio termina en un 422 que nadie se explica.
 *
 * **Acá no se decide quién ve qué.** Eso ya lo resolvió la API antes de mandar los datos.
 */
import type { AreaDelOrganigrama, Organigrama, PersonaDelOrganigrama } from '../datos/organigrama.ts'

/** Un nodo del árbol de personas: quién es, quién cuelga de ella y si es del área que se mira. */
export interface NodoPersona {
  persona: PersonaDelOrganigrama
  hijos: NodoPersona[]
  /**
   * `true` cuando la persona **no** es del área que se está mirando y aparece sólo como enganche:
   * es el jefe de otra área del que cuelga alguien de acá.
   *
   * La caja se dibuja igual, con el color de SU área, que es exactamente lo que hace visible que la
   * rama sale del área. Se marca para poder decirlo también con palabras y no sólo con el color.
   */
  ajeno: boolean
}

/** Cuántos colores tiene la paleta de áreas (`--grafico-1` … `--grafico-8` de `neo-tokens.css`). */
const COLORES_DE_AREA = 8

/**
 * El color con el que se pinta un área, como variable CSS lista para usar.
 *
 * Se deriva del id y no de la posición en la lista, para que un área conserve su color aunque cambie
 * lo que se ve alrededor: si dependiera del orden, entrar como otra persona repintaría el mapa
 * entero y el color dejaría de servir para reconocer un área de un vistazo.
 *
 * No es una clave única: con más de ocho áreas dos comparten color. El color orienta; el nombre, que
 * siempre está escrito al lado, identifica.
 *
 * Usa los tokens **crudos** —`--grafico-N`, `--linea-fuerte`— y no los `--color-*` del tema de
 * Tailwind. No es un detalle: el bloque del tema es `@theme inline`, que resuelve los valores dentro
 * de cada utilidad y **no publica las variables en `:root`**. Un `var(--color-grafico-4)` en un
 * `style` no resuelve a nada y el borde cae al color heredado: todas las cajas terminan del mismo
 * color y la pieza que este organigrama existe para mostrar desaparece sin ningún error.
 *
 * Los crudos ya vienen con `light-dark()`, así que el color sigue al tema solo.
 *
 * @param areaId el área, o `null` para el grupo "Sin área"
 * @returns la expresión CSS del color, o el token de línea para quien no tiene área
 */
export function colorDeArea (areaId: number | null): string {
  if (areaId === null) return 'var(--linea-fuerte)'

  return `var(--grafico-${(Math.abs(areaId) % COLORES_DE_AREA) + 1})`
}

/**
 * Los ids de quienes cuelgan de una persona, a cualquier profundidad. Sin el propio.
 *
 * @param personas el listado plano que mandó la API
 * @param staffid la raíz de la rama
 * @returns el conjunto de descendientes
 */
export function descendenciaDe (personas: PersonaDelOrganigrama[], staffid: number): Set<number> {
  const dentro = new Set<number>()
  let crecio = true

  // Barridos sucesivos sobre la lista plana en vez de recursión: un `jefe_staffid` ya ciclado en la
  // base termina igual en vez de desbordar la pila.
  while (crecio) {
    crecio = false

    for (const persona of personas) {
      const jefe = persona.jefe_staffid

      if (jefe === null || dentro.has(persona.staffid) || persona.staffid === staffid) continue
      if (jefe === staffid || dentro.has(jefe)) {
        dentro.add(persona.staffid)
        crecio = true
      }
    }
  }

  return dentro
}

/**
 * Las personas que se le pueden ofrecer como jefe a alguien.
 *
 * Saca a la propia persona y a toda su descendencia: colgarla ahí sería el ciclo que la API rechaza
 * con un 422, y ofrecerlo para después explicar que no se puede es hacerle perder un viaje a quien
 * completa el formulario. La API igual lo revisa —el árbol puede haber cambiado en otra pestaña—, y
 * cuando contesta 422 la pantalla muestra su mensaje tal cual.
 *
 * @param personas el listado plano que mandó la API
 * @param staffid la persona que se está moviendo
 * @returns las candidatas, ordenadas por nombre
 */
export function jefesElegibles (
  personas: PersonaDelOrganigrama[], staffid: number
): PersonaDelOrganigrama[] {
  const propias = descendenciaDe(personas, staffid)

  return personas
    .filter((persona) => persona.staffid !== staffid && !propias.has(persona.staffid))
    .sort((una, otra) => una.nombre.localeCompare(otra.nombre, 'es'))
}

/**
 * Arma el árbol que se dibuja al entrar en un área.
 *
 * Tres reglas, y cada una tapa un agujero distinto:
 *
 * 1. **La gente del área.** Es lo que se viene a ver.
 * 2. **Todo lo que cuelga de ella**, sea del área que sea. Cortar la rama en el borde del área
 *    dejaría jefaturas dibujadas como hojas cuando en realidad conducen gente.
 * 3. **El jefe directo de quien no tiene jefe adentro**, como enganche. Es lo que hace visible que
 *    alguien de esta área reporta a otra: su caja aparece con el color de SU área, arriba del todo.
 *
 * Las raíces son los nodos cuyo jefe no quedó en el conjunto. Un ciclo ya guardado en la base no
 * cuelga el recorrido: cada persona entra en el árbol una sola vez y la que quede sin padre visible
 * se promueve a raíz, que es como se ve y se arregla.
 *
 * @param personas el listado plano que mandó la API
 * @param areaId el área que se está mirando, o `null` para el grupo "Sin área"
 * @returns las raíces, ordenadas por nombre, con sus hijos anidados y ordenados igual
 */
export function arbolDelArea (
  personas: PersonaDelOrganigrama[], areaId: number | null
): NodoPersona[] {
  const porId = new Map(personas.map((persona) => [persona.staffid, persona]))
  const delArea = personas.filter((persona) => persona.area_id === areaId)
  const dentro = new Map<number, boolean>(delArea.map((persona) => [persona.staffid, false]))

  for (const persona of delArea) {
    for (const id of descendenciaDe(personas, persona.staffid)) {
      if (!dentro.has(id)) dentro.set(id, porId.get(id)?.area_id !== areaId)
    }
  }

  // Los enganches van al final: colgar de alguien que ya entró por la rama no agrega una caja, y
  // mirarlo antes de completar el conjunto marcaría como ajeno a quien sí estaba adentro.
  for (const persona of [...dentro.keys()].map((id) => porId.get(id)).filter((p) => p !== undefined)) {
    const jefe = persona.jefe_staffid

    if (jefe !== null && !dentro.has(jefe) && porId.has(jefe)) dentro.set(jefe, true)
  }

  const nodos = new Map<number, NodoPersona>()

  for (const [id, ajeno] of dentro) {
    const persona = porId.get(id)

    if (persona !== undefined) nodos.set(id, { persona, hijos: [], ajeno })
  }

  const raices: NodoPersona[] = []

  for (const nodo of nodos.values()) {
    const padre = nodo.persona.jefe_staffid === null ? undefined : nodos.get(nodo.persona.jefe_staffid)

    if (padre === undefined || padre === nodo || estaEnUnCiclo(nodo, nodos)) raices.push(nodo)
    else padre.hijos.push(nodo)
  }

  ordenarRama(raices)

  return raices
}

/**
 * Si subir por los jefes desde este nodo vuelve a él: está dentro de un ciclo.
 *
 * La API lo rechaza al escribir, pero puede quedar uno de un `UPDATE` a mano, y un ciclo entero sin
 * raíz desaparecería del dibujo en vez de verse. Promovido a raíz, se ve y se puede arreglar.
 *
 * @param nodo el nodo desde el que se sube
 * @param nodos todos los nodos del árbol, por id
 * @returns `true` si el nodo forma parte de un ciclo
 */
function estaEnUnCiclo (nodo: NodoPersona, nodos: Map<number, NodoPersona>): boolean {
  const vistos = new Set<number>([nodo.persona.staffid])
  let actual = nodo.persona.jefe_staffid === null ? undefined : nodos.get(nodo.persona.jefe_staffid)

  while (actual !== undefined) {
    if (actual === nodo) return true
    if (vistos.has(actual.persona.staffid)) return false

    vistos.add(actual.persona.staffid)
    actual = actual.persona.jefe_staffid === null ? undefined : nodos.get(actual.persona.jefe_staffid)
  }

  return false
}

/**
 * Ordena una rama por nombre y sigue hacia abajo.
 *
 * Muta los nodos a propósito: son objetos recién creados por `arbolDelArea` y nadie más los tiene.
 *
 * @param rama los nodos hermanos de un mismo nivel
 */
function ordenarRama (rama: NodoPersona[]): void {
  rama.sort((uno, otro) => uno.persona.nombre.localeCompare(otro.persona.nombre, 'es'))

  for (const nodo of rama) ordenarRama(nodo.hijos)
}

/**
 * Cuántas cajas tiene un árbol ya armado.
 *
 * La cuenta de la tarjeta dice cuánta gente **del área** hay; ésta dice cuántas cajas se van a
 * dibujar, que incluye los enganches y las ramas que salen del área. Son números distintos a
 * propósito y por eso se calculan aparte.
 *
 * @param raices las raíces que devolvió `arbolDelArea`
 * @returns el total de nodos
 */
export function cuantasCajas (raices: NodoPersona[]): number {
  return raices.reduce((total, nodo) => total + 1 + cuantasCajas(nodo.hijos), 0)
}

/**
 * Las áreas del mapa, ordenadas como se leen: primero las de quien mira, después por nombre.
 *
 * Poner la propia arriba no es decoración: quien entra viene casi siempre a mirar la suya, y con
 * diecisiete tarjetas encontrarla por orden alfabético es un rastreo.
 *
 * @param organigrama la respuesta de la API
 * @returns las áreas ordenadas
 */
export function areasDelMapa (organigrama: Organigrama): AreaDelOrganigrama[] {
  const propias = new Set(organigrama.yo.areas)

  return [...organigrama.areas].sort((una, otra) => {
    const pesoUna = propias.has(una.id) ? 0 : 1
    const pesoOtra = propias.has(otra.id) ? 0 : 1

    if (pesoUna !== pesoOtra) return pesoUna - pesoOtra

    return una.nombre.localeCompare(otra.nombre, 'es')
  })
}

/**
 * Cuánta gente quedó sin área, que es la tarjeta que no se puede esconder.
 *
 * @param organigrama la respuesta de la API
 * @returns cuántas personas visibles no tienen área
 */
export function cuantosSinArea (organigrama: Organigrama): number {
  return organigrama.personas.filter((persona) => persona.area_id === null).length
}
