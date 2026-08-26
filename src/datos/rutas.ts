/**
 * Lista blanca de prefijos que el BFF acepta reenviar.
 *
 * El BFF es un proxy con el token de la persona adosado: sin lista blanca, cualquier ruta que la API
 * exponga hoy o mañana queda alcanzable desde el navegador. Se enumera lo que el frontend usa, y
 * nada mas.
 *
 * `auth` no esta y no debe estar: los tokens se manejan en `/api/sesion`, que es el unico lugar que
 * los ve.
 *
 * Hay una lista por sujeto, no una sola con todo adentro. La API ya impide que un contacto resuelva
 * un token contra las rutas del panel, pero eso es una barrera del otro lado de la red: si esta
 * lista fuera comun, el BFF reenviaria igual y confiaria en que la API diga que no. Dos listas
 * hacen que el pedido ni salga.
 */
import type { Sujeto } from './sobre-sesion'

const PREFIJOS_PERMITIDOS = [
  'me',
  'lookups',
  'custom-fields',
  'staff',
  'clients',
  'projects',
  'tasks',
  // frente: detalle — subrecursos del detalle de Proyecto (contrato secciones 2 y 5).
  'milestones',
  'timesheets',
  'discussions',
  'notes',
  'tickets',
  'contracts',
  'expenses',
  'invoices',
  'estimates'
] as const

/**
 * Lo unico que el portal del cliente necesita.
 *
 * `portal` cubre todos sus recursos, que la API agrupa bajo ese prefijo. `files` es la descarga de
 * adjuntos, que es compartida y se autoriza por sujeto del lado de la API.
 */
const PREFIJOS_PORTAL = ['portal', 'files'] as const

/**
 * Decide si el BFF puede reenviar una ruta.
 *
 * @param segmentos Los segmentos de la ruta pedida, ya separados. Ej: `['tasks', '512', 'comments']`.
 * @param sujeto De quien es la sesion que pide. Cada uno tiene su lista.
 * @returns `true` si el primer segmento esta en la lista blanca de ese sujeto y ningun segmento
 *          intenta escalar.
 */
export function rutaPermitida (segmentos: string[], sujeto: Sujeto = 'staff'): boolean {
  const primero = segmentos[0]

  if (primero === undefined) return false

  // `..` o vacios en el medio saldrian de la lista blanca al normalizar la URL.
  if (segmentos.some((s) => s === '' || s === '.' || s === '..')) return false

  const permitidos: readonly string[] = sujeto === 'contacto' ? PREFIJOS_PORTAL : PREFIJOS_PERMITIDOS

  return permitidos.includes(primero)
}

export { PREFIJOS_PERMITIDOS, PREFIJOS_PORTAL }
