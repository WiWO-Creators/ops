/**
 * Lo que comparten los huevos de pascua del modo Halloween: las frases de las calabazas, las palabras
 * secretas y la regla de cuando una tecla cuenta como parte de una palabra.
 *
 * Sin React: lo ejecutan tambien las pruebas de Node.
 */

/** Lo que dice una calabaza al tocarla. Tuteo chileno, humor de oficina. */
export const FRASES_DE_CALABAZA = [
  '¡Bu!',
  'Truco o trato',
  '¿Ya cerraste tu jornada?',
  'Esa tarea vence pronto…',
  'Me comí un bug',
  'Tengo velas, no deadlines',
  'Hoy no hay reunión. Era broma.',
  'Cuidado: tu bandeja muerde'
] as const

/** Lo que dice el fantasma cuando lo atrapan. */
export const FRASES_DE_FANTASMA = [
  'Me atrapaste. Te debo un bug resuelto.',
  'Buuu… ya pasé por tu escritorio.',
  'Era el fantasma de la tarea que olvidaste.'
] as const

/** Los efectos que dispara una palabra secreta. */
export type EfectoSecreto = 'bu' | 'enjambre' | 'escoba' | 'calabazas'

/** Palabra secreta -> efecto. Se escriben en cualquier parte de la pagina que no sea un campo de texto. */
export const PALABRAS_SECRETAS: Readonly<Record<string, EfectoSecreto>> = {
  boo: 'bu',
  murcielago: 'enjambre',
  bruja: 'escoba',
  calabaza: 'calabazas'
}

/** Tiempo sin teclear tras el cual se olvida lo escrito. */
export const OLVIDO_MS = 2500

/** Cuantas letras se recuerdan: lo que mide la palabra mas larga. */
const MEMORIA = Math.max(...Object.keys(PALABRAS_SECRETAS).map((palabra) => palabra.length))

/**
 * Agrega una tecla a lo escrito y dice si completa una palabra secreta.
 *
 * @param escrito lo que se llevaba tecleado
 * @param tecla la tecla nueva (`KeyboardEvent.key`)
 * @returns lo escrito ahora (recortado a la memoria) y el efecto si la ultima letra cerro una palabra
 */
export function teclear (escrito: string, tecla: string): { escrito: string, efecto: EfectoSecreto | null } {
  if (tecla.length !== 1 || !/[a-z]/i.test(tecla)) return { escrito: '', efecto: null }

  const nuevo = (escrito + tecla.toLowerCase()).slice(-MEMORIA)
  const palabra = Object.keys(PALABRAS_SECRETAS).find((p) => nuevo.endsWith(p))

  return palabra === undefined
    ? { escrito: nuevo, efecto: null }
    : { escrito: '', efecto: PALABRAS_SECRETAS[palabra] ?? null }
}

/**
 * Elige un elemento al azar evitando repetir el anterior.
 *
 * @param lista las opciones; tiene que tener al menos una
 * @param anterior la ultima elegida, o `null`
 * @returns una opcion distinta de `anterior` cuando hay mas de una
 */
export function elegirDistinta<T> (lista: readonly T[], anterior: T | null): T {
  const candidatas = lista.length > 1 ? lista.filter((item) => item !== anterior) : lista

  return candidatas[Math.floor(Math.random() * candidatas.length)] ?? lista[0] as T
}
