/**
 * Lo que comparten las dos exportaciones del Meeting Paper: qué datos llevan y cómo se llama el
 * archivo que baja.
 *
 * El DOCX y el PDF se construyen aparte —`exportar-docx.ts` y `exportar-pdf.ts`— porque cada
 * formato tiene su propia gramática, pero los dos parten de los mismos bloques
 * (`acta-bloques.ts`), del mismo tema de marca (`marcas-acta.ts`) y de esta misma cabecera. Es lo
 * que evita que el Word diga una fecha y el PDF otra.
 */

/** Los datos de cabecera del acta, los mismos que se ven arriba de la pantalla. */
export interface MetaDelActa {
  titulo: string
  cliente: string
  /** Fecha de la reunión en ISO (`2026-09-11`), o `null` si no se registró. */
  fecha: string | null
  lugar: string
  /** Quién la escribió, para el pie. */
  autor: string
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

  return `${fecha}-${titulo === '' ? 'meeting-paper' : titulo}.${extension}`
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

/** La fecha de la reunión como se lee en el documento, o una cadena vacía si no hay. */
export function fechaLarga (fecha: string | null): string {
  if (fecha === null || fecha === '') return ''

  const partes = fecha.split('-').map(Number)

  if (partes.length !== 3 || partes.some((parte) => Number.isNaN(parte))) return ''

  const [ano, mes, dia] = partes as [number, number, number]

  // Se arma en UTC a mano y no con `new Date(fecha)`: una fecha sin hora se interpreta como UTC y
  // en Santiago retrocede un día, así que el acta del 11 salía fechada el 10.
  return new Date(Date.UTC(ano, mes - 1, dia)).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  })
}
