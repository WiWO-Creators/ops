/**
 * Helpers de presentacion de personas.
 *
 * Viven acá y no dentro del componente porque son logica pura y necesitan prueba: Node puede despojar
 * los tipos de un `.ts`, pero no el JSX de un `.tsx`, asi que nada testeable debe quedar dentro de un
 * componente.
 */

/**
 * Iniciales de un nombre completo.
 *
 * Toma la primera letra de la primera y de la ultima palabra. Con una sola palabra devuelve una sola
 * letra: "Ana" da "A" y no "AN", porque dos letras de la misma palabra se leen como un nombre que no
 * existe.
 *
 * @param nombre nombre completo
 * @param cantidad cuantas letras devolver; en circulos chicos dos letras no entran y se cortan
 * @returns una o dos iniciales en mayuscula, o `'?'` si el nombre viene vacio
 */
export function iniciales (nombre: string, cantidad: 1 | 2 = 2): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return '?'

  const primera = (palabras[0]?.[0] ?? '').toUpperCase()
  if (cantidad === 1) return primera

  const ultima = palabras.length > 1 ? (palabras[palabras.length - 1]?.[0] ?? '') : ''
  return (primera + ultima).toUpperCase()
}

/**
 * Matiz estable derivado de un nombre.
 *
 * El mismo nombre da siempre el mismo color, sin guardar nada: el color se vuelve una pista visual
 * util al recorrer una lista de asignados. Es un hash simple, no criptografico — solo necesita
 * repartir de forma pareja y ser determinista.
 *
 * @param nombre nombre completo
 * @returns matiz en grados, apto para `oklch`
 */
export function matizDe (nombre: string): number {
  let suma = 0
  for (let i = 0; i < nombre.length; i++) suma = (suma * 31 + nombre.charCodeAt(i)) % 360
  return suma
}

/**
 * Colores de fondo y texto de un avatar sin foto.
 *
 * La luminosidad y el croma son fijos y solo cambia el matiz, asi que todos los avatares tienen el
 * mismo contraste sin importar el nombre. Con colores libres, algunos quedarian ilegibles.
 *
 * @param nombre nombre completo
 * @returns par de colores en `oklch`
 */
export function coloresAvatar (nombre: string): { fondo: string, texto: string } {
  const matiz = matizDe(nombre)
  return {
    fondo: `oklch(0.88 0.06 ${matiz})`,
    texto: `oklch(0.32 0.09 ${matiz})`
  }
}
