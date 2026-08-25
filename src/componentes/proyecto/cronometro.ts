import type { Cronometro } from '@/datos/recursos'

/**
 * Aritmetica de cronometros.
 *
 * Vive aparte del `.tsx` por la misma razon que `componentes/datos/tabla.ts`: Node despoja los tipos
 * de un `.ts` pero no el JSX, asi que solo lo que esta fuera del componente se puede probar. Y esto
 * merece prueba: un total mal sumado es tiempo que alguien factura o deja de facturar.
 *
 * Sin React y sin `fetch`: recibe datos y devuelve numeros.
 *
 * El reloj entra siempre por parametro (`ahora`) en vez de leerse adentro. Sin eso, un total que
 * incluye un cronometro corriendo es imposible de probar: cambia en cada ejecucion.
 */

/** Milisegundos de un segundo. Se nombra para que las divisiones no queden como numeros magicos. */
const MS_POR_SEGUNDO = 1000

/**
 * Segundos de UN cronometro.
 *
 * Cerrado: manda `segundos`, que es lo que el backend ya calculo. Si viniera ausente se derivan las
 * dos puntas, porque una fila sin total es mejor sumarla que descartarla.
 *
 * Abierto (`end_time === null`): el backend manda `segundos` en `null` a proposito — el total todavia
 * no existe—, asi que se cuenta contra `ahora`.
 *
 * @param timer un marcaje tal como llega de `/tasks/{id}/timers`
 * @param ahora momento de referencia para los que estan corriendo
 * @returns segundos, nunca negativo y nunca `NaN`: una fecha ilegible cuenta como cero
 */
function segundosDeUno (timer: Cronometro, ahora: Date): number {
  if (timer.end_time === null) return diferenciaEnSegundos(timer.start_time, ahora.getTime())

  if (typeof timer.segundos === 'number' && Number.isFinite(timer.segundos)) {
    return Math.max(0, timer.segundos)
  }

  return diferenciaEnSegundos(timer.start_time, new Date(timer.end_time).getTime())
}

/** Segundos entre un instante ISO y otro en milisegundos. Cero si alguno no es una fecha. */
function diferenciaEnSegundos (desde: string, hastaEnMs: number): number {
  const inicio = new Date(desde).getTime()

  if (Number.isNaN(inicio) || Number.isNaN(hastaEnMs)) return 0

  return Math.max(0, Math.floor((hastaEnMs - inicio) / MS_POR_SEGUNDO))
}

/**
 * Total acumulado de una lista de cronometros.
 *
 * Los que estan corriendo se cuentan en vivo contra `ahora`: si se ignoraran, el total de una tarea
 * con el cronometro andando se quedaria congelado en el ultimo marcaje cerrado.
 *
 * @param timers marcajes de la tarea; una lista vacia da cero
 * @param ahora momento de referencia para los abiertos
 * @returns el total en segundos
 */
export function segundosAcumulados (timers: Cronometro[], ahora: Date = new Date()): number {
  return timers.reduce((total, timer) => total + segundosDeUno(timer, ahora), 0)
}

/**
 * Formatea una duracion como `H:MM:SS`.
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
  if (!Number.isFinite(segundos) || segundos <= 0) return '0:00:00'

  const total = Math.floor(segundos)
  const horas = Math.floor(total / 3600)
  const minutos = Math.floor((total % 3600) / 60)
  const resto = total % 60

  return `${horas}:${String(minutos).padStart(2, '0')}:${String(resto).padStart(2, '0')}`
}

/**
 * Total acumulado por persona.
 *
 * @param timers marcajes de la tarea
 * @param ahora momento de referencia para los abiertos
 * @returns mapa `staff_id` -> segundos. `Map` y no objeto plano: la clave es un numero y un objeto la
 *          convertiria en cadena, obligando a cada consumidor a volver a parsearla
 */
export function porPersona (timers: Cronometro[], ahora: Date = new Date()): Map<number, number> {
  const totales = new Map<number, number>()

  for (const timer of timers) {
    totales.set(timer.staff_id, (totales.get(timer.staff_id) ?? 0) + segundosDeUno(timer, ahora))
  }

  return totales
}

/**
 * El cronometro que esa persona tiene corriendo en esta tarea.
 *
 * Decide que ofrece el boton: arrancar o detener. El backend responde `409` si se arranca teniendo
 * uno abierto, asi que preguntarlo antes evita ofrecer una accion que ya se sabe que falla.
 *
 * @param timers marcajes de la tarea
 * @param staffId quien mira; `null` cuando `/me` todavia no llego
 * @returns el marcaje abierto, o `null` si no hay
 */
export function cronometroAbierto (timers: Cronometro[], staffId: number | null): Cronometro | null {
  if (staffId === null) return null

  return timers.find((timer) => timer.end_time === null && timer.staff_id === staffId) ?? null
}

/**
 * Traduce el fallo de arrancar o detener a una frase que se entienda.
 *
 * El contrato usa `409` para tres cosas distintas y `403` para una cuarta. Mostrar el `message` crudo
 * de la API deja a la persona con un texto tecnico que no dice que hacer; peor todavia es mostrar el
 * JSON entero.
 *
 * @param estado codigo HTTP de la respuesta
 * @param arrancando `true` si el fallo fue al arrancar, `false` al detener
 * @returns el mensaje a mostrar; nunca vacio
 */
export function mensajeDeFalloDeCronometro (estado: number, arrancando: boolean): string {
  if (estado === 403) {
    return arrancando
      ? 'Solo quien está asignado a la tarea puede arrancar el cronómetro.'
      : 'Solo podés detener tu propio cronómetro.'
  }

  if (estado === 409) {
    return arrancando
      ? 'No se pudo arrancar: la tarea ya está facturada, o ya tenés un cronómetro abierto en ella.'
      : 'No hay un cronómetro tuyo abierto en esta tarea.'
  }

  if (estado === 404) return 'La tarea ya no existe o no la podés ver.'

  return `No se pudo ${arrancando ? 'arrancar' : 'detener'} el cronómetro (el servidor respondió ${estado}).`
}
