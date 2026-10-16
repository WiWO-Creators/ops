/**
 * La forma de un código de pantalla de área: cinco caracteres del alfabeto sin ambigüedades.
 *
 * Se valida antes de reenviar nada a la API para que las rutas abiertas de la pantalla no sirvan de
 * túnel hacia otras rutas. La caja no importa (nadie controla las mayúsculas con un control remoto y
 * la API normaliza), pero la clase de caracteres sí: nada que pueda salirse del segmento de URL.
 *
 * Tiene que seguir a `Escritura\Pantallas::ALFABETO` del board. Si allá se agrega un símbolo y acá
 * no, las rutas contestan 404 a códigos que la API considera válidos.
 */
export const FORMA_DE_CODIGO = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$/i

/**
 * Dice si un texto tiene la forma de un código de pantalla.
 *
 * @param codigo el segmento de URL recibido
 * @returns `true` si son cinco caracteres del alfabeto permitido
 */
export function esCodigoDePantalla (codigo: string): boolean {
  return FORMA_DE_CODIGO.test(codigo)
}
