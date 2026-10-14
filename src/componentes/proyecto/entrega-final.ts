/**
 * Las reglas del lado del cliente de una Tarea: quién la sigue y qué se le manda al completarla.
 *
 * Dos cosas que se apoyan una en la otra y que la API sirve juntas (`GET tasks/{id}/contact-followers`):
 *
 *  - **Seguidores-contacto.** Los seguidores de Perfex son solo staff; los contactos del cliente que
 *    siguen una Tarea viven en una relación propia. La API los siembra al crear la Tarea y el equipo (o
 *    el propio contacto) los quita o los vuelve a sumar.
 *  - **Entrega al completar.** Al completar con un archivo final, la API manda a esos seguidores el
 *    correo «tu tarea terminó» con el archivo ADJUNTO. Sin archivo, la Tarea se completa y no sale
 *    correo.
 *
 * Vive en un `.ts` sin React ni `fetch` por la razón de siempre en este proyecto: Node despoja los
 * tipos de un `.ts` pero no el JSX, y así la decisión se puede probar.
 */

/** Quién mira: el panel del equipo o el portal del cliente. Decide qué ruta de la API se usa. */
export type SujetoDeSeguidores = 'panel' | 'portal'

/** Un contacto del cliente, con si sigue la Tarea. El portal no manda `email` ni `portal_access`. */
export interface ContactoSeguidor {
  id: number
  full_name: string
  is_primary: boolean
  following: boolean
  email?: string
  portal_access?: boolean
}

/** Lo que la API informa para ofrecer el archivo final sin prometer un correo que no va a salir. */
export interface InfoDeEntrega {
  /** Tope del adjunto, en bytes (`WIWO_ENTREGA_MAX_BYTES`). */
  max_bytes: number
  /** El interruptor general no está apagado Y el correo está permitido en «Avisos por correo». */
  mail_enabled: boolean
  /** `apagado`, `prueba` (va a una casilla interna) o `real`. */
  mail_mode: string
  /** El cliente ve la Tarea. Una Tarea oculta nunca manda este correo. */
  task_visible_to_client: boolean
}

/** La respuesta de la API: la del panel trae `can_edit` y `delivery`; la del portal, `can_manage_others`. */
export interface SeguidoresDeContacto {
  contacts: ContactoSeguidor[]
  can_edit?: boolean
  can_manage_others?: boolean
  self_id?: number
  delivery?: InfoDeEntrega
}

/** Lo que la persona eligió como archivo final al completar. */
export type EleccionDeEntrega =
  | { modo: 'ninguno' }
  | { modo: 'existente', archivoId: number | null }
  | { modo: 'nuevo', archivo: File | null }

/** Sin archivo: la Tarea se completa y no sale correo. Es el valor inicial. */
export const SIN_ENTREGA: EleccionDeEntrega = { modo: 'ninguno' }

/**
 * Ruta del listado de seguidores-contacto de una Tarea.
 *
 * @param tareaId id del Proceso
 * @param sujeto quién pregunta
 * @returns la ruta del BFF, sin barra inicial
 */
export function rutaDeSeguidoresDeContacto (tareaId: number, sujeto: SujetoDeSeguidores): string {
  const id = encodeURIComponent(String(tareaId))

  return sujeto === 'portal' ? `portal/tasks/${id}/followers` : `tasks/${id}/contact-followers`
}

/**
 * Ruta con la que se suma o se quita un contacto.
 *
 * @param tareaId id del Proceso
 * @param contactoId id del contacto
 * @param sujeto quién escribe
 */
export function rutaDeUnSeguidorDeContacto (tareaId: number, contactoId: number, sujeto: SujetoDeSeguidores): string {
  return `${rutaDeSeguidoresDeContacto(tareaId, sujeto)}/${encodeURIComponent(String(contactoId))}`
}

/**
 * Los contactos que siguen la Tarea.
 *
 * @param contactos la lista completa del cliente
 */
export function contactosQueSiguen (contactos: readonly ContactoSeguidor[]): ContactoSeguidor[] {
  return contactos.filter((contacto) => contacto.following)
}

/**
 * Si la Tarea tiene sentido para el correo de entrega: se manda de verdad, el cliente la ve y alguien la
 * sigue. Con falso, el diálogo de completar no se abre: completar sigue siendo un clic.
 *
 * @param datos la respuesta de la API
 */
export function entregaEsRelevante (datos: SeguidoresDeContacto): boolean {
  const info = datos.delivery

  return info !== undefined && info.mail_enabled && info.task_visible_to_client
    && contactosQueSiguen(datos.contacts).length > 0
}

/** Lo que se le dice a la persona sobre el correo que va a salir (o no). */
export interface ResumenDeEntrega {
  /** `true` si, con un archivo elegido, el correo saldría. */
  saldria: boolean
  /** La frase, lista para mostrar. */
  texto: string
}

/**
 * Qué decirle a quien completa sobre el correo de entrega.
 *
 * Es la parte honesta del diálogo: si el correo no va a salir (interruptor apagado, Tarea oculta, nadie
 * la sigue), lo dice en vez de dejar que se elija un archivo que no viajará.
 *
 * @param datos la respuesta de la API
 */
export function resumenDeEntrega (datos: SeguidoresDeContacto): ResumenDeEntrega {
  const info = datos.delivery
  const siguen = contactosQueSiguen(datos.contacts)

  if (info !== undefined && !info.task_visible_to_client) {
    return { saldria: false, texto: 'La tarea no está visible para el cliente, así que no se envía ningún correo.' }
  }

  if (siguen.length === 0) {
    return { saldria: false, texto: 'La tarea no tiene seguidores del cliente: no hay a quién enviarle el correo.' }
  }

  if (info !== undefined && !info.mail_enabled) {
    return {
      saldria: false,
      texto: 'El correo de entrega está apagado en Ops (Administración → Avisos por correo): la tarea se completa y el archivo no se envía.'
    }
  }

  const nombres = siguen.map((contacto) => contacto.full_name).join(', ')

  if (info?.mail_mode === 'prueba') {
    return { saldria: true, texto: `Modo de prueba: el correo para ${nombres} llega a una casilla interna, no al cliente.` }
  }

  return { saldria: true, texto: `Se envía por correo a ${nombres}, con el archivo adjunto.` }
}

/**
 * Valida la elección antes de completar.
 *
 * @param eleccion lo elegido
 * @param maxBytes tope del adjunto, si ya se conoce
 * @returns el motivo por el que no se puede completar así, o `null` si está bien
 */
export function errorDeEleccion (eleccion: EleccionDeEntrega, maxBytes?: number): string | null {
  if (eleccion.modo === 'existente' && eleccion.archivoId === null) return 'Elige cuál de los adjuntos se envía.'
  if (eleccion.modo === 'nuevo' && eleccion.archivo === null) return 'Elige el archivo que quieres subir.'

  if (eleccion.modo === 'nuevo' && eleccion.archivo !== null && eleccion.archivo.size === 0) {
    return 'El archivo está vacío.'
  }

  if (eleccion.modo === 'nuevo' && eleccion.archivo !== null && maxBytes !== undefined && eleccion.archivo.size > maxBytes) {
    return 'El archivo pesa más del máximo que se puede adjuntar al correo.'
  }

  return null
}

/**
 * Texto del botón que completa, según lo elegido: dice si saldrá un correo.
 *
 * @param eleccion lo elegido
 */
export function etiquetaDeCompletar (eleccion: EleccionDeEntrega): string {
  return eleccion.modo === 'ninguno' ? 'Completar sin correo' : 'Completar y enviar'
}

/**
 * La frase del aviso tras completar con un archivo final, o `null` si no hay nada que contar.
 *
 * No afirma lo que no pasó: con el correo apagado (o sin saber si está encendido) la tarea quedó
 * completada y el archivo no viajó, y decir «se envió» sería mentir.
 *
 * @param info lo que informó la API antes de completar
 * @param hayArchivo si se completó con un archivo final
 */
export function avisoDeEntrega (info: InfoDeEntrega | undefined, hayArchivo: boolean): string | null {
  if (!hayArchivo || info === undefined || !info.mail_enabled || !info.task_visible_to_client) return null

  return info.mail_mode === 'prueba'
    ? 'Modo de prueba: el correo con el archivo final fue a una casilla interna.'
    : 'Se envió el correo con el archivo final al cliente.'
}
