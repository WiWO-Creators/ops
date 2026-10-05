/** Un aviso que se agrupa: cada `disparar` reinicia la espera y solo el ultimo llega a la accion. */
export interface AvisoAgrupado {
  disparar: () => void
  /** Descarta el aviso pendiente, para limpiar al desmontar. */
  cancelar: () => void
}

/**
 * Agrupa avisos seguidos en una sola llamada, `esperaMs` despues del ultimo.
 *
 * @param accion lo que se hace una vez que los avisos se calman
 * @param esperaMs cuanto esperar tras el ultimo aviso, en milisegundos
 * @returns el disparador y su cancelacion
 */
export function agruparAvisos (accion: () => void, esperaMs: number): AvisoAgrupado {
  let temporizador: ReturnType<typeof setTimeout> | null = null

  function cancelar (): void {
    if (temporizador === null) return

    clearTimeout(temporizador)
    temporizador = null
  }

  function disparar (): void {
    cancelar()
    temporizador = setTimeout(() => {
      temporizador = null
      accion()
    }, esperaMs)
  }

  return { disparar, cancelar }
}
