/**
 * Reglas de la lista de seguidores predeterminados de un Espacio o de una plantilla (WIW-0496).
 *
 * El tope es el de la API (`Escritura\SeguidoresPredeterminados::TOPE`): se repite acá para decirlo
 * antes de guardar, no para reemplazar el 422.
 */

/** Cuántas personas admite la lista. */
export const TOPE_SEGUIDORES_PREDETERMINADOS = 30

/**
 * Si el borrador difiere de lo guardado, sin mirar el orden: la API guarda un conjunto.
 *
 * @param guardados ids que devolvió la API
 * @param borrador ids elegidos en pantalla
 * @returns `true` si hay algo que guardar
 */
export function seguidoresCambiaron (guardados: readonly number[], borrador: readonly number[]): boolean {
  if (guardados.length !== borrador.length) return true

  return borrador.some((id) => !guardados.includes(id))
}

/**
 * Lo que impide guardar el borrador, o `null` si se puede.
 *
 * @param borrador ids elegidos en pantalla
 * @returns el motivo, listo para mostrar junto al campo
 */
export function problemaDeSeguidores (borrador: readonly number[]): string | null {
  return borrador.length > TOPE_SEGUIDORES_PREDETERMINADOS
    ? `Se admiten hasta ${TOPE_SEGUIDORES_PREDETERMINADOS} seguidores predeterminados.`
    : null
}
