/**
 * Alta de una solicitud de soporte desde el portal del cliente.
 *
 * Vive fuera del formulario porque es una decision y no un dibujo. Desde que el soporte se pide
 * DENTRO del {espacio}, el `project_id` que viaja a la API **no lo elige nadie**: lo fija la
 * pantalla donde el cliente esta parado. Mandar otro abriria el ticket en el {espacio} equivocado,
 * y eso no se nota hasta que alguien del equipo lo busca donde no esta.
 *
 * Aca se puede probar; dentro del componente habria que montar el dialogo entero para saberlo.
 */

/**
 * Centinela de «sin prioridad».
 *
 * Radix no admite un `value` vacio en una opcion, asi que «no elegi ninguna» necesita un valor
 * propio. Nunca sale de aca: {@link cuerpoDeSolicitud} lo traduce a omitir la clave.
 */
export const SIN_PRIORIDAD = 'ninguna'

/** Tope de `subject` en el contrato de la API. Se corta antes para no ganarse un 422 evitable. */
export const LARGO_ASUNTO = 191

/** Lo que el formulario tiene en la mano cuando la persona pulsa «Enviar solicitud». */
export interface BorradorDeSolicitud {
  asunto: string
  mensaje: string
  /** El {espacio} de la pantalla. Es un numero y no una opcion porque no se elige. */
  proyectoId: number
  /** El valor del selector de prioridad, o {@link SIN_PRIORIDAD} si quedo sin elegir. */
  prioridad: string
}

/**
 * Cuerpo de `POST /portal/tickets`, con los nombres del contrato.
 *
 * `priority` es opcional del otro lado y la API rechaza los campos que no conoce
 * (`rechazarCamposAjenos`), asi que «sin prioridad» se manda **omitiendo la clave** y no con un
 * cero: un cero seria un id de catalogo que no existe.
 */
export interface CuerpoDeSolicitud {
  subject: string
  message: string
  project_id: number
  priority?: number
}

/**
 * Traduce el borrador del formulario al cuerpo que espera la API.
 *
 * @param borrador lo tipeado, mas el {espacio} que fijo la pantalla
 * @returns el cuerpo listo para `POST /portal/tickets`
 */
export function cuerpoDeSolicitud (borrador: BorradorDeSolicitud): CuerpoDeSolicitud {
  const base: CuerpoDeSolicitud = {
    subject: borrador.asunto.trim(),
    message: borrador.mensaje.trim(),
    project_id: borrador.proyectoId
  }

  if (borrador.prioridad === SIN_PRIORIDAD) return base

  return { ...base, priority: Number(borrador.prioridad) }
}

/**
 * Si el borrador alcanza para enviarse.
 *
 * Solo asunto y mensaje: el {espacio} lo pone la pantalla y la prioridad la define el equipo cuando
 * el cliente no la elige. Se mira el texto ya recortado para que una linea de espacios no habilite
 * el boton y despues se coma un 422.
 *
 * @param borrador lo tipeado hasta ahora
 * @returns `true` si se puede enviar
 */
export function solicitudCompleta (borrador: BorradorDeSolicitud): boolean {
  return borrador.asunto.trim() !== '' && borrador.mensaje.trim() !== ''
}
