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
