/**
 * La secuencia de lecturas de un ticket abierto: «la respuesta mas nueva gana».
 *
 * El modal lee la ficha varias veces (apertura, sondeo, refresco tras escribir) y las respuestas
 * pueden llegar en otro orden del que salieron. Cada lectura toma un numero al salir y solo se aplica
 * si no es mas vieja que la ultima aplicada; una escritura confirmada por la API cuenta como la
 * lectura mas nueva, para que una lectura que salio antes y llega despues no la borre.
 *
 * Son funciones puras sobre un valor inmutable para poder probar las carreras sin montar nada; el
 * hook que las usa guarda el valor en un `ref`.
 */

/** Cuantas lecturas salieron y cual es la ultima aplicada. */
export interface SecuenciaDeLecturas {
  solicitadas: number
  aplicadas: number
}

/** La secuencia de un ticket recien abierto: ninguna lectura salio ni se aplico. */
export const SECUENCIA_INICIAL: SecuenciaDeLecturas = { solicitadas: 0, aplicadas: 0 }

/**
 * Registra que sale una lectura.
 *
 * @param secuencia la secuencia actual
 * @returns la secuencia nueva y el numero que lleva la lectura
 */
export function pedirLectura (secuencia: SecuenciaDeLecturas): { secuencia: SecuenciaDeLecturas, numero: number } {
  const numero = secuencia.solicitadas + 1

  return { secuencia: { ...secuencia, solicitadas: numero }, numero }
}

/**
 * Decide si una lectura que llego se aplica.
 *
 * Una lectura con numero menor que la ultima aplicada es vieja y se descarta; una igual o mayor se
 * aplica y pasa a ser la ultima.
 *
 * @param secuencia la secuencia actual
 * @param numero el numero que llevaba la lectura al salir
 * @returns si se aplica y la secuencia resultante (la misma si se descarta)
 */
export function recibirLectura (
  secuencia: SecuenciaDeLecturas,
  numero: number
): { secuencia: SecuenciaDeLecturas, aplica: boolean } {
  if (numero < secuencia.aplicadas) return { secuencia, aplica: false }

  return { secuencia: { ...secuencia, aplicadas: numero }, aplica: true }
}

/**
 * Registra una escritura confirmada por la API como la lectura mas nueva.
 *
 * @param secuencia la secuencia actual
 * @returns la secuencia donde ninguna lectura anterior a la escritura puede aplicarse
 */
export function confirmarEscritura (secuencia: SecuenciaDeLecturas): SecuenciaDeLecturas {
  const numero = secuencia.solicitadas + 1

  return { solicitadas: numero, aplicadas: numero }
}
