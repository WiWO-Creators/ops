/**
 * Lista blanca de prefijos que el BFF acepta reenviar.
 *
 * El BFF es un proxy con el token de la persona adosado: sin lista blanca, cualquier ruta que la API
 * exponga hoy o mañana queda alcanzable desde el navegador. Se enumera lo que el frontend usa, y
 * nada mas.
 *
 * `auth` no esta y no debe estar: los tokens se manejan en `/api/sesion`, que es el unico lugar que
 * los ve.
 */
const PREFIJOS_PERMITIDOS = [
  'me',
  'lookups',
  'custom-fields',
  'staff',
  'clients',
  'projects',
  'tasks'
] as const

/**
 * Decide si el BFF puede reenviar una ruta.
 *
 * @param segmentos Los segmentos de la ruta pedida, ya separados. Ej: `['tasks', '512', 'comments']`.
 * @returns `true` si el primer segmento esta en la lista blanca y ningun segmento intenta escalar.
 */
export function rutaPermitida (segmentos: string[]): boolean {
  const primero = segmentos[0]

  if (primero === undefined) return false

  // `..` o vacios en el medio saldrian de la lista blanca al normalizar la URL.
  if (segmentos.some((s) => s === '' || s === '.' || s === '..')) return false

  return (PREFIJOS_PERMITIDOS as readonly string[]).includes(primero)
}

export { PREFIJOS_PERMITIDOS }
