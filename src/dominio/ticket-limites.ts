/**
 * Limites de texto de los tickets y el contador que avisa cuando uno se acerca.
 *
 * Son los topes del contrato (`message` de una respuesta o de una solicitud nueva): cortar antes
 * evita que la API rechace con un 422 un texto que la persona ya escribio entero.
 */

/** Tope de caracteres de un mensaje de ticket, tanto en la respuesta como en el alta. */
export const LARGO_MENSAJE_TICKET = 20_000

/** Desde que fraccion del tope se muestra el contador: antes seria ruido sobre un texto corto. */
const FRACCION_PARA_AVISAR = 0.9

/**
 * El texto del contador de caracteres, solo cuando el mensaje esta cerca del tope.
 *
 * @param largo cuantos caracteres tiene lo escrito
 * @param tope el maximo permitido; por defecto {@link LARGO_MENSAJE_TICKET}
 * @returns p. ej. `19.500 de 20.000 caracteres`, o `null` si todavia queda mucho margen
 */
export function contadorDeLargo (largo: number, tope: number = LARGO_MENSAJE_TICKET): string | null {
  if (largo < tope * FRACCION_PARA_AVISAR) return null

  const formato = new Intl.NumberFormat('es-CL')

  return `${formato.format(largo)} de ${formato.format(tope)} caracteres`
}
