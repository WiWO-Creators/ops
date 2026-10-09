import type { Referencia } from '@/datos/recursos'
import { esHtml, htmlVacio, textoAHtml, textoPlano } from './texto-rico.ts'
import { LARGO_MENSAJE_TICKET } from './ticket-limites.ts'

/**
 * Alta de una solicitud de soporte desde el portal del cliente.
 *
 * Vive fuera del formulario porque es una decision y no un dibujo: a que {espacio} se manda el
 * ticket, cual viene elegido de entrada y cuando el boton de enviar se puede pulsar. Abrir el ticket
 * en el {espacio} equivocado no se nota hasta que alguien del equipo lo busca donde no esta, asi que
 * la eleccion se prueba acá; dentro del componente habria que montar el dialogo entero para saberlo.
 */

/**
 * Centinela de «sin prioridad».
 *
 * Radix no admite un `value` vacio en una opcion, asi que «no elegi ninguna» necesita un valor
 * propio. Nunca sale de aca: {@link cuerpoDeSolicitud} lo traduce a omitir la clave.
 */
export const SIN_PRIORIDAD = 'ninguna'

/**
 * Valor del selector de {espacio} cuando todavia no se eligio ninguno.
 *
 * Es la cadena vacia y no un centinela con nombre porque ninguna opcion la lleva: el desplegable
 * arranca sin seleccion y Radix solo prohibe el `value` vacio en las opciones, no en el control.
 */
export const SIN_ESPACIO = ''

/** Tope de `subject` en el contrato de la API. Se corta antes para no ganarse un 422 evitable. */
export const LARGO_ASUNTO = 191

/** Lo que el formulario tiene en la mano cuando la persona pulsa «Enviar solicitud». */
export interface BorradorDeSolicitud {
  asunto: string
  /** El mensaje como HTML del editor de texto enriquecido; `''` si no hay nada visible. */
  mensaje: string
  /** El valor del selector de {espacio}, o {@link SIN_ESPACIO} si quedo sin elegir. */
  espacio: string
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
  /** HTML del editor. La API lo sanea y guarda tambien una version en texto. */
  message: string
  /** Avisa a la API que `message` es HTML y no texto plano. */
  format: 'html'
  project_id: number
  priority?: number
}

/**
 * Con que {espacio} nace abierto el formulario.
 *
 * Elegir entre una sola opcion es trabajo que no decide nada, y el cliente que entra derecho a un
 * {espacio} —porque su cliente tiene uno de entrada— casi siempre pide sobre ese. En los dos casos
 * el desplegable llega resuelto y se puede cambiar igual.
 *
 * El {espacio} de entrada manda sobre la unica opcion solo en apariencia: si hay uno solo, los dos
 * criterios apuntan al mismo. Y si el de entrada ya no esta en la lista —lo archivaron, o este
 * contacto dejo de verlo— se ignora, para no preseleccionar un id que la API va a rechazar.
 *
 * @param espacios los {espacios} del contacto, tal como los ofrece el selector
 * @param entradaId el `proyecto_de_entrada` del contacto, o `null` si no tiene
 * @returns el valor inicial del selector, o {@link SIN_ESPACIO} si no hay uno obvio
 */
export function espacioPorDefecto (espacios: Referencia[], entradaId: number | null = null): string {
  if (entradaId !== null && espacios.some((espacio) => espacio.id === entradaId)) {
    return String(entradaId)
  }

  const [primero, ...resto] = espacios

  return primero !== undefined && resto.length === 0 ? String(primero.id) : SIN_ESPACIO
}

/**
 * Traduce el borrador del formulario al cuerpo que espera la API.
 *
 * Solo se llama con un borrador que {@link solicitudCompleta} aprobo, asi que `espacio` es siempre
 * un id: `Number(SIN_ESPACIO)` seria `0`, y ese es justamente el caso que el boton deshabilitado
 * impide.
 *
 * @param borrador lo tipeado, mas el {espacio} elegido
 * @returns el cuerpo listo para `POST /portal/tickets`
 */
export function cuerpoDeSolicitud (borrador: BorradorDeSolicitud): CuerpoDeSolicitud {
  const base: CuerpoDeSolicitud = {
    subject: borrador.asunto.trim(),
    message: borrador.mensaje.trim(),
    format: 'html',
    project_id: Number(borrador.espacio)
  }

  if (borrador.prioridad === SIN_PRIORIDAD) return base

  return { ...base, priority: Number(borrador.prioridad) }
}

/**
 * Si el borrador alcanza para enviarse.
 *
 * Asunto, mensaje y {espacio}: los tres son obligatorios en el contrato. La prioridad no, porque la
 * define el equipo cuando el cliente no la elige. Se mira el texto ya recortado, y del mensaje solo lo visible
 * (`<p></p>` y `&nbsp;` no cuentan, y el tope de {@link LARGO_MENSAJE_TICKET} se mide sobre
 * el texto visible) para que una linea de espacios, o un mensaje pasado de largo, no habilite el boton
 * y despues se coma un 422.
 *
 * @param borrador lo tipeado hasta ahora
 * @returns `true` si se puede enviar
 */
export function solicitudCompleta (borrador: BorradorDeSolicitud): boolean {
  return borrador.asunto.trim() !== '' &&
    !htmlVacio(borrador.mensaje) &&
    textoPlano(borrador.mensaje).length <= LARGO_MENSAJE_TICKET &&
    borrador.espacio !== SIN_ESPACIO
}

/**
 * Clave de `sessionStorage` del borrador del alta de un contacto.
 *
 * Lleva el id del contacto porque la pestaña sobrevive a cerrar sesion: sin el, quien entra despues
 * en el mismo navegador veria el borrador de la persona anterior.
 *
 * @param contactoId el contacto que esta escribiendo
 * @returns la clave de `sessionStorage`
 */
export function claveDeBorradorDeSolicitud (contactoId: number): string {
  return `ticket-borrador:contacto:${contactoId}:nuevo`
}

/**
 * Serializa el borrador del alta para guardarlo.
 *
 * @param borrador lo tipeado y elegido hasta ahora; el mensaje es el HTML del editor
 * @returns el JSON a guardar, o cadena vacia si no hay nada escrito (que `guardarBorrador`
 *          interpreta como "borrar"): elegir un {espacio} o una prioridad solo no vale un borrador
 */
export function serializarBorradorDeSolicitud (borrador: BorradorDeSolicitud): string {
  if (borrador.asunto.trim() === '' && htmlVacio(borrador.mensaje)) return ''

  return JSON.stringify(borrador)
}

/**
 * El mensaje de un borrador guardado, como HTML del editor y dentro del tope de largo.
 *
 * El tope se mide sobre el texto visible, igual que el editor. Un guardado de antes del editor es
 * texto plano y se convierte; uno que se pasa del tope se recorta sobre el texto y se vuelve a
 * armar, porque cortar el HTML por la mitad dejaria marcado roto.
 *
 * @param valor el campo `mensaje` del JSON guardado
 * @returns HTML listo para el editor, o `''` si no hay nada utilizable
 */
function mensajeGuardado (valor: unknown): string {
  if (typeof valor !== 'string' || htmlVacio(valor)) return ''

  const html = esHtml(valor) ? valor : textoAHtml(valor)
  const visible = textoPlano(html)

  return visible.length <= LARGO_MENSAJE_TICKET ? html : textoAHtml(visible.slice(0, LARGO_MENSAJE_TICKET))
}

/**
 * Reconstruye el borrador guardado, descartando lo que ya no es valido.
 *
 * El {espacio} y la prioridad se conservan solo si siguen en las listas de hoy: un id que el
 * contacto ya no ve haria que la API rechazara el envio. Un guardado roto o de otra forma vale como
 * borrador vacio, para que el formulario nunca arranque con basura.
 *
 * @param guardado lo que devolvio `leerBorrador`
 * @param espacios los {espacios} del contacto
 * @param prioridades las prioridades del catalogo
 * @param entradaId el `proyecto_de_entrada` del contacto, para el valor inicial del {espacio}
 * @returns el borrador listo para poblar el formulario
 */
export function leerBorradorDeSolicitud (
  guardado: string,
  espacios: Referencia[],
  prioridades: Referencia[],
  entradaId: number | null = null
): BorradorDeSolicitud {
  const inicial: BorradorDeSolicitud = {
    asunto: '',
    mensaje: '',
    espacio: espacioPorDefecto(espacios, entradaId),
    prioridad: SIN_PRIORIDAD
  }

  if (guardado === '') return inicial

  try {
    const dato = JSON.parse(guardado) as Partial<Record<keyof BorradorDeSolicitud, unknown>>
    const existe = (lista: Referencia[], valor: unknown): boolean =>
      typeof valor === 'string' && lista.some((opcion) => String(opcion.id) === valor)

    return {
      asunto: typeof dato.asunto === 'string' ? dato.asunto.slice(0, LARGO_ASUNTO) : '',
      mensaje: mensajeGuardado(dato.mensaje),
      espacio: existe(espacios, dato.espacio) ? String(dato.espacio) : inicial.espacio,
      prioridad: existe(prioridades, dato.prioridad) ? String(dato.prioridad) : SIN_PRIORIDAD
    }
  } catch {
    return inicial
  }
}
