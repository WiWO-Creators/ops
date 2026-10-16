import { LIMITES_REPRODUCCION } from './diff-acta.ts'

/**
 * Tramos de reemplazo entre dos versiones de un Meeting Paper, para aplicar el cambio del Thinking
 * Orb sobre un documento colaborativo en vivo.
 *
 * Es el hermano de `armarGuion` (diff-acta.ts): aquel produce un guion de animación a partir de
 * texto plano; este produce las ediciones estructurales que el servicio de «Ops en vivo» aplica al
 * árbol Yjs, de a un tramo, para que las demás personas vean escribir al orbe. Se trabaja sobre los
 * mismos bloques de primer nivel que `bloquesDeActa` (los hijos directos del documento ProseMirror),
 * pero conservando su HTML en vez de solo su texto: `bloquesDeActa` descarta marcas y bloques vacíos,
 * y sin ellos no se puede reconstruir qué insertar ni en qué posición del árbol.
 *
 * El servicio no aplica el HTML del orbe contra el documento vivo (pisaría lo que alguien escribió y aún
 * no se guardó) sino a 3 bandas: `ubicarTramosEnVivo` traduce el cambio base → orbe a operaciones sobre
 * los bloques vivos.
 *
 * Todo es puro: solo texto, sin DOM ni Yjs, para probarse con `node:test`. Espera HTML ya
 * normalizado por el esquema del acta (el servicio pasa los dos lados por `generateHTML`), donde
 * cada bloque de primer nivel es un único elemento.
 */

/** Un reemplazo contiguo: se borran `borrar` bloques desde `desde` y se inserta `html` en su lugar. */
export interface TramoDeReemplazo {
  /**
   * Posición del primer bloque afectado en el documento tal como queda tras aplicar los tramos
   * anteriores, en orden. Coincide con su posición en la versión nueva.
   */
  desde: number
  /** Cuántos bloques consecutivos se borran (0 si solo se inserta). */
  borrar: number
  /** El HTML de los bloques que entran (vacío si solo se borra). */
  html: string
  /** Cuántos bloques de primer nivel trae `html`. */
  insertados: number
}

/** Etiquetas sin cierre: no abren profundidad. */
const ETIQUETAS_VACIAS = new Set(['hr', 'br', 'img', 'input', 'meta', 'link', 'wbr', 'col'])

/** Una etiqueta de apertura o cierre; los atributos pueden traer `>` entre comillas. */
const ETIQUETA = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g

/** Un bloque o texto suelto que no cabe en una etiqueta se trata como párrafo. */
function parrafoSuelto (texto: string): string {
  return `<p>${texto}</p>`
}

/**
 * Parte un HTML en sus bloques de primer nivel, cada uno como HTML.
 *
 * Los bloques sin texto (`<p></p>`) cuentan: ocupan lugar en el documento. El texto suelto fuera
 * de toda etiqueta se envuelve en un párrafo; los espacios sueltos entre bloques se descartan.
 * Una etiqueta sin cerrar toma el resto como un solo bloque. HTML vacío o que no sea una cadena
 * da una lista vacía; nunca lanza.
 *
 * @param html el cuerpo del acta, normalizado
 * @returns un HTML por bloque, en orden de documento
 */
export function bloquesComoHtml (html: string): string[] {
  if (typeof html !== 'string' || html === '') return []

  const piezas: string[] = []
  let profundidad = 0
  let inicio = 0
  let cursor = 0

  /** Cierra el texto suelto acumulado entre `cursor` y `hasta`, si lo hay. */
  const soltar = (hasta: number): void => {
    const texto = html.slice(cursor, hasta)

    if (texto.trim() !== '') piezas.push(parrafoSuelto(texto.trim()))
  }

  ETIQUETA.lastIndex = 0

  for (let hallada = ETIQUETA.exec(html); hallada !== null; hallada = ETIQUETA.exec(html)) {
    const [etiqueta, cierre, nombre = '', atributos = ''] = hallada
    const vacia = ETIQUETAS_VACIAS.has(nombre.toLowerCase()) || atributos.trimEnd().endsWith('/')
    const fin = hallada.index + etiqueta.length

    if (profundidad === 0) {
      soltar(hallada.index)
      inicio = hallada.index

      // Un cierre sin apertura no es un bloque: se ignora.
      if (cierre === '/') {
        cursor = fin
        continue
      }
    }

    if (cierre === '/') {
      profundidad = Math.max(0, profundidad - 1)
    } else if (!vacia) {
      profundidad += 1
    }

    if (profundidad === 0) {
      piezas.push(html.slice(inicio, fin))
      cursor = fin
    }
  }

  if (profundidad > 0) piezas.push(html.slice(inicio))
  else soltar(html.length)

  return piezas
}

/** Los bloques en común, en pares `[índice viejo, índice nuevo]`, por subsecuencia común más larga. */
function parejasComunes (viejos: readonly string[], nuevos: readonly string[]): Array<[number, number]> {
  const n = viejos.length
  const m = nuevos.length
  const ancho = m + 1
  const largos = new Uint32Array((n + 1) * ancho)

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      largos[i * ancho + j] = viejos[i] === nuevos[j]
        ? (largos[(i + 1) * ancho + j + 1] ?? 0) + 1
        : Math.max(largos[(i + 1) * ancho + j] ?? 0, largos[i * ancho + j + 1] ?? 0)
    }
  }

  const parejas: Array<[number, number]> = []
  let i = 0
  let j = 0

  while (i < n && j < m) {
    if (viejos[i] === nuevos[j]) {
      parejas.push([i, j])
      i += 1
      j += 1
    } else if ((largos[(i + 1) * ancho + j] ?? 0) >= (largos[i * ancho + j + 1] ?? 0)) {
      i += 1
    } else {
      j += 1
    }
  }

  return parejas
}

/** Cuántos bloques seguidos coinciden desde el principio. */
function prefijoComun (a: readonly string[], b: readonly string[]): number {
  let largo = 0

  while (largo < a.length && largo < b.length && a[largo] === b[largo]) largo += 1

  return largo
}

/** Cuántos bloques seguidos coinciden desde el final, sin pasar de `tope`. */
function sufijoComun (a: readonly string[], b: readonly string[], tope: number): number {
  let largo = 0

  while (largo < tope && a[a.length - 1 - largo] === b[b.length - 1 - largo]) largo += 1

  return largo
}

/**
 * Calcula los reemplazos que llevan el acta actual al acta nueva.
 *
 * LCS sobre los bloques de primer nivel (igualdad exacta del HTML del bloque, de modo que un cambio
 * de formato también cuenta). Cada hueco entre dos bloques en común es un tramo; los tramos salen en
 * orden y su `desde` ya cuenta los tramos anteriores, así se aplican uno tras otro sin recalcular.
 * Si la tabla de comparación pasa de `LIMITES_REPRODUCCION.maxCeldasLcs`, o el HTML de alguna de
 * las versiones pasa de `maxCaracteresHtml`, no se compara: se devuelve un único reemplazo completo
 * del tramo distinto. Sin diferencias, lista vacía.
 *
 * @param htmlActual el acta como está ahora, normalizada
 * @param htmlNuevo el acta que propone el orbe, normalizada igual
 * @returns los tramos en orden, o `[]` si son iguales
 */
export function tramosDeReemplazo (htmlActual: string, htmlNuevo: string): TramoDeReemplazo[] {
  const viejos = bloquesComoHtml(htmlActual)
  const nuevos = bloquesComoHtml(htmlNuevo)
  const prefijo = prefijoComun(viejos, nuevos)
  const sufijo = sufijoComun(viejos, nuevos, Math.min(viejos.length, nuevos.length) - prefijo)
  const mediosViejos = viejos.slice(prefijo, viejos.length - sufijo)
  const mediosNuevos = nuevos.slice(prefijo, nuevos.length - sufijo)

  if (mediosViejos.length === 0 && mediosNuevos.length === 0) return []

  const tramos: TramoDeReemplazo[] = []
  const celdas = (mediosViejos.length + 1) * (mediosNuevos.length + 1)
  const demasiado = celdas > LIMITES_REPRODUCCION.maxCeldasLcs || demasiadoLargo(htmlActual, htmlNuevo)
  const parejas = demasiado ? [] : parejasComunes(mediosViejos, mediosNuevos)

  /** Cierra el hueco que va de `(viejo, nuevo)` hasta el siguiente par en común. */
  const cerrarHueco = (viejoDesde: number, viejoHasta: number, nuevoDesde: number, nuevoHasta: number): void => {
    const borrar = viejoHasta - viejoDesde
    const insertados = nuevoHasta - nuevoDesde

    if (borrar === 0 && insertados === 0) return

    tramos.push({
      desde: prefijo + nuevoDesde,
      borrar,
      html: mediosNuevos.slice(nuevoDesde, nuevoHasta).join(''),
      insertados
    })
  }

  let viejo = 0
  let nuevo = 0

  for (const [i, j] of parejas) {
    cerrarHueco(viejo, i, nuevo, j)
    viejo = i + 1
    nuevo = j + 1
  }

  cerrarHueco(viejo, mediosViejos.length, nuevo, mediosNuevos.length)

  return tramos
}

/** Si alguno de los HTML pasa del tope que el módulo de reproducción acepta leer. */
function demasiadoLargo (htmlActual: string, htmlNuevo: string): boolean {
  const tope = LIMITES_REPRODUCCION.maxCaracteresHtml

  return htmlActual.length > tope || htmlNuevo.length > tope
}

/**
 * Dónde se inserta el HTML de un tramo en el documento vivo, en índices de sus bloques de primer nivel
 * al momento de planear: `inicio`/`fin` del documento, o `antes`/`despues` del bloque `vivo`.
 */
export type AnclaDeTramo =
  | { tipo: 'inicio' }
  | { tipo: 'fin' }
  | { tipo: 'antes' | 'despues', vivo: number }

/** Un tramo del orbe ya ubicado en el documento vivo. */
export interface TramoUbicado {
  /** El HTML de los bloques que entran. */
  html: string
  /** Cuántos bloques de primer nivel trae `html`. */
  insertados: number
  /**
   * Los bloques vivos que se borran: los que el orbe cambió y siguen idénticos a la base, es decir,
   * que nadie tocó desde que el board guardó.
   */
  borrarVivos: number[]
  /** Cuántos bloques que el orbe cambió ya no coinciden con la base (los editó una persona) y se conservan. */
  conservados: number
  /** Dónde entra `html`. */
  ancla: AnclaDeTramo
}

/**
 * Empareja los bloques de la base con los del documento vivo cuando son idénticos, respetando el orden.
 *
 * @returns por cada bloque de la base, el índice del bloque vivo idéntico, o -1 si ya no está (lo editó
 * o lo borró una persona). Si la tabla de comparación pasa del tope solo se emparejan prefijo y sufijo.
 */
function alinearBloques (base: readonly string[], vivos: readonly string[]): number[] {
  const alineados: number[] = new Array<number>(base.length).fill(-1)
  const prefijo = prefijoComun(base, vivos)
  const sufijo = sufijoComun(base, vivos, Math.min(base.length, vivos.length) - prefijo)
  const mediosBase = base.slice(prefijo, base.length - sufijo)
  const mediosVivos = vivos.slice(prefijo, vivos.length - sufijo)

  for (let i = 0; i < prefijo; i++) alineados[i] = i
  for (let i = 1; i <= sufijo; i++) alineados[base.length - i] = vivos.length - i

  if ((mediosBase.length + 1) * (mediosVivos.length + 1) > LIMITES_REPRODUCCION.maxCeldasLcs) return alineados

  for (const [i, j] of parejasComunes(mediosBase, mediosVivos)) alineados[prefijo + i] = prefijo + j

  return alineados
}

/** El índice de base más cercano a `desde` (hacia `paso`, +1 o -1) que sea estable, o -1 si no hay. */
function vecinoEstable (estables: readonly boolean[], desde: number, paso: 1 | -1): number {
  for (let i = desde; i >= 0 && i < estables.length; i += paso) {
    if (estables[i] === true) return i
  }

  return -1
}

/** Lo que hace falta saber de la base y del documento vivo para ubicar cada tramo. */
interface ContextoDeUbicacion {
  /** Por bloque de la base, su bloque vivo idéntico o -1. */
  alineados: readonly number[]
  /** Bloques de la base que el orbe no toca y siguen idénticos en el documento vivo: sirven de ancla. */
  estables: readonly boolean[]
  totalVivos: number
}

/**
 * Elige dónde entra el HTML de un tramo.
 *
 * - Solo inserción: justo después del bloque anterior, si sigue idéntico; si no (lo editó una persona),
 *   tras lo que ella dejó, es decir, antes del siguiente bloque estable.
 * - Reemplazo donde nadie tocó nada: en el mismo lugar de lo que se borra.
 * - Reemplazo donde una persona editó algún bloque: sus bloques se conservan y lo del orbe va a
 *   continuación, antes del siguiente bloque estable.
 */
function anclaDeTramo (desdeBase: number, borrar: number, borrarVivos: readonly number[], contexto: ContextoDeUbicacion): AnclaDeTramo {
  const { alineados, estables, totalVivos } = contexto
  const derecho = vecinoEstable(estables, desdeBase + borrar, 1)
  const alDerecho: AnclaDeTramo = derecho === -1 ? { tipo: 'fin' } : { tipo: 'antes', vivo: alineados[derecho] ?? 0 }

  if (borrar === 0) {
    if (desdeBase === 0) return { tipo: 'inicio' }

    return estables[desdeBase - 1] === true ? { tipo: 'despues', vivo: alineados[desdeBase - 1] ?? 0 } : alDerecho
  }

  if (borrarVivos.length < borrar) return alDerecho

  const siguiente = Math.max(...borrarVivos) + 1

  return siguiente < totalVivos ? { tipo: 'antes', vivo: siguiente } : { tipo: 'fin' }
}

/**
 * Ubica en el documento vivo los cambios que el orbe hizo entre `htmlBase` y `htmlNuevo` (3 bandas).
 *
 * El orbe calculó su HTML sobre la base que el board tenía guardada; mientras tanto el documento vivo
 * puede traer texto de personas que aún no se guardó. Por eso el cambio del orbe (base → nuevo) se
 * traduce a operaciones sobre los bloques vivos: solo se borra un bloque si sigue idéntico a la base.
 * Si una persona lo editó, su texto se conserva y lo del orbe entra a continuación; nunca se pisa
 * texto ajeno. Los bloques que el orbe no tocó quedan intactos.
 *
 * Los tres HTML deben venir normalizados por el esquema del acta. Si el documento vivo ya es idéntico
 * al nuevo, no hay nada que hacer.
 *
 * @param htmlBase el acta que el board guardó y sobre la que el orbe trabajó
 * @param htmlVivo el acta como está ahora en el documento colaborativo (vacío si no se puede mapear a sus bloques)
 * @param htmlNuevo el acta que propone el orbe
 * @returns los tramos en orden, con índices de bloques del documento vivo; `[]` si no hay nada que aplicar
 */
export function ubicarTramosEnVivo (htmlBase: string, htmlVivo: string, htmlNuevo: string): TramoUbicado[] {
  const tramos = tramosDeReemplazo(htmlBase, htmlNuevo)

  if (tramos.length === 0 || htmlVivo === htmlNuevo) return []

  const base = bloquesComoHtml(htmlBase)
  const vivos = bloquesComoHtml(htmlVivo)
  const alineados = alinearBloques(base, vivos)
  const tocados = new Set<number>()
  const desdeBase: number[] = []
  let desfase = 0

  // `desde` de cada tramo cuenta los anteriores ya aplicados: restar lo que movieron da su lugar en la base.
  for (const tramo of tramos) {
    const inicio = tramo.desde - desfase

    desdeBase.push(inicio)
    for (let i = 0; i < tramo.borrar; i++) tocados.add(inicio + i)
    desfase += tramo.insertados - tramo.borrar
  }

  const estables = base.map((_, i) => (alineados[i] ?? -1) >= 0 && !tocados.has(i))
  const contexto: ContextoDeUbicacion = { alineados, estables, totalVivos: vivos.length }

  return tramos.map((tramo, orden) => {
    const inicio = desdeBase[orden] ?? 0
    const borrarVivos = Array.from({ length: tramo.borrar }, (_, i) => alineados[inicio + i] ?? -1).filter((vivo) => vivo >= 0)

    return {
      html: tramo.html,
      insertados: tramo.insertados,
      borrarVivos,
      conservados: tramo.borrar - borrarVivos.length,
      ancla: anclaDeTramo(inicio, tramo.borrar, borrarVivos, contexto)
    }
  })
}
