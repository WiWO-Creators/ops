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
import { ESCALONES } from './escalon.ts'
import { normalizar } from './salas.ts'
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

/**
 * El nombre de un área, o la palabra que ocupa su lugar cuando no hay ninguna.
 *
 * Cae a `Área #id` y no a una celda en blanco: un área que la API nombra en una persona pero no
 * manda en el catálogo dejaría filas vacías sin explicación, y ver el id crudo dice qué pasó.
 *
 * @param areas el catálogo que mandó la API
 * @param id el área de la persona, o `null`
 * @returns el nombre para pintar
 */
export function nombreDeArea (areas: AreaDelOrganigrama[], id: number | null): string {
  if (id === null) return 'Sin área'

  return areas.find((una) => una.id === id)?.nombre ?? `Área #${id}`
}

/** Por qué columna se ordena la lista. */
export type ColumnaDeLista = 'persona' | 'escalon' | 'jefe' | 'area'

/** Hacia dónde ordena una columna. */
export type SentidoDeOrden = 'asc' | 'desc'

/**
 * Una fila de la vista de lista.
 *
 * Trae el jefe y el área **ya resueltos a texto** porque en la lista son datos que se leen, se
 * ordenan y se comparan entre filas; en el árbol los dice el dibujo —la línea y el color— y no hay
 * nada que escribir. Resolverlos acá y no en la celda evita recorrer el catálogo una vez por fila y
 * por repintado, que con 184 personas es la diferencia entre ordenar al instante y ordenar a saltos.
 */
export interface FilaDeLista {
  persona: PersonaDelOrganigrama
  /** Quién la conduce, o `—` si no cuelga de nadie. */
  jefe: string
  /** Su área, o `Sin área`. */
  area: string
}

/**
 * Las personas que dibuja un árbol ya armado, aplanadas y sin repetir.
 *
 * Es lo que hace que la lista sea **la otra lectura de lo mismo**: dentro de un área muestra
 * exactamente las cajas que muestra el árbol —incluidos los enganches de otra área y las ramas que
 * salen de ella—, en vez de una selección propia por `area_id` que diría otro número de gente que el
 * que se acaba de ver.
 *
 * @param raices las raíces que devolvió `arbolDelArea`
 * @returns las personas, en el orden en que el árbol las dibuja
 */
export function personasDelArbol (raices: NodoPersona[]): PersonaDelOrganigrama[] {
  const planas: PersonaDelOrganigrama[] = []

  for (const nodo of raices) planas.push(nodo.persona, ...personasDelArbol(nodo.hijos))

  return planas
}

/**
 * Arma las filas de la lista a partir de las personas que toca mostrar.
 *
 * @param personas las que se listan
 * @param personasPorId todas las visibles, para poder nombrar al jefe aunque no esté en la lista
 * @param areas el catálogo de áreas
 * @returns una fila por persona, en el mismo orden en que llegaron
 */
export function filasDeLista (
  personas: PersonaDelOrganigrama[],
  personasPorId: Map<number, PersonaDelOrganigrama>,
  areas: AreaDelOrganigrama[]
): FilaDeLista[] {
  return personas.map((persona) => ({
    persona,
    jefe: persona.jefe_staffid === null
      ? '—'
      // El jefe puede caer fuera de lo que la API mandó: se nombra por id en vez de dejar la celda
      // vacía, que se leería como "no tiene jefe" y es justo lo contrario.
      : personasPorId.get(persona.jefe_staffid)?.nombre ?? `Persona #${persona.jefe_staffid}`,
    area: nombreDeArea(areas, persona.area_id)
  }))
}

/**
 * Filtra la lista por nombre o correo.
 *
 * Busca por partes sueltas y sin acentos —"ana rios" encuentra a "Ana Ríos", y "rios ana" también—
 * porque quien busca no siempre recuerda el orden ni escribe las tildes. Reusa el `normalizar` de la
 * agenda de salas, que es el mismo que ya usa el resto del panel.
 *
 * El correo entra en la búsqueda a propósito: con homónimos en una casa de 184 personas, el correo
 * es lo único que distingue sin lugar a dudas.
 *
 * @param filas las filas a filtrar
 * @param consulta lo que se escribió; vacío devuelve todo
 * @returns las que coinciden, en el mismo orden
 */
export function filtrarFilas (filas: FilaDeLista[], consulta: string): FilaDeLista[] {
  const partes = normalizar(consulta).split(/\s+/).filter((parte) => parte !== '')

  if (partes.length === 0) return filas

  return filas.filter((fila) => {
    const donde = normalizar(`${fila.persona.nombre} ${fila.persona.correo}`)

    return partes.every((parte) => donde.includes(parte))
  })
}

/**
 * Ordena las filas por una columna.
 *
 * El escalón se ordena por la **escalera** y no por el alfabeto: alfabéticamente "Director" iría
 * antes que "Lead" y que "Staff", y una columna de jerarquía ordenada al azar no informa nada.
 *
 * Devuelve un array nuevo: las filas de entrada las tiene el componente y reordenárselas por debajo
 * dejaría a React sin forma de notar el cambio.
 *
 * @param filas las filas a ordenar
 * @param columna por cuál se ordena
 * @param sentido `asc` de menor a mayor, `desc` al revés
 * @returns las filas ordenadas
 */
export function ordenarFilas (
  filas: FilaDeLista[], columna: ColumnaDeLista, sentido: SentidoDeOrden
): FilaDeLista[] {
  const signo = sentido === 'asc' ? 1 : -1

  return [...filas].sort((una, otra) => {
    if (columna === 'escalon') {
      const diferencia = escalaDe(una.persona.escalon) - escalaDe(otra.persona.escalon)

      // Empatados en escalón se ordenan por nombre, para que dos repintados seguidos no barajen las
      // filas: `sort` es estable, pero la entrada no siempre llega en el mismo orden.
      if (diferencia !== 0) return diferencia * signo

      return una.persona.nombre.localeCompare(otra.persona.nombre, 'es')
    }

    const izquierda = columna === 'persona' ? una.persona.nombre : una[columna]
    const derecha = columna === 'persona' ? otra.persona.nombre : otra[columna]
    const diferencia = izquierda.localeCompare(derecha, 'es')

    if (diferencia !== 0) return diferencia * signo

    return una.persona.nombre.localeCompare(otra.persona.nombre, 'es')
  })
}

/**
 * El peldaño de un escalón dentro de la escalera.
 *
 * @param escalon la clave del escalón
 * @returns su posición, o `0` para una clave que la escalera no conoce
 */
function escalaDe (escalon: string): number {
  return ESCALONES.find((uno) => uno.clave === escalon)?.orden ?? 0
}

/**
 * El mapa partido en dos: las áreas que tienen gente y las que no.
 *
 * Existe porque hoy catorce de quince áreas están en cero, y una grilla que las mezcla obliga a
 * barrer quince tarjetas idénticas para dar con la única que tiene equipo. Las pobladas van
 * primero y de la más grande a la más chica —es el orden en que se busca a alguien—, y las vacías
 * quedan juntas al final, donde se pueden mirar como lo que son: una lista de áreas por poblar.
 *
 * Las áreas propias no se sacan de su grupo: un área propia sin gente sigue estando vacía, y
 * subirla al primer bloque diría que ahí hay alguien. Se marcan aparte, con la insignia.
 *
 * @param areas el catálogo ya ordenado por {@link areasDelMapa}
 * @returns los dos grupos; las entradas son las mismas, sin copiar
 */
export function partirAreasPorPoblacion (
  areas: AreaDelOrganigrama[]
): { pobladas: AreaDelOrganigrama[], vacias: AreaDelOrganigrama[] } {
  const pobladas = areas
    .filter((area) => area.personas > 0)
    .sort((una, otra) => otra.personas - una.personas || una.nombre.localeCompare(otra.nombre, 'es'))

  const vacias = areas
    .filter((area) => area.personas === 0)
    .sort((una, otra) => una.nombre.localeCompare(otra.nombre, 'es'))

  return { pobladas, vacias }
}

/** Los totales que encabezan el mapa: de cuánta casa se está hablando. */
export interface ResumenDelMapa {
  /** Cuánta gente visible hay, con área o sin ella. */
  personas: number
  /** Cuántas áreas tienen al menos una persona. */
  areasConGente: number
  /** Cuántas áreas están vacías. */
  areasVacias: number
  /** Cuánta gente no lleva ningún área puesta. */
  sinArea: number
  /** Cuántas áreas con gente no tienen a nadie dirigiéndolas. */
  sinJefatura: number
}

/**
 * Cuenta el mapa entero de una pasada.
 *
 * Las áreas vacías **no** entran en `sinJefatura`: un área sin gente tampoco tiene a quién dirigir,
 * y contarla ahí inflaría el número que se mira para saber qué falta arreglar.
 *
 * @param organigrama la respuesta de la API, ya recortada a quien mira
 * @returns los totales de la cabecera
 */
export function resumirMapa (organigrama: Organigrama): ResumenDelMapa {
  const conGente = organigrama.areas.filter((area) => area.personas > 0)

  return {
    personas: organigrama.personas.length,
    areasConGente: conGente.length,
    areasVacias: organigrama.areas.length - conGente.length,
    sinArea: cuantosSinArea(organigrama),
    sinJefatura: conGente.filter((area) => area.jefe_staffid === null).length
  }
}

/**
 * Quiénes están en un área, para dibujar sus caras en la tarjeta del mapa.
 *
 * Se ordena por escalón y después por nombre para que la jefatura y los leads salgan primero: son
 * las caras que sirven para reconocer un área de un vistazo, y las que alguien busca cuando quiere
 * saber con quién hablar.
 *
 * @param personas el listado plano que mandó la API
 * @param areaId el área, o `null` para quienes no llevan ninguna
 * @returns las personas de esa área, ordenadas
 */
export function personasDelArea (
  personas: PersonaDelOrganigrama[],
  areaId: number | null
): PersonaDelOrganigrama[] {
  return personas
    .filter((persona) => persona.area_id === areaId)
    .sort((una, otra) =>
      escalaDe(otra.escalon) - escalaDe(una.escalon) ||
      una.nombre.localeCompare(otra.nombre, 'es'))
}
