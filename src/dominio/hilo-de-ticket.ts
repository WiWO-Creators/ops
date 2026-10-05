/**
 * Reglas puras del seguimiento del hilo de un ticket: cuando el ultimo mensaje se considera a la
 * vista y que hacer cuando llegan mensajes nuevos.
 *
 * Viven aparte del hook (`componentes/tickets/useSeguimientoDelHilo.ts`) para probarse con el runner
 * de Node, sin DOM.
 */

/**
 * Cuanto puede quedar del ultimo mensaje por debajo del borde visible y seguir contando como "al
 * final". Cubre el relleno del panel y las diferencias de redondeo del navegador; menos que eso
 * dejaria sin avisar a quien esta pegado al final, y mas lo daria por visto estando a medio mensaje.
 */
export const MARGEN_DE_FINAL_PX = 48

/** Lo unico que hace falta de un rectangulo del DOM para decidir si algo esta a la vista. */
export interface RectanguloVertical {
  bottom: number
}

/**
 * Si el ultimo mensaje ya esta a la vista dentro de la zona que scrollea.
 *
 * Se mide contra el mensaje y no contra el final del panel porque debajo del hilo vive la caja de
 * respuesta: quien llego al ultimo mensaje esta "al final" aunque le quede la caja por recorrer.
 *
 * @param mensaje rectangulo del ultimo mensaje
 * @param zona rectangulo de la zona que scrollea
 * @param margen tolerancia en pixeles bajo el borde inferior de la zona
 * @returns `true` si el ultimo mensaje se ve (casi) entero
 */
export function ultimoMensajeALaVista (
  mensaje: RectanguloVertical,
  zona: RectanguloVertical,
  margen: number = MARGEN_DE_FINAL_PX
): boolean {
  return mensaje.bottom <= zona.bottom + margen
}

/** Lo que hay que hacer con el hilo despues de que cambie su cantidad de mensajes. */
export type AccionDelHilo = 'aterrizar' | 'seguir' | 'avisar' | 'nada'

/**
 * Decide que hacer cuando cambia la cantidad de mensajes del hilo.
 *
 * - `aterrizar`: primera vez que se ve el hilo; se lleva la vista al ultimo mensaje.
 * - `seguir`: llegaron mensajes y la persona estaba al final; se la acompaña hasta el nuevo.
 * - `avisar`: llegaron mensajes y la persona esta leyendo mas arriba; se le avisa sin moverla.
 * - `nada`: no crecio (un refresco sin novedades o un hilo que se achico).
 *
 * @param anterior cantidad en la lectura previa, o `null` si todavia no se habia visto el hilo
 * @param actual cantidad ahora
 * @param estabaAlFinal si el ultimo mensaje estaba a la vista antes de que llegara lo nuevo
 * @returns la accion
 */
export function accionDelHilo (anterior: number | null, actual: number, estabaAlFinal: boolean): AccionDelHilo {
  if (anterior === null) return actual > 0 ? 'aterrizar' : 'nada'
  if (actual <= anterior) return 'nada'

  return estabaAlFinal ? 'seguir' : 'avisar'
}
