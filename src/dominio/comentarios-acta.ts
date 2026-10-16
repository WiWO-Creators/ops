/**
 * Comentarios en línea del Meeting Paper (fase 10 de «Ops en vivo»): contrato con el board y reglas
 * puras del panel de hilos.
 *
 * Un HILO cuelga de un fragmento del texto. El fragmento lleva la marca `comentario`
 * (`<span data-hilo="{ancla}">`, ver `lib/en-vivo/marca-comentario.ts`) y el hilo guarda la misma
 * `ancla`; el board no toca el texto del acta, solo guarda los hilos.
 *
 * Es un módulo puro y solo con imports relativos con extensión: lo importa también el servicio de
 * «Ops en vivo» (a través de la marca), que corre en Node sin el alias `@/`.
 */

/**
 * Lo que `HtmlSeguro` del board acepta como valor de `span[data-hilo]`. Un valor distinto se borra
 * al guardar y deja el `<span>` pelado, así que nada fuera de este patrón se escribe en el texto.
 */
export const PATRON_DE_ANCLA = /^[A-Za-z0-9_-]{1,64}$/

/** Largo máximo de un comentario, en caracteres (el board contesta 422 si se pasa). */
export const LARGO_MAXIMO_COMENTARIO = 2000

/** Menciones máximas por comentario (el board contesta 422 si se pasa). */
export const MAXIMO_DE_MENCIONES = 20

/** Un comentario dentro de un hilo, tal como lo devuelve la API. */
export interface ComentarioDeActa {
  id: number
  staff_id: number
  staff_name: string | null
  staff_image: string | null
  /** Texto plano. */
  content: string
  /** Ids de las personas mencionadas. */
  mentions: number[]
  /** El comentario es de quien lo pide: el único que puede editarlo. */
  mine: boolean
  date_added: string
  date_edited: string | null
}

/** Un hilo: el comentario raíz y sus respuestas, en el orden en que se escribieron. */
export interface HiloDeActa {
  /** El id de la raíz: el que se manda a `/resolver` o como `hilo` al responder. */
  id: number
  /** El valor de `span[data-hilo]` en el texto del acta. */
  anchor: string
  resolved: boolean
  resolved_at: string | null
  comments: ComentarioDeActa[]
}

/** Alfabeto de las anclas: el mismo conjunto que acepta `PATRON_DE_ANCLA`. */
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'

/** Largo de una ancla nueva: 64^12 combinaciones, de sobra para los hilos de un acta. */
const LARGO_DE_ANCLA = 12

/**
 * Si el valor sirve como ancla de un hilo.
 *
 * @param valor lo que se quiere escribir en `data-hilo`
 * @returns `true` si el board lo dejaría pasar
 */
export function esAnclaValida (valor: unknown): valor is string {
  return typeof valor === 'string' && PATRON_DE_ANCLA.test(valor)
}

/**
 * Una ancla nueva para un fragmento que se va a comentar.
 *
 * @param aleatorio fuente de números en `[0, 1)`; por defecto `Math.random`. Se inyecta en las pruebas
 * @returns un valor que cumple `PATRON_DE_ANCLA`
 */
export function nuevaAncla (aleatorio: () => number = Math.random): string {
  let ancla = ''

  for (let i = 0; i < LARGO_DE_ANCLA; i++) {
    ancla += ALFABETO.charAt(Math.floor(aleatorio() * ALFABETO.length) % ALFABETO.length)
  }

  return ancla
}

/** El resultado de revisar el texto de un comentario antes de mandarlo. */
export type ResultadoDeComentario = { ok: true, texto: string } | { ok: false, motivo: string }

/**
 * Revisa el texto de un comentario antes de mandarlo al board.
 *
 * @param texto lo que escribió la persona
 * @returns el texto sin espacios de los bordes, o por qué no sirve
 */
export function revisarComentario (texto: string): ResultadoDeComentario {
  const limpio = texto.trim()

  if (limpio === '') return { ok: false, motivo: 'Escribe un comentario.' }

  if (limpio.length > LARGO_MAXIMO_COMENTARIO) {
    return { ok: false, motivo: `El comentario no puede pasar de ${LARGO_MAXIMO_COMENTARIO} caracteres.` }
  }

  return { ok: true, texto: limpio }
}

/**
 * Separa los hilos abiertos de los resueltos, cada grupo en el orden en que llegó de la API.
 *
 * @param hilos todos los hilos del acta
 * @returns los abiertos y los resueltos
 */
export function repartirHilos (hilos: readonly HiloDeActa[]): { abiertos: HiloDeActa[], resueltos: HiloDeActa[] } {
  return {
    abiertos: hilos.filter((hilo) => !hilo.resolved),
    resueltos: hilos.filter((hilo) => hilo.resolved)
  }
}

/**
 * Reemplaza un hilo en la lista por su versión nueva, o lo agrega si no estaba.
 *
 * @param hilos la lista actual
 * @param hilo el hilo tal como lo devolvió una escritura
 * @returns la lista nueva; la original no se toca
 */
export function conHilo (hilos: readonly HiloDeActa[], hilo: HiloDeActa): HiloDeActa[] {
  return hilos.some((existente) => existente.id === hilo.id)
    ? hilos.map((existente) => existente.id === hilo.id ? hilo : existente)
    : [...hilos, hilo]
}

/**
 * Quita de la lista el hilo que contiene un comentario, o solo ese comentario si es una respuesta.
 *
 * Borrar la raíz borra todo el hilo (así lo hace el board); borrar una respuesta deja el resto.
 *
 * @param hilos la lista actual
 * @param comentarioId el comentario borrado
 * @returns la lista nueva; la original no se toca
 */
export function sinComentario (hilos: readonly HiloDeActa[], comentarioId: number): HiloDeActa[] {
  return hilos
    .filter((hilo) => hilo.id !== comentarioId)
    .map((hilo) => ({ ...hilo, comments: hilo.comments.filter((comentario) => comentario.id !== comentarioId) }))
}

/** Tramos de una misma ancla que se leen como máximo: un fragmento no cruza tantos bloques. */
const MAXIMO_DE_TRAMOS = 50

/** El cierre de un bloque: lo que separa un párrafo de otro dentro del texto de una cita. */
const CIERRE_DE_BLOQUE = /<\/(p|li|h[1-6]|blockquote)>/i

/** Marca de apertura de un `<span>` con el `data-hilo` buscado, hasta el cierre de la etiqueta. */
function inicioDeAncla (html: string, ancla: string): { desde: number, hasta: number } | null {
  const rastro = `data-hilo="${ancla}"`
  const posicion = html.indexOf(rastro)

  if (posicion < 0) return null

  const desde = html.lastIndexOf('<span', posicion)
  const hasta = html.indexOf('>', posicion)

  return desde < 0 || hasta < 0 ? null : { desde, hasta: hasta + 1 }
}

/**
 * El texto comentado de una ancla, para citarlo en el panel de hilos.
 *
 * Recorre el HTML contando `<span>` abiertos y cerrados hasta cerrar el de la ancla; así sirve
 * también cuando el fragmento tiene negrita u otro `<span>` adentro. Un fragmento que cruzó varios
 * párrafos queda como varias marcas con la misma ancla: se junta el texto de todas.
 *
 * @param html el contenido del acta
 * @param ancla el `data-hilo` del hilo
 * @returns el texto, o `null` si el acta ya no tiene esa marca (se borró el fragmento)
 */
export function citaDeAncla (html: string, ancla: string): string | null {
  if (!esAnclaValida(ancla)) return null

  let cita = ''
  let hallado = false
  let resto = html

  for (let vuelta = 0; vuelta < MAXIMO_DE_TRAMOS; vuelta++) {
    const inicio = inicioDeAncla(resto, ancla)

    if (inicio === null) break

    // Los tramos de un mismo párrafo (partidos por una negrita) se pegan; entre párrafos va un espacio.
    if (hallado && CIERRE_DE_BLOQUE.test(resto.slice(0, inicio.desde))) cita += ' '

    const [texto, siguiente] = textoHastaCerrar(resto, inicio.hasta)

    cita += texto
    hallado = true
    resto = resto.slice(siguiente)
  }

  return hallado ? cita.replace(/\s+/g, ' ').trim() : null
}

/**
 * Lee el texto desde `desde` hasta el `</span>` que cierra el que se abrió justo antes.
 *
 * @returns el texto sin etiquetas y la posición donde seguir buscando
 */
function textoHastaCerrar (html: string, desde: number): [string, number] {
  const etiqueta = /<(\/?)span\b[^>]*>/gi
  let profundidad = 1
  let fin = html.length
  let siguiente = html.length

  etiqueta.lastIndex = desde

  for (let hallada = etiqueta.exec(html); hallada !== null; hallada = etiqueta.exec(html)) {
    profundidad += hallada[1] === '/' ? -1 : 1

    if (profundidad === 0) {
      fin = hallada.index
      siguiente = etiqueta.lastIndex
      break
    }
  }

  const texto = html
    .slice(desde, fin)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

  return [texto, siguiente]
}
