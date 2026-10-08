import type { FuenteDeTicket } from './ticket-fuente.ts'
import { esHtml, htmlVacio, textoAHtml, textoPlano } from './texto-rico.ts'

/**
 * El borrador de respuesta o de solicitud: se guarda en el almacen de sesion para no perder lo
 * escrito, y se le inserta una respuesta predefinida sin pisar el texto.
 */

/** Lo minimo de `Storage` que usa el borrador: asi se prueba sin navegador. */
export type AlmacenDeBorrador = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/**
 * `sessionStorage`, o `null` si el navegador no lo deja tocar.
 *
 * En algunos modos privados leer la propiedad ya lanza, asi que ni siquiera se puede preguntar.
 *
 * @returns el almacen de la pestaña, o `null` fuera del navegador o si esta bloqueado
 */
export function almacenDeSesion (): AlmacenDeBorrador | null {
  if (typeof window === 'undefined') return null

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/**
 * Clave del borrador de respuesta de un ticket: `ticket-borrador:{sujeto}:{id}`.
 *
 * El sujeto va en la clave porque el mismo navegador puede tener abiertos el panel y el portal, y el
 * borrador del equipo no puede aparecer en la caja del cliente.
 *
 * @param fuente de donde es el ticket
 * @param id el ticket
 * @returns la clave de `sessionStorage`
 */
export function claveDeBorrador (fuente: FuenteDeTicket, id: number): string {
  return `ticket-borrador:${fuente.sujeto}:${id}`
}

/**
 * Lee un borrador guardado.
 *
 * `sessionStorage` lanza en modo privado de algunos navegadores o con la cuota llena: ahi no hay
 * borrador, y la caja arranca vacia como siempre.
 *
 * @param almacen `sessionStorage`, o `null` fuera del navegador
 * @param clave la de {@link claveDeBorrador}
 * @returns lo guardado, o cadena vacia
 */
export function leerBorrador (almacen: AlmacenDeBorrador | null, clave: string): string {
  if (almacen === null) return ''

  try {
    return almacen.getItem(clave) ?? ''
  } catch {
    return ''
  }
}

/**
 * Guarda (o borra, si esta vacio) el borrador.
 *
 * @param almacen `sessionStorage`, o `null` fuera del navegador
 * @param clave la de {@link claveDeBorrador}
 * @param texto lo escrito
 * @returns `true` si quedo guardado; `false` si el almacen no lo acepto (el texto sigue en pantalla)
 */
export function guardarBorrador (almacen: AlmacenDeBorrador | null, clave: string, texto: string): boolean {
  if (almacen === null) return false

  try {
    if (texto.trim() === '') almacen.removeItem(clave)
    else almacen.setItem(clave, texto)

    return true
  } catch {
    return false
  }
}

/**
 * Inserta una respuesta predefinida en lo escrito.
 *
 * Se suma al final, como parrafos nuevos, y no reemplaza: quien ya escribio un saludo no quiere
 * perderlo por elegir una plantilla. La plantilla es HTML de Perfex: se pasa por texto y se vuelve a
 * armar con `textoAHtml`, asi lo que llega al editor es siempre marcado propio y escapado.
 *
 * @param actual lo que hay en la caja: HTML del editor, o texto plano de un borrador viejo
 * @param plantilla el `message` de la predefinida (HTML de Perfex)
 * @returns el HTML nuevo de la caja
 */
export function insertarPredefinida (actual: string, plantilla: string): string {
  const agregado = textoAHtml(textoPlano(plantilla))

  if (agregado === '') return actual
  if (htmlVacio(actual)) return agregado

  return (esHtml(actual) ? actual.trim() : textoAHtml(actual)) + agregado
}
