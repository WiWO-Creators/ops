/**
 * Reglas puras de los archivos que se adjuntan al abrir o responder un ticket.
 *
 * Los archivos viajan **con** el mensaje, en el mismo `multipart/form-data` (`attachments[]`): la API
 * los guarda en la misma transaccion que la respuesta o el alta. Viven aparte del componente para
 * probarlos sin navegador.
 *
 * Los topes de aca son un adelanto, no la validacion: el servidor decide con `maximum_allowed_ticket_
 * attachments` de Perfex, `TICKETS_ADJUNTOS_MAX_MB` y `ticket_attachments_file_extensions`, y rechaza
 * con un `422` que nombra el archivo y el limite. Se copian aca los valores con que corre produccion
 * para no dejar elegir lo que se sabe que va a rebotar; si la instalacion los cambia, manda el `422`.
 */

import { formatearTamano } from './drive-explorador.ts'

/** Cuantos archivos entran en un mensaje (`maximum_allowed_ticket_attachments`). */
export const MAXIMO_ADJUNTOS_DE_TICKET = 4

/** Tope por archivo, en MB (`TICKETS_ADJUNTOS_MAX_MB`). */
export const MAXIMO_MB_POR_ADJUNTO_DE_TICKET = 10

/** El mismo tope, en bytes. */
export const MAXIMO_BYTES_POR_ADJUNTO_DE_TICKET = MAXIMO_MB_POR_ADJUNTO_DE_TICKET * 1024 * 1024

/** Extensiones que acepta la instalacion (`ticket_attachments_file_extensions`), en minusculas y sin punto. */
export const EXTENSIONES_DE_ADJUNTO_DE_TICKET = ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'zip', 'rar'] as const

/** Nombre del campo multipart con el que la API lee los archivos (el de Perfex). */
export const CAMPO_DE_ADJUNTOS_DE_TICKET = 'attachments[]'

/** Lo minimo que se lee de un `File`. */
export interface ArchivoParaTicket {
  name: string
  size: number
  lastModified: number
}

/** La lista resultante y, por cada archivo que no entro, el motivo listo para mostrar. */
export interface ResultadoDeAgregarATicket<T extends ArchivoParaTicket> {
  lista: T[]
  rechazados: string[]
}

/** La extension del nombre en minusculas y sin punto, o `''` si no tiene. */
function extensionDe (nombre: string): string {
  const punto = nombre.lastIndexOf('.')

  return punto <= 0 ? '' : nombre.slice(punto + 1).trim().toLowerCase()
}

/**
 * El valor del atributo `accept` del selector de archivos.
 *
 * Es solo una ayuda del navegador (filtra la ventana de eleccion); la guarda real es
 * {@link motivoParaNoAdjuntar}, porque arrastrar o escribir el nombre la esquiva.
 *
 * @returns `.jpg,.jpeg,.png,...`
 */
export function atributoAccept (): string {
  return EXTENSIONES_DE_ADJUNTO_DE_TICKET.map((extension) => `.${extension}`).join(',')
}

/**
 * La frase que dice que se puede adjuntar.
 *
 * @returns p. ej. `Hasta 4 archivos de 10 MB: JPG, JPEG, PNG, PDF, DOC, ZIP o RAR.`
 */
export function descripcionDeLosLimites (): string {
  const tipos = EXTENSIONES_DE_ADJUNTO_DE_TICKET.map((extension) => extension.toUpperCase())
  const ultimo = tipos[tipos.length - 1]

  return `Hasta ${MAXIMO_ADJUNTOS_DE_TICKET} archivos de ${MAXIMO_MB_POR_ADJUNTO_DE_TICKET} MB: ${tipos.slice(0, -1).join(', ')} o ${ultimo}.`
}

/**
 * Por que un archivo no se puede adjuntar, o `null` si va.
 *
 * @param archivo el que se eligio
 * @returns el motivo en una frase, sin el nombre del archivo
 */
export function motivoParaNoAdjuntar (archivo: Pick<ArchivoParaTicket, 'name' | 'size'>): string | null {
  if (archivo.name.trim() === '') return 'No tiene nombre.'
  if (archivo.size <= 0) return 'Está vacío.'
  if (archivo.size > MAXIMO_BYTES_POR_ADJUNTO_DE_TICKET) {
    return `Pesa ${formatearTamano(archivo.size)}: el máximo es ${MAXIMO_MB_POR_ADJUNTO_DE_TICKET} MB.`
  }

  const extension = extensionDe(archivo.name)

  if (!(EXTENSIONES_DE_ADJUNTO_DE_TICKET as readonly string[]).includes(extension)) {
    return extension === '' ? 'Le falta la extensión.' : `No se aceptan archivos .${extension}.`
  }

  return null
}

/**
 * Suma archivos a los ya elegidos, descartando repetidos y lo que no va o no cabe.
 *
 * Un archivo es el mismo si coinciden nombre, tamano y fecha de modificacion: elegir dos veces el
 * mismo no lo manda dos veces. Lo que excede el tope de cantidad se rechaza con su motivo y lo ya
 * elegido se conserva.
 *
 * @param actuales los que ya estaban elegidos
 * @param nuevos los que la persona acaba de elegir
 * @returns la lista final y los motivos de lo descartado
 */
export function agregarAdjuntosDeTicket<T extends ArchivoParaTicket> (
  actuales: readonly T[],
  nuevos: readonly T[]
): ResultadoDeAgregarATicket<T> {
  const lista = [...actuales]
  const rechazados: string[] = []

  for (const archivo of nuevos) {
    const repetido = lista.some((otro) => otro.name === archivo.name && otro.size === archivo.size && otro.lastModified === archivo.lastModified)

    if (repetido) continue

    const motivo = motivoParaNoAdjuntar(archivo)

    if (motivo !== null) {
      rechazados.push(`«${archivo.name}»: ${motivo}`)
      continue
    }

    if (lista.length >= MAXIMO_ADJUNTOS_DE_TICKET) {
      rechazados.push(`«${archivo.name}»: como máximo ${MAXIMO_ADJUNTOS_DE_TICKET} archivos por mensaje.`)
      continue
    }

    lista.push(archivo)
  }

  return { lista, rechazados }
}

/**
 * El cuerpo de una escritura de ticket, con sus archivos si los hay.
 *
 * Sin archivos devuelve el cuerpo tal cual, para que viaje como JSON igual que siempre; con archivos
 * arma el `multipart/form-data` que la API lee: cada clave del cuerpo como campo de texto (las
 * omitidas, `undefined` o `null`, no viajan) y los archivos en `attachments[]`. El navegador pone el
 * `content-type` con su boundary, por eso `escribirEnBff` no lo fuerza para un `FormData`.
 *
 * @param cuerpo los campos de texto de la escritura
 * @param archivos lo que se eligio; `[]` para no mandar nada
 * @returns el mismo `cuerpo`, o un `FormData` si hay archivos
 */
export function cuerpoConArchivos<T extends object> (
  cuerpo: T,
  archivos: readonly File[]
): T | FormData {
  if (archivos.length === 0) return cuerpo

  const formulario = new FormData()

  for (const [clave, valor] of Object.entries(cuerpo)) {
    if (valor !== undefined && valor !== null) formulario.append(clave, String(valor))
  }

  for (const archivo of archivos) {
    formulario.append(CAMPO_DE_ADJUNTOS_DE_TICKET, archivo, archivo.name)
  }

  return formulario
}
