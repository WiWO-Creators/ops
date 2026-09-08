/**
 * Comparacion entre lo estimado y lo registrado en una Tarea.
 *
 * Vive en `dominio/` y no en el componente por la razon de siempre: Node despoja los tipos de un
 * `.ts` pero no el JSX, asi que solo esto se puede probar. Y merece prueba, porque el numero que
 * calcula es el que alguien usa para decidir si una tarea se paso de presupuesto.
 *
 * Sin React y sin `fetch`: entran dos numeros y sale un resultado.
 */

/** Segundos de una hora. Se nombra para que la division no quede como numero magico. */
const SEGUNDOS_POR_HORA = 3600

/**
 * Tolerancia del desvio, en horas.
 *
 * Las horas registradas salen de dividir segundos, asi que un desvio de `0.0000003` es ruido de coma
 * flotante y no una tarea pasada de estimacion. Por debajo de esto se informa "en la estimacion".
 */
const TOLERANCIA_HORAS = 0.01

/**
 * Resultado de comparar lo estimado con lo registrado.
 *
 * Son cuatro estados y no un numero con banderas porque los cuatro se muestran distinto, y el que
 * mas se ve es `sin_registro`: el cronometro casi no se usa, asi que la mayoria de las tareas tiene
 * estimacion y ningun marcaje. Ese caso NO es un desvio del 100%; es que todavia no se midio.
 */
export type ComparacionTiempo =
  | { estado: 'sin_estimacion' }
  | { estado: 'sin_registro', estimadas: number }
  | { estado: 'en_estimacion' | 'excedido' | 'por_debajo', estimadas: number, registradas: number, desvio: number }

/**
 * Compara las horas estimadas de una Tarea con el tiempo que se le registro.
 *
 * @param estimadas horas estimadas tal como llegan de la API; `null` o no finito es "sin estimacion"
 * @param segundosRegistrados total acumulado de los cronometros de la Tarea
 * @returns el estado de la comparacion, con el desvio en horas (`registradas - estimadas`, positivo
 *          cuando se paso) en los tres casos donde tiene sentido calcularlo
 */
export function compararTiempo (
  estimadas: number | null | undefined,
  segundosRegistrados: number
): ComparacionTiempo {
  if (typeof estimadas !== 'number' || !Number.isFinite(estimadas)) return { estado: 'sin_estimacion' }

  const segundos = Number.isFinite(segundosRegistrados) && segundosRegistrados > 0 ? segundosRegistrados : 0

  // Sin un solo segundo anotado no hay con que comparar. Devolver `desvio: -estimadas` seria
  // aritmeticamente cierto y en pantalla una mentira: diria que la tarea va sobrada cuando lo que
  // pasa es que nadie prendio el cronometro.
  if (segundos === 0) return { estado: 'sin_registro', estimadas }

  const registradas = segundos / SEGUNDOS_POR_HORA
  const desvio = registradas - estimadas

  if (Math.abs(desvio) < TOLERANCIA_HORAS) {
    return { estado: 'en_estimacion', estimadas, registradas, desvio: 0 }
  }

  return { estado: desvio > 0 ? 'excedido' : 'por_debajo', estimadas, registradas, desvio }
}
