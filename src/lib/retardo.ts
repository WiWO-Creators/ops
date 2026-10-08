/**
 * Un retardo con cancelación, para no actuar en cada tecla de un buscador.
 *
 * Es un `.ts` sin React ni DOM para poder probarlo con `node --test` y los temporizadores simulados.
 */

export interface Retardo<A extends unknown[]> {
  /** Programa la acción con estos argumentos; una llamada pendiente se descarta y queda la última. */
  llamar: (...argumentos: A) => void
  /** Descarta la llamada pendiente, si hay. */
  cancelar: () => void
}

/**
 * Agrupa llamadas seguidas en una sola, ejecutada cuando pasa `milisegundos` sin una nueva.
 *
 * @param accion lo que se ejecuta al terminar la espera, con los argumentos de la última llamada
 * @param milisegundos cuánto silencio hace falta antes de ejecutar
 * @returns las funciones para programar y cancelar la acción
 */
export function conRetardo<A extends unknown[]> (
  accion: (...argumentos: A) => void,
  milisegundos: number
): Retardo<A> {
  let temporizador: ReturnType<typeof setTimeout> | null = null

  function cancelar (): void {
    if (temporizador === null) return

    clearTimeout(temporizador)
    temporizador = null
  }

  function llamar (...argumentos: A): void {
    cancelar()
    temporizador = setTimeout(() => {
      temporizador = null
      accion(...argumentos)
    }, milisegundos)
  }

  return { llamar, cancelar }
}
