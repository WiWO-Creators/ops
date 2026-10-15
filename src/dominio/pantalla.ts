/**
 * La pantalla en la que esta parada una persona, tal como la nombra el backend.
 *
 * La misma cadena viaja por dos caminos distintos —el latido de presencia y cada pregunta a Thinking Orb—
 * y **tiene que ser la misma**: el servidor resuelve con ella el ambito de lo que se le pregunta,
 * Por eso vive aca y no duplicada en cada uno. Los enlaces antiguos `/espacios` se normalizan al
 * slug público `/proyectos` para que una pestaña anterior conserve el mismo contexto.
 */

/** Una ruta del panel: la arma Next con `usePathname()`, no la escribe nadie. */
const RUTA_DE_PANEL = /^\/[a-z0-9/_-]*$/

/**
 * Normaliza un pathname para mandarlo como `pantalla`.
 *
 * Devuelve `null` en vez de recortar o arreglar lo que no encaja: esto se manda a un registro de
 * quien mira que, y una ruta que no se entiende no se manda a medias.
 *
 * @param ruta el pathname vigente, tal como lo devuelve `usePathname()`
 * @returns la ruta en minusculas, o `null` si no tiene la forma de una ruta del panel
 */
export function pantallaDeRuta (ruta: string): string | null {
  const normalizada = ruta.toLowerCase()

  if (!RUTA_DE_PANEL.test(normalizada)) return null
  return normalizada.replace(/^\/espacios(?=\/|$)/, '/proyectos')
}

/** Evento de ventana con el que una pantalla pide abrir el chat del Orbe. */
export const EVENTO_ABRIR_ORBE = 'wiwo:abrir-orbe'

/** Preguntas de partida cuando la persona tiene un Meeting Paper abierto. */
export const SUGERENCIAS_DE_ACTA = [
  '¿Qué se acordó en esta reunión?',
  '¿Qué tareas quedaron y de quién son?',
  'Hazme un resumen para el cliente'
]

/**
 * El Meeting Paper que la persona tiene abierto, según la URL.
 *
 * Es una pista para el servidor, nunca un permiso: viaja como `acta_id` y el backend la valida con
 * el mismo `ver()` que abre el acta. Solo cuenta dentro de la pestaña de actas de un Proyecto.
 *
 * @param ruta el pathname vigente
 * @param busqueda los parámetros de la URL (`?tab=actas&acta=12`)
 * @returns el id del acta, o `null` si no hay un acta abierta
 */
export function actaAbiertaDeUrl (ruta: string, busqueda: URLSearchParams): number | null {
  if (!/^\/(proyectos|espacios)\/\d+$/.test(ruta.toLowerCase())) return null
  if (busqueda.get('tab') !== 'actas') return null

  return idPositivoDeTexto(busqueda.get('acta'))
}

/**
 * Lee un id de un parámetro de la URL.
 *
 * La URL la escribe cualquiera: `abc`, `-3`, `1.5`, `nuevo` o `transcribir` no son un id y no pueden
 * terminar en un pedido al BFF ni viajar al servidor como `acta_id`. Es el criterio único de
 * `?acta=` para el panel de actas y para el contexto del orbe.
 *
 * @param crudo el valor del parámetro, o `null` si no viene
 * @returns el entero positivo, o `null` si no lo es
 */
export function idPositivoDeTexto (crudo: string | null): number | null {
  const texto = crudo?.trim() ?? ''
  if (!/^[1-9]\d*$/.test(texto)) return null

  const id = Number(texto)

  return Number.isSafeInteger(id) ? id : null
}

/**
 * Evento de ventana con el que el panel flotante pide a la conversación abierta que empiece de cero.
 * La conversación responde con su propia confirmación de borrado.
 */
export const EVENTO_NUEVA_CONVERSACION = 'wiwo:nueva-conversacion-orbe'
