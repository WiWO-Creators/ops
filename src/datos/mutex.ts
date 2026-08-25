/**
 * Deduplicacion de operaciones concurrentes por clave.
 *
 * Existe para el refresco de tokens, donde repetir la operacion no es solo ineficiente sino
 * destructivo: la API revoca todas las sesiones del staff cuando ve un token de refresco reusado.
 *
 * Vive aparte de `refresco.ts` para poder probarse sin arrastrar Next ni la API.
 */

/**
 * Corre `operacion` una sola vez por clave mientras haya una en vuelo.
 *
 * Las llamadas que lleguen con la misma clave mientras la primera no termine reciben esa misma
 * promesa. Al terminar —bien o mal— la clave se libera, asi que un fallo no deja la clave envenenada.
 *
 * @param enVuelo Mapa de estado. Lo provee el llamador para que cada uso tenga el suyo.
 * @param clave Identifica la operacion. Para el refresco es el propio token.
 * @param operacion Lo que se ejecuta si no hay nada en vuelo para esa clave.
 * @returns El resultado de la operacion, compartido entre todos los llamadores concurrentes.
 */
export async function unaVezPorClave<T> (
  enVuelo: Map<string, Promise<T>>,
  clave: string,
  operacion: () => Promise<T>
): Promise<T> {
  const enCurso = enVuelo.get(clave)

  if (enCurso !== undefined) return await enCurso

  const promesa = operacion()
  enVuelo.set(clave, promesa)

  try {
    return await promesa
  } finally {
    enVuelo.delete(clave)
  }
}
