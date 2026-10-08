/**
 * Las tres maneras de mostrar una duracion en segundos.
 *
 * Sin React ni `fetch`: las usan tanto componentes de servidor como de cliente, y las pruebas las
 * corren bajo el runner de Node. Cada formato responde a un lugar distinto y no son intercambiables.
 */

const SEGUNDOS_POR_HORA = 3600
const SEGUNDOS_POR_MINUTO = 60

/**
 * Segundos enteros no negativos: lo negativo o no finito se trata como cero.
 *
 * @param segundos valor de entrada, tal como llega de la API o del reloj
 * @returns los segundos enteros, nunca negativos ni `NaN`
 */
function segundosSeguros (segundos: number): number {
  return Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos) : 0
}

/**
 * Formatea segundos como `HH:MM`, sin dias.
 *
 * Replica `Format::secondsToTime` del panel: 30 horas se muestran `30:05`, no `1d 6:05`. Cambiarlo
 * haria que dos pantallas del mismo sistema informaran el mismo dato de forma distinta.
 *
 * @param segundos total de segundos; lo negativo o no finito se trata como cero
 * @returns el texto `HH:MM`, con dos digitos en cada parte
 */
export function segundosAHoraMinuto (segundos: number): string {
  const total = segundosSeguros(segundos)
  const horas = Math.floor(total / SEGUNDOS_POR_HORA)
  const minutos = Math.floor((total % SEGUNDOS_POR_HORA) / SEGUNDOS_POR_MINUTO)

  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`
}

/**
 * Formatea segundos como `H:MM:SS`, el formato de los cronometros en vivo.
 *
 * Las horas no se acotan a dos digitos ni se recortan con modulo: un total de 120 horas es 120:00:00
 * y no 00:00:00. Los minutos y los segundos si van siempre con dos.
 *
 * Un valor negativo o no finito da `0:00:00`. Pasa cuando el reloj del navegador esta atrasado
 * respecto del servidor, y en pantalla `-1:-3:-2` es peor que un cero honesto.
 *
 * @param segundos duracion en segundos
 * @returns el texto listo para mostrar; nunca vacio, nunca `NaN`
 */
export function formatearDuracion (segundos: number): string {
  const total = segundosSeguros(segundos)
  const horas = Math.floor(total / SEGUNDOS_POR_HORA)
  const minutos = Math.floor((total % SEGUNDOS_POR_HORA) / SEGUNDOS_POR_MINUTO)
  const resto = total % SEGUNDOS_POR_MINUTO

  return `${horas}:${String(minutos).padStart(2, '0')}:${String(resto).padStart(2, '0')}`
}

/**
 * El total registrado como "3 h 25 min", para la ficha publica.
 *
 * @param segundos el total que manda la API; negativo o no finito se trata como cero
 * @returns el texto a mostrar
 */
export function tiempoLegible (segundos: number): string {
  const total = Math.floor(segundosSeguros(segundos) / SEGUNDOS_POR_MINUTO)
  const horas = Math.floor(total / 60)
  const minutos = total % 60

  if (horas === 0) return `${minutos} min`

  return minutos === 0 ? `${horas} h` : `${horas} h ${minutos} min`
}
