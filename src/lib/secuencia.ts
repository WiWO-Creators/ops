/** Detector de una secuencia de teclas, sin estado en React. */
export interface Detector {
  /** Empuja una tecla. `true` si con esa tecla se completo la secuencia. */
  empujar: (tecla: string) => boolean
  /** Olvida lo tecleado. */
  reiniciar: () => void
}

/**
 * Arma un detector para una secuencia de teclas.
 *
 * Compara la cola entera contra la clave en vez de llevar un indice: un indice obliga a decidir, en
 * cada tecla que no toca, si reinicia a cero o a uno, y ahi es donde una secuencia que empieza con
 * la misma tecla dos veces (arriba, arriba) se rompe.
 *
 * @param teclas Los valores de `KeyboardEvent.key`, en orden. Se comparan sin distinguir mayusculas.
 */
export function detectorDe (teclas: string[]): Detector {
  const clave = teclas.join(' ').toLowerCase()
  let cola = ''

  return {
    empujar (tecla: string): boolean {
      cola = `${cola} ${tecla.toLowerCase()}`.trim().slice(-clave.length)

      if (cola !== clave) return false

      cola = ''
      return true
    },
    reiniciar () {
      cola = ''
    }
  }
}
