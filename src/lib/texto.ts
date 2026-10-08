/**
 * Utilidades de texto compartidas por los buscadores.
 *
 * Es un `.ts` sin dependencias para que cualquier módulo de `dominio/` lo importe y se pueda probar
 * con `node --test`.
 */

/**
 * Lleva un texto a su forma comparable: sin acentos, en minúsculas y sin espacios en los bordes.
 *
 * Sin esto, "nunez" no encuentra a "Núñez" y quien busca concluye que la persona no está en el
 * sistema. Es el caso normal y no el borde: nadie escribe las tildes al filtrar una lista.
 *
 * @param texto lo que se escribió, o el nombre contra el que se compara
 * @returns el texto comparable; una cadena vacía queda vacía
 */
export function sinAcentos (texto: string): string {
  return texto.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}
