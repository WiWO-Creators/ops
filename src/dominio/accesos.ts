/**
 * Reglas del panel de accesos: lo que se puede rechazar sin ir a la API, y cómo se lee el árbol.
 *
 * Vive en un `.ts` y no dentro de los paneles por la regla de `docs/convenciones.md`: Node despoja
 * los tipos de un `.ts` pero no el JSX, así que solo lo que está fuera del componente se puede
 * probar. Y acá lo que se decide es qué cuerpo sale hacia una API que reparte permisos.
 *
 * **Nada de esto reemplaza la validación del backend.** La de verdad está allá —el ciclo en el árbol,
 * la profundidad máxima, el área en uso— y su 422 o su 409 se muestra igual. Esto evita el viaje y,
 * sobre todo, evita que un nombre vacío o un jefe imposible llegue a una pantalla que administra el
 * acceso de toda la casa.
 *
 * Los cuatro escalones no están acá: están en `dominio/escalon.ts`, que es su única lista.
 */
import type { NodoDeArbol, PersonaDeAccesos } from '../datos/accesos.ts'

/** Largo máximo de un nombre de área o de cargo. Es el de la columna más corta de la base. */
const LARGO_MAXIMO_NOMBRE = 80

/**
 * Por qué este nombre suelto —de un área o de un cargo— no se puede guardar, o `null`.
 *
 * @param nombre Lo que se escribió.
 * @param existentes Los nombres que ya están en uso, para no crear dos iguales.
 * @returns El motivo del rechazo, o `null`.
 */
export function motivoParaRechazarNombre (nombre: string, existentes: string[] = []): string | null {
  const limpio = nombre.trim()

  if (limpio === '') return 'El nombre no puede quedar vacío.'
  if (limpio.length > LARGO_MAXIMO_NOMBRE) {
    return `El nombre no puede pasar de ${LARGO_MAXIMO_NOMBRE} caracteres.`
  }

  const repetido = existentes.some((otro) => otro.trim().toLowerCase() === limpio.toLowerCase())

  return repetido ? `Ya existe «${limpio}».` : null
}

/** Si un interruptor de `tbloptions` está encendido. Solo `'1'` lo está. */
export function estaEncendido (valor: string): boolean {
  return valor === '1'
}

/**
 * La consulta del listado de personas, sin los filtros vacíos.
 *
 * Mandar `escalon=` vacío no es lo mismo que no mandarlo: la API tendría que decidir si eso significa
 * "sin escalón" o "cualquiera", y esa ambigüedad se resuelve acá no emitiendo la clave.
 *
 * @param filtros Lo que hay puesto en la barra de filtros.
 * @param pagina La página pedida, de 1 en adelante.
 * @returns La query string, con `?` delante, o cadena vacía si no hay nada que pedir.
 */
export function consultaDePersonas (
  filtros: { buscar: string, escalon: string, area: string },
  pagina: number
): string {
  const parametros = new URLSearchParams()

  if (filtros.buscar.trim() !== '') parametros.set('buscar', filtros.buscar.trim())
  if (filtros.escalon !== '') parametros.set('escalon', filtros.escalon)
  if (filtros.area !== '') parametros.set('area', filtros.area)
  if (pagina > 1) parametros.set('pagina', String(pagina))

  const texto = parametros.toString()

  return texto === '' ? '' : `?${texto}`
}

/** Un nodo del árbol ya colgado de su jefe, con la profundidad a la que quedó. */
export interface RamaDelArbol {
  nodo: NodoDeArbol
  profundidad: number
  hijas: RamaDelArbol[]
}

/**
 * Cuántos saltos admite la cadena de jefes. Es el mismo tope que aplica la API.
 *
 * Existe porque un árbol con un ciclo que la base dejó entrar colgaría el recorrido para siempre, y
 * una pantalla que no responde es peor que una que muestra el árbol cortado.
 */
export const PROFUNDIDAD_MAXIMA = 12

/**
 * Arma el árbol de personas a partir de la lista plana de `GET /accesos/arbol`.
 *
 * Es la pieza que explica la pantalla entera: sin ver de quién cuelga cada uno, nadie puede decir por
 * qué una persona ve lo que ve. El escalón solo nombra el puesto; el alcance sale de acá.
 *
 * **Nada se pierde por el camino.** Quien cuelga de un jefe que no está en la lista —una cuenta dada
 * de baja— sube a la raíz, y un grupo entero encerrado en un ciclo también: se promueve a raíz al
 * primero de ellos y el resto le cuelga debajo. Un árbol que esconde gente en silencio es exactamente
 * el problema que esta pantalla vino a resolver, y un ciclo es el caso en que más falta hace verlo.
 *
 * @param nodos La lista plana, tal como llega de la API.
 * @returns Las raíces del árbol, cada una con su descendencia, ordenadas por nombre.
 */
export function arbolDePersonas (nodos: NodoDeArbol[]): RamaDelArbol[] {
  const porId = new Map(nodos.map((nodo) => [nodo.staffid, nodo]))
  const hijasDe = new Map<number, NodoDeArbol[]>()
  const raices: NodoDeArbol[] = []

  for (const nodo of nodos) {
    const jefe = nodo.jefe_staffid

    if (jefe === null || jefe === nodo.staffid || !porId.has(jefe)) {
      raices.push(nodo)
      continue
    }

    const hermanas = hijasDe.get(jefe) ?? []

    hermanas.push(nodo)
    hijasDe.set(jefe, hermanas)
  }

  const colgados = new Set<number>()

  /** Cuelga a las hijas de un nodo, cortando en cuanto la cadena se repite o se pasa del tope. */
  function colgar (nodo: NodoDeArbol, profundidad: number, vistos: Set<number>): RamaDelArbol {
    colgados.add(nodo.staffid)

    const hijas = profundidad >= PROFUNDIDAD_MAXIMA
      ? []
      : (hijasDe.get(nodo.staffid) ?? [])
          .filter((hija) => !vistos.has(hija.staffid))
          .sort((una, otra) => una.nombre.localeCompare(otra.nombre))
          .map((hija) => colgar(hija, profundidad + 1, new Set([...vistos, hija.staffid])))

    return { nodo, profundidad, hijas }
  }

  const arbol = raices
    .sort((una, otra) => una.nombre.localeCompare(otra.nombre))
    .map((raiz) => colgar(raiz, 0, new Set([raiz.staffid])))

  // Lo que quedó sin colgar de ninguna raíz está encerrado en un ciclo: la cadena de jefes se muerde
  // la cola y no llega a nadie sin jefe. Se promueve al primero de cada grupo en vez de dejarlos
  // fuera del árbol, que es la única manera de que alguien vea el ciclo y lo corte.
  for (const nodo of nodos) {
    if (colgados.has(nodo.staffid)) continue

    arbol.push(colgar(nodo, 0, new Set([nodo.staffid])))
  }

  return arbol
}

/**
 * Los `staffid` que cuelgan de una persona, ella incluida.
 *
 * Sirve para que el buscador de jefe no ofrezca un ciclo: ponerle a alguien un jefe que ya cuelga de
 * él deja una cadena cerrada, y la API lo rechaza con 422. Adelantarlo acá es la diferencia entre no
 * poder elegirlo y descubrir el motivo después de guardar.
 *
 * @param nodos El árbol plano.
 * @param staffid La persona de la que se parte.
 * @returns El conjunto con ella y toda su descendencia.
 */
export function descendenciaDe (nodos: NodoDeArbol[], staffid: number): Set<number> {
  const descendencia = new Set<number>([staffid])
  let crecio = true

  // Por barridos y no por recursión: un ciclo en los datos haría que la recursión no terminara, y
  // esto para solo cuando un barrido entero no agrega a nadie.
  while (crecio) {
    crecio = false

    for (const nodo of nodos) {
      if (nodo.jefe_staffid === null) continue
      if (!descendencia.has(nodo.jefe_staffid) || descendencia.has(nodo.staffid)) continue

      descendencia.add(nodo.staffid)
      crecio = true
    }
  }

  return descendencia
}

/**
 * Quiénes pueden ser jefe de una persona.
 *
 * Fuera ella misma y toda su descendencia: serían un ciclo, y la API los rechaza con 422.
 *
 * @param candidatos El árbol plano, que es el listado completo de personas.
 * @param persona La fila que se está editando.
 * @returns Los candidatos posibles, ordenados por nombre.
 */
export function jefesPosiblesPara (candidatos: NodoDeArbol[], persona: PersonaDeAccesos): NodoDeArbol[] {
  const prohibidos = descendenciaDe(candidatos, persona.staffid)

  return candidatos
    .filter((candidato) => !prohibidos.has(candidato.staffid))
    .sort((uno, otro) => uno.nombre.localeCompare(otro.nombre))
}
