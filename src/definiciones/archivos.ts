import type { DefinicionRecurso } from './tipos.ts'
import type { ArchivoProyecto } from '../datos/recursos.ts'
import { formatearFecha } from '../lib/fechas.ts'

/** Las entidades cuyos adjuntos cuelgan de `{raiz}/{id}/files`. */
export type RaizDeAdjuntos = 'projects' | 'tasks'

/** Prefijo con el que la API emite sus rutas de descarga. */
const PREFIJO_API = '/api/v1/'

/** Proxy del navegador hacia la API: el binario se pide por aca, que es quien pone el token. */
const PREFIJO_BFF = '/api/bff/'

/**
 * De donde sale el binario de una fila de archivos.
 *
 * - `externo`: vive en Drive, Dropbox o similar y **no hay archivo local**; `url` es el enlace tal
 *   cual. Son los adjuntos viejos que quedaron en `tblfiles` con `external='gdrive'`.
 * - `descargable`: vive en el disco del panel y se baja por el BFF.
 * - `sinEnlace`: la fila no trae ninguna de las dos cosas y no hay nada que ofrecer.
 */
export type OrigenDeArchivo =
  | { tipo: 'externo', servicio: string, enlace: string }
  | { tipo: 'descargable', ruta: string }
  | { tipo: 'sinEnlace' }

/**
 * Definicion del recurso Archivos de un Proyecto.
 *
 * La `ruta` neutra la reemplaza la pestaña por `projects/{id}/files`.
 *
 * Fuente: `docs/modulos/02-espacios.md` y `E1-pestanas-legado.md` seccion 6.
 */
export const ARCHIVOS: DefinicionRecurso<ArchivoProyecto> = {
  ruta: 'files',
  titulo: { singular: 'Archivo', plural: 'Archivos' },

  columnas: [
    { clave: 'file_name', encabezado: 'Nombre de archivo', ordenPor: 'file_name', presentar: nombreDeArchivo },
    { clave: 'filetype', encabezado: 'Tipo', presentar: (a) => a.filetype ?? '' },
    { clave: 'visible_to_customer', encabezado: 'Visible para el cliente', presentar: (a) => (a.visible_to_customer ? 'Sí' : 'No') },
    { clave: 'date_added', encabezado: 'Fecha de subida', ordenPor: 'date_added', presentar: (a) => formatearFecha(a.date_added, true) },
    { clave: 'external', encabezado: 'Origen', presentar: (a) => (a.external === null || a.external === '' ? 'Interno' : a.external) }
  ],

  filtros: [
    { clave: 'file_name', etiqueta: 'Nombre', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'filetype', etiqueta: 'Tipo', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'visible_to_customer', etiqueta: 'Visible al cliente', tipo: 'campo', tipoDato: 'booleano' },
    { clave: 'date_added', etiqueta: 'Subido', tipo: 'campo', tipoDato: 'fecha' },
    { clave: 'external', etiqueta: 'Origen', tipo: 'campo', tipoDato: 'texto' },
  ],
  ordenables: ['file_name', 'date_added'],
  ordenPorDefecto: '-date_added',
  busqueda: false,
  includes: []
}

/**
 * Ruta del listado de adjuntos de una entidad, tal como la pide el BFF.
 *
 * Las tres operaciones —listar, subir y borrar— cuelgan de la misma ruta, asi que se arma una vez en
 * vez de repetir la interpolacion en cada llamada y arriesgar que una quede desalineada.
 *
 * @param raiz Espacio (`projects`) o Proceso (`tasks`).
 * @param id Id de la entidad dueña de los adjuntos.
 * @returns La ruta sin la base del BFF ni barra inicial. Ej: `tasks/512/files`.
 */
export function rutaDeAdjuntos (raiz: RaizDeAdjuntos, id: number): string {
  return `${raiz}/${encodeURIComponent(String(id))}/files`
}

/**
 * Nombre con el que se muestra y se baja un archivo.
 *
 * `file_name` es el nombre en disco, que Perfex ensucia con un sufijo al guardar; `subject` y
 * `original_file_name` son lo que la persona escribio o subio, y es lo que espera leer.
 *
 * @param archivo La fila de `tblfiles` o `tblproject_files` tal como llega de la API.
 * @returns El nombre legible, nunca vacio mientras la API mande `file_name`.
 */
export function nombreDeArchivo (archivo: ArchivoProyecto): string {
  return archivo.subject ?? archivo.original_file_name ?? archivo.file_name
}

/**
 * Clasifica de donde se obtiene el binario de una fila de archivos.
 *
 * Existe una sola vez porque la columna "Origen" y el boton de descarga tienen que decidir lo mismo:
 * si una dice "Interno" y el otro ofrece bajar un enlace externo, una de las dos miente.
 *
 * La ruta de descarga se traduce de la API al BFF a proposito: `/api/v1/...` responde `401` desde el
 * navegador porque el token vive en una cookie que solo lee el proxy.
 *
 * @param archivo La fila tal como llega de la API.
 * @returns El origen ya resuelto, con el enlace o la ruta lista para usar.
 */
export function origenDeArchivo (archivo: ArchivoProyecto): OrigenDeArchivo {
  const url = archivo.url ?? ''
  const servicio = archivo.external ?? ''

  if (servicio !== '' && url !== '') return { tipo: 'externo', servicio, enlace: url }

  if (url.startsWith(PREFIJO_API)) {
    return { tipo: 'descargable', ruta: `${PREFIJO_BFF}${url.slice(PREFIJO_API.length)}` }
  }

  return { tipo: 'sinEnlace' }
}
