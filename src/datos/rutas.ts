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
  // Contactos de un cliente: el alta cuelga de `clients/{id}/contacts`, pero editar y borrar cuelgan
  // de `contacts/{id}`, asi que hace falta el prefijo propio.
  'contacts',
  'projects',
  'tasks',
  // frente: detalle — subrecursos del detalle de Proyecto (contrato secciones 2 y 5).
  'milestones',
  'timesheets',
  'discussions',
  'notes',
  // `tickets` no esta: el soporte se atiende en wiwo.center y el panel ya no monta ninguna
  // pantalla que lo pida. Si algun dia vuelve, vuelve aca.
  // Salas de reunion y sus reservas: la API las cuelga todas de `rooms`, asi que una sola entrada
  // cubre el listado de salas, la agenda, el alta y la cancelacion.
  'rooms',
  'contracts',
  'expenses',
  'invoices',
  'estimates',
  // Descarga de adjuntos. No estaba porque hasta ahora la API no tenia esa ruta y toda `url` que
  // emitia era un 404; con el endpoint de descarga ya existe y el panel puede usarla.
  'files',
  // Avisos: campana, preferencias y —solo para quien administra— el interruptor de correo y el
  // visor de la cola. La API ya filtra `/settings` y `/mail-queue` por admin; el BFF solo decide si
  // la ruta existe, no quien puede pisarla.
  'notifications'
] as const

/**
 * Lo unico que el portal del cliente necesita.
 *
 * `portal` cubre todos sus recursos, que la API agrupa bajo ese prefijo. `files` es la descarga de
 * adjuntos, que es compartida y se autoriza por sujeto del lado de la API.
 */
const PREFIJOS_PORTAL = ['portal', 'files'] as const

/**
 * Prefijos que sirven a los dos sujetos.
 *
 * Solo la descarga de adjuntos: la API la expone fuera de `/portal` porque las URLs que ya venia
 * emitiendo apuntan ahi, y decide a quien le responde mirando el token. Como el prefijo no dice de
 * quien es el pedido, el BFF tampoco puede deducirlo de la ruta y tiene que mirar que sesion hay.
 */
const PREFIJOS_COMPARTIDOS = ['files'] as const

/** `true` si esta ruta puede venir de cualquiera de los dos sujetos. */
export function rutaCompartida (segmentos: string[]): boolean {
  const primero = segmentos[0]

  return primero !== undefined && (PREFIJOS_COMPARTIDOS as readonly string[]).includes(primero)
}

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

export { PREFIJOS_PERMITIDOS, PREFIJOS_PORTAL, PREFIJOS_COMPARTIDOS }
