import { rutaDeTicket, type FuenteDeTicket, type MensajeDeTicket, type TicketVista } from './ticket-vista.ts'

/**
 * Reglas puras del sondeo del modal de ticket: que se pide en cada lectura, cuando una lectura no
 * cambia nada y como se reconoce en una lista la fila de un ticket sin leer. Viven aca y no en el
 * componente para poder probarlas sin montar nada.
 */

/** Espera que agrupa avisos seguidos de `ops:tickets-cambiados` en un solo refresco de la lista. */
export const ESPERA_AVISOS_DE_TICKET_MS = 300

/** Atributo con el que `EnlaceATicket` marca el enlace de un ticket que la lista muestra sin leer. */
export const ATRIBUTO_TICKET_SIN_LEER = 'data-ticket-sin-leer'

/** Las rutas que pide una lectura del ticket; `null` en las que no se piden. */
export interface RutasDeLectura {
  ficha: string
  /** El hilo aparte, solo donde el sujeto lo trae por separado (el portal lo trae dentro de la ficha). */
  hilo: string | null
  /** Los adjuntos del mensaje de apertura: se piden una vez por apertura, no en cada sondeo. */
  archivos: string | null
}

/**
 * Que rutas hay que pedir en una lectura del ticket.
 *
 * Los adjuntos de apertura casi nunca cambian: con los ya conocidos, el sondeo de cada 30 s pide solo
 * ficha e hilo, que es lo que lleva los mensajes nuevos y la marca de lectura.
 *
 * @param fuente de donde baja el ticket
 * @param ticketId el ticket
 * @param adjuntosConocidos `true` si la apertura ya los trajo bien
 * @returns las rutas de esta lectura
 */
export function rutasDeLectura (fuente: FuenteDeTicket, ticketId: number, adjuntosConocidos: boolean): RutasDeLectura {
  return {
    ficha: rutaDeTicket(fuente.ticket, ticketId),
    hilo: fuente.respuestas === null ? null : rutaDeTicket(fuente.respuestas, ticketId),
    archivos: fuente.archivos === null || adjuntosConocidos ? null : rutaDeTicket(fuente.archivos, ticketId)
  }
}

/**
 * Igualdad estructural de datos planos (objetos, arreglos y primitivos), sin ciclos.
 *
 * @param a un valor
 * @param b otro valor
 * @returns `true` si tienen las mismas claves y los mismos valores, a cualquier profundidad
 */
function sonIguales (a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false

  const clavesA = Object.keys(a)

  if (clavesA.length !== Object.keys(b).length) return false

  return clavesA.every((clave) => (
    clave in b && sonIguales((a as Record<string, unknown>)[clave], (b as Record<string, unknown>)[clave])
  ))
}

/**
 * El hilo nuevo, reusando el mensaje anterior de cada `clave` que no cambio.
 *
 * @returns el hilo previo si ni un mensaje cambio; si no, uno nuevo con los mensajes intactos por referencia
 */
function conservarHilo (previo: MensajeDeTicket[], nuevo: MensajeDeTicket[]): MensajeDeTicket[] {
  const anteriores = new Map(previo.map((mensaje) => [mensaje.clave, mensaje]))
  const mensajes = nuevo.map((mensaje) => {
    const anterior = anteriores.get(mensaje.clave)

    return anterior !== undefined && sonIguales(anterior, mensaje) ? anterior : mensaje
  })

  return mensajes.length === previo.length && mensajes.every((mensaje, i) => mensaje === previo[i]) ? previo : mensajes
}

/**
 * Conserva las referencias de lo que no cambio entre dos lecturas del mismo ticket.
 *
 * El sondeo trae una vista nueva cada 30 s aunque nadie haya escrito: reemplazarla vuelve a dibujar
 * el modal entero. Con esto, si nada cambio devuelve la vista anterior (React no renderiza) y, si
 * cambio algo, los mensajes intactos conservan su referencia para que `memo` los salte.
 *
 * Compara toda la vista y no una firma de campos elegidos (ids y fechas del hilo, estado…): una
 * firma incompleta esconderia una edicion del asunto, la asignacion o el Proyecto.
 *
 * @param previa la vista que se esta mostrando
 * @param nueva la que acaba de llegar
 * @returns `previa` si son iguales; si no, `nueva` con el hilo reutilizado donde se pudo
 */
export function conservarReferencias (previa: TicketVista, nueva: TicketVista): TicketVista {
  const hilo = conservarHilo(previa.hilo, nueva.hilo)
  const vista = hilo === nueva.hilo ? nueva : { ...nueva, hilo }

  return sonIguales(previa, vista) ? previa : vista
}

/**
 * Selector del enlace de un ticket que la lista muestra sin leer.
 *
 * @param id el ticket, un entero ya validado
 * @returns el selector CSS
 */
export function selectorDeTicketSinLeer (id: number): string {
  return `a[${ATRIBUTO_TICKET_SIN_LEER}="${id}"]`
}
