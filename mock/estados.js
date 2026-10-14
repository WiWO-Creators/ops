/**
 * Clasificacion de los estados de Tarea que usa el mock.
 *
 * Replica la regla del API: **abierta** es todo menos Completo (5), Facturado (9) y Cancelada (11);
 * **completada** es solo 5 y 9 (la Cancelada esta cerrada pero no entregada); y **puede atrasarse**
 * solo la abierta que no esta en Standby (10), cuyo plazo vencido no cuenta.
 */

export const ESTADO_COMPLETO = 5
export const ESTADO_FACTURADO = 9
export const ESTADO_STANDBY = 10
export const ESTADO_CANCELADA = 11

/**
 * Si el estado entrega la Tarea: Completo o Facturado.
 *
 * @param {number} estado id de estado
 * @returns {boolean} `true` para 5 y 9
 */
export function estaCompletada (estado) {
  return estado === ESTADO_COMPLETO || estado === ESTADO_FACTURADO
}

/**
 * Si la Tarea sigue abierta: ni completada ni cancelada.
 *
 * @param {number} estado id de estado
 * @returns {boolean} `false` para 5, 9 y 11
 */
export function estaAbierta (estado) {
  return !estaCompletada(estado) && estado !== ESTADO_CANCELADA
}

/**
 * Si su fecha de entrega puede dejarla vencida: abierta y fuera de Standby.
 *
 * @param {number} estado id de estado
 * @returns {boolean} `false` para 5, 9, 10 y 11
 */
export function puedeAtrasarse (estado) {
  return estaAbierta(estado) && estado !== ESTADO_STANDBY
}
