/**
 * Limites de tiempo de las peticiones del navegador.
 *
 * Con una red lenta, un `fetch` sin limite queda colgado minutos: el control que lo disparo sigue
 * deshabilitado y la persona no sabe si lo que hizo se guardo. Todo lo que sale del navegador hacia el
 * BFF pasa por estos limites, y un tiempo agotado se distingue de un aborto deliberado.
 */

/** Espera por defecto de una lectura, en milisegundos. */
const LECTURA_POR_DEFECTO_MS = 15_000
/** Espera por defecto de una escritura JSON, en milisegundos. */
const ESCRITURA_POR_DEFECTO_MS = 20_000
/** Espera por defecto de una escritura multipart (subida de archivos), en milisegundos. */
const SUBIDA_POR_DEFECTO_MS = 120_000

/**
 * Interpreta un valor de entorno como una cantidad positiva de milisegundos.
 *
 * @param valor el texto de la variable, o `undefined` si no esta definida
 * @param porDefecto lo que se usa cuando el valor falta o no es un entero positivo
 * @returns los milisegundos a usar
 */
export function milisegundosDe (valor: string | undefined, porDefecto: number): number {
  const numero = Number(valor)

  return Number.isInteger(numero) && numero > 0 ? numero : porDefecto
}

// Next solo incrusta `NEXT_PUBLIC_*` en el navegador cuando se lee con el nombre literal.
/** Espera maxima de una lectura al BFF. */
export const TIEMPO_LECTURA_MS = milisegundosDe(process.env.NEXT_PUBLIC_TIEMPO_LECTURA_MS, LECTURA_POR_DEFECTO_MS)
/** Espera maxima de una escritura JSON al BFF. */
export const TIEMPO_ESCRITURA_MS = milisegundosDe(process.env.NEXT_PUBLIC_TIEMPO_ESCRITURA_MS, ESCRITURA_POR_DEFECTO_MS)
/** Espera maxima de una escritura multipart al BFF. */
export const TIEMPO_SUBIDA_MS = milisegundosDe(process.env.NEXT_PUBLIC_TIEMPO_SUBIDA_MS, SUBIDA_POR_DEFECTO_MS)

/**
 * Combina una señal opcional con un limite de tiempo.
 *
 * @param senal la señal del llamador (por ejemplo, la de un componente que se desmonta)
 * @param ms el tiempo maximo en milisegundos
 * @returns una señal que se aborta cuando lo haga la del llamador o venza el tiempo
 */
export function conLimite (senal: AbortSignal | undefined, ms: number): AbortSignal {
  const limite = AbortSignal.timeout(ms)

  return senal === undefined ? limite : AbortSignal.any([senal, limite])
}

/**
 * `true` si el fallo es un tiempo agotado y no un aborto del llamador ni un fallo de red.
 *
 * @param fallo lo que lanzo `fetch`
 */
export function esTiempoAgotado (fallo: unknown): boolean {
  return fallo instanceof DOMException && fallo.name === 'TimeoutError'
}

/**
 * Clave de idempotencia nueva para una intencion de escritura.
 *
 * Un reintento de la misma intencion debe reutilizarla; una intencion distinta, una nueva.
 *
 * @returns un identificador unico
 */
export function claveDeIdempotencia (): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}
