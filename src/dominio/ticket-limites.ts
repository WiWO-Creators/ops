/**
 * Limites de texto de los tickets y el contador que avisa cuando uno se acerca.
 *
 * Es el tope del contacto en el portal (`message` de su respuesta o de su solicitud nueva): cortar antes
 * evita que la API rechace con un 422 un texto que ya escribio entero. El equipo no lo tiene —su
 * limite es el del cuerpo de la peticion—, asi que {@link topeDeMensaje} lo devuelve solo para el portal.
 */

/** Tope de caracteres de un mensaje de ticket, tanto en la respuesta como en el alta. */
export const LARGO_MENSAJE_TICKET = 20_000

/** Desde que fraccion del tope se muestra el contador: antes seria ruido sobre un texto corto. */
const FRACCION_PARA_AVISAR = 0.9

/**
 * El tope de caracteres que aplica a quien escribe.
 *
 * @param sujeto de quien es la caja: `portal` (el contacto) o `panel` (el equipo)
 * @returns {@link LARGO_MENSAJE_TICKET} para el portal; `undefined` para el equipo, sin tope
 */
export function topeDeMensaje (sujeto: 'panel' | 'portal'): number | undefined {
  return sujeto === 'portal' ? LARGO_MENSAJE_TICKET : undefined
}

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
