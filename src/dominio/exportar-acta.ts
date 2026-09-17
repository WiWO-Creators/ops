/**
 * Lo que comparten las dos exportaciones del Meeting Paper: qué datos llevan y cómo se llama el
 * archivo que baja.
 *
 * El DOCX y el PDF se construyen aparte —`exportar-docx.ts` y `exportar-pdf.ts`— porque cada
 * formato tiene su propia gramática, pero los dos parten de los mismos bloques
 * (`acta-bloques.ts`), del mismo tema de marca (`marcas-acta.ts`) y de esta misma cabecera. Es lo
 * que evita que el Word diga una fecha y el PDF otra.
 */

import { IDIOMAS, type IdiomaDelActa } from './idiomas-acta.ts'

/** Los datos de cabecera del acta, los mismos que se ven arriba de la pantalla. */
export interface MetaDelActa {
  titulo: string
  cliente: string
  /** Fecha de la reunión en ISO (`2026-09-11`), o `null` si no se registró. */
  fecha: string | null
  lugar: string
  /** Quién la escribió, para el pie. */
  autor: string
  /**
   * En qué idioma sale el documento.
   *
   * Viaja acá y no como argumento suelto de cada exportador porque lo necesitan tres piezas que no
   * se llaman entre sí —la fecha larga, el nombre del archivo y la elección de tipografía—, y un
   * cuarto argumento opcional en dos firmas es exactamente como se llega a un PDF en chino con la
   * fecha en español. `undefined` es el original, que es lo que quiere quien no lo pasa.
   */
  idioma?: IdiomaDelActa
}

/**
 * Nombre del archivo que baja.
 *
 * Lleva la fecha delante para que una carpeta con veinte actas se ordene sola, y el título
 * limpio de todo lo que un sistema de archivos trata distinto —barras, dos puntos, acentos
 * sueltos—: un nombre con una barra crea una carpeta en Windows y se pierde el archivo.
 */
export function nombreDeArchivo (meta: MetaDelActa, extension: 'pdf' | 'docx'): string {
  const fecha = meta.fecha ?? new Date().toISOString().slice(0, 10)
  const titulo = meta.titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

  // El sufijo va al final y no delante de la fecha para que las tres versiones de un mismo acta
  // queden juntas al ordenar la carpeta, que es el motivo por el que la fecha va primero.
  //
  // El título de un acta en chino son hanzi y el filtro de arriba los borra enteros, así que ese
  // archivo baja como `2026-09-11-meeting-paper-zh.pdf`. Es a propósito: un nombre de archivo con
  // caracteres CJK viaja mal por correo, por Drive y por Windows, y el sufijo ya dice qué versión
  // es. El título de verdad está dentro del documento.
  const sufijo = (meta.idioma ?? IDIOMAS.es).sufijoArchivo

  return `${fecha}-${titulo === '' ? 'meeting-paper' : titulo}${sufijo}.${extension}`
}

/**
 * Entrega el archivo al navegador.
 *
 * Un `<a download>` creado al vuelo y no `window.open`: el segundo abre una pestaña que el
 * bloqueador de ventanas puede tragarse sin avisar, y el usuario se queda mirando un botón que no
 * hizo nada. La URL del blob se revoca después: son megabytes que viven hasta recargar la página.
 */
export function descargar (contenido: Blob, nombre: string): void {
  const url = URL.createObjectURL(contenido)
  const enlace = document.createElement('a')

  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()

  // Un respiro antes de revocar: Safari cancela la descarga si la URL muere en el mismo tick.
  setTimeout(() => { URL.revokeObjectURL(url) }, 1000)
}

/**
 * La fecha de la reunión como se lee en el documento, o una cadena vacía si no hay.
 *
 * El `locale` sale del idioma del documento: `11 de septiembre de 2026` en español,
 * `September 11, 2026` en inglés y `2026年9月11日` en chino. Es la única parte del acta que el
 * traductor NO escribe —la fecha viaja como dato, fuera del HTML— y por eso se formatea acá.
 */
export function fechaLarga (fecha: string | null, locale: string = IDIOMAS.es.locale): string {
  if (fecha === null || fecha === '') return ''

  const partes = fecha.split('-').map(Number)

  if (partes.length !== 3 || partes.some((parte) => Number.isNaN(parte))) return ''

  const [ano, mes, dia] = partes as [number, number, number]

  // Se arma en UTC a mano y no con `new Date(fecha)`: una fecha sin hora se interpreta como UTC y
  // en Santiago retrocede un día, así que el acta del 11 salía fechada el 10.
  return new Date(Date.UTC(ano, mes - 1, dia)).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  })
}
