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
/**
 * Lo minimo que una fila de archivos necesita para nombrarse y enlazarse.
 *
 * Se declara lo que se usa y no `ArchivoProyecto` entero: la misma decision la toman la pestaña del
 * equipo y la del cliente, y el contrato del portal (`ArchivoPortal`) no manda `rel_type`, `size`
 * ni `external`. Atarlo al tipo del panel fue lo que dejo al portal con su propia copia, mas pobre:
 * no distinguia los adjuntos externos y mostraba el nombre en disco en vez del que la persona
 * escribio.
 */
export interface ArchivoParaMostrar {
  file_name: string
  original_file_name: string | null
  subject: string | null
  url: string | null
  /** Ausente en el portal: ahi no llegan adjuntos externos. */
  external?: string | null
}

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
 * Las claves de columna que el contrato del contacto **si** emite.
 *
 * Se declara la lista de lo permitido en vez de restar lo prohibido, por la misma razon que en
 * Hitos: el dia que el equipo sume una columna, la del cliente no se la lleva sola.
 *
 * Las dos que faltan no son un recorte cosmetico.
 *
 * `visible_to_customer` es el interruptor con el que el equipo decide que le esconde al cliente, y
 * `RecursoArchivos::deEspacioParaContacto()` dejo de publicarlo. Montada tal cual, la columna leeria
 * una clave ausente y pintaria «No» en TODAS las filas: no una celda vacia, sino una mentira —le
 * diria que ninguno de los archivos que esta viendo es visible para el—. Y aunque dijera «Si»
 * siempre, seguiria delatando que la distincion existe.
 *
 * `external` tampoco viaja en la forma del portal. Dice en que nube vive el original, que es
 * infraestructura del equipo; el cliente abre el archivo por su enlace y eso no cambia.
 */
const COLUMNAS_DE_ARCHIVO_DEL_CONTACTO = ['file_name', 'filetype', 'date_added']

/**
 * Las columnas de adjuntos que corresponden al sujeto que mira.
 *
 * @param esDelPortal Si quien mira es un contacto del cliente.
 * @returns Las columnas de `ARCHIVOS`, recortadas al contrato de ese sujeto.
 */
export function columnasDeArchivo (esDelPortal: boolean): DefinicionRecurso<ArchivoProyecto>['columnas'] {
  return esDelPortal
    ? ARCHIVOS.columnas.filter((columna) => COLUMNAS_DE_ARCHIVO_DEL_CONTACTO.includes(columna.clave))
    : ARCHIVOS.columnas
}

/**
 * Ruta del listado de adjuntos de una entidad, tal como la pide el BFF.
 *
 * Las operaciones —listar, subir, borrar y cambiar la visibilidad— cuelgan de la misma ruta, asi
 * que se arma una vez en vez de repetir la interpolacion en cada llamada y arriesgar que una quede
 * desalineada.
 *
 * @param raiz Espacio (`projects`) o Proceso (`tasks`).
 * @param id Id de la entidad dueña de los adjuntos.
 * @returns La ruta sin la base del BFF ni barra inicial. Ej: `tasks/512/files`.
 */
export function rutaDeAdjuntos (raiz: RaizDeAdjuntos, id: number): string {
  return `${raiz}/${encodeURIComponent(String(id))}/files`
}

/**
 * Ruta de un adjunto concreto: la que borra (`DELETE`) y la que cambia su visibilidad (`PATCH`).
 *
 * @param rutaDelListado La de `rutaDeAdjuntos()`. Ej: `tasks/512/files`.
 * @param archivoId Id del adjunto, no el de la entidad.
 * @returns La ruta sin la base del BFF. Ej: `tasks/512/files/77`.
 */
export function rutaDeUnAdjunto (rutaDelListado: string, archivoId: number): string {
  return `${rutaDelListado}/${encodeURIComponent(String(archivoId))}`
}

/**
 * El listado con la visibilidad de un adjunto cambiada, sin tocar el resto.
 *
 * Es lo que pinta el interruptor antes de que la API conteste, y tambien lo que lo revierte si falla:
 * revertir es volver a aplicarla con el valor anterior. Devuelve un arreglo nuevo para que React
 * vea el cambio.
 *
 * @param archivos El listado actual.
 * @param archivoId El adjunto que cambia. Si no esta, el listado vuelve igual.
 * @param visible El valor nuevo de `visible_to_customer`.
 * @returns El listado nuevo.
 */
export function conVisibilidad<T extends { id: number, visible_to_customer: boolean }> (
  archivos: T[],
  archivoId: number,
  visible: boolean
): T[] {
  return archivos.map((archivo) => (archivo.id === archivoId ? { ...archivo, visible_to_customer: visible } : archivo))
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
export function nombreDeArchivo (archivo: ArchivoParaMostrar): string {
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
export function origenDeArchivo (archivo: ArchivoParaMostrar): OrigenDeArchivo {
  const url = archivo.url ?? ''
  const servicio = archivo.external ?? ''

  if (servicio !== '' && url !== '') return { tipo: 'externo', servicio, enlace: url }

  if (url.startsWith(PREFIJO_API)) {
    return { tipo: 'descargable', ruta: `${PREFIJO_BFF}${url.slice(PREFIJO_API.length)}` }
  }

  return { tipo: 'sinEnlace' }
}
