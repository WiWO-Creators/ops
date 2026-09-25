/**
 * El árbol de Drive en el mock.
 *
 * Replica el contrato de `GET|POST /{clients|projects|tasks}/{id}/drive`, `GET /drive/{folder_id}`
 * (con `can_write` y `breadcrumbs`), `POST /drive/{folder_id}/folders`, `POST /drive/{folder_id}/files`
 * (subida multipart), `POST /drive/{folder_id}/move` (traslado en lote con fallos parciales),
 * `PATCH|DELETE /drive/{folder_id}/files/{item_id}` y el `404` de `GET /drive/{folder_id}/permissions`
 * en carpetas que no son de una Tarea.
 *
 * Cada entidad nace con su carpeta al primer pedido, con una semilla que ejercita todo lo que la
 * pantalla distingue: subcarpetas de plantilla editables, carpetas de Tarea `locked`, una carpeta sin
 * permiso de escritura (`can_write: false`) que rechaza los traslados con `403`, archivos de todos los
 * tipos con fechas y tamaños distintos, y uno de dueño externo que Drive no deja mover —es el fallo
 * parcial del lote—. Borrar manda a la papelera: el nodo sale del árbol, igual que en la API.
 */

import { ErrorApi } from './consulta.js'

/** Tope de largo de un nombre, igual que la API. */
export const LARGO_MAXIMO_NOMBRE = 255

/** Raíces que tienen árbol de Drive. */
const RAICES = new Set(['clients', 'projects', 'tasks'])

/**
 * Entidades cuya lectura simula que Google Drive no respondió (el Proyecto 9): `folder.error` con
 * `children: []`. El reintento (`GET /drive/{folder_id}`) sí contesta, que es lo que pasa cuando la
 * caída fue puntual.
 */
const DRIVE_CAIDO = new Set(['projects/9'])

/** El mensaje del backend cuando Google Drive no responde. */
const MENSAJE_DRIVE_CAIDO = 'Google Drive no responde, intenta de nuevo.'

/** Tope de ids de un traslado en lote, igual que la API. */
export const TOPE_LOTE = 50

/** Subcarpetas de plantilla de una licitación: son las que se renombran y mueven desde la app. */
const PLANTILLA = ['01_Bases', '02_Consultas', '03_Oferta_Tecnica', '04_Oferta_Economica', '05_Adjudicacion', '06_Comunicaciones']

/** Tope de una subida, igual que la API: 25 MB. */
export const TOPE_SUBIDA_BYTES = 25 * 1024 * 1024

/** Extensiones que la API rechaza con `422`: ejecutables y scripts. */
const EXTENSIONES_RECHAZADAS = new Set(['exe', 'bat', 'cmd', 'sh', 'msi', 'js', 'vbs', 'scr'])

/** Tipos MIME de la semilla, por extensión. */
const MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png',
  jpg: 'image/jpeg',
  mp4: 'video/mp4',
  m4a: 'audio/mp4',
  zip: 'application/zip',
  txt: 'text/plain',
  csv: 'text/csv'
}

/** Mime de las carpetas en Drive: la API lo manda también en ellas. */
const MIME_CARPETA = 'application/vnd.google-apps.folder'

/** Quien sube los archivos de la semilla. `null` es un archivo que se subió directo en Drive. */
const ANA = { id: 1, name: 'Ana Pérez' }
const BRUNO = { id: 2, name: 'Bruno Díaz' }

/** Nombre de la carpeta raíz de cada entidad, como la nombra el backend. */
const NOMBRE_RAIZ = {
  clients: 'ACME - Acme S.A.',
  projects: 'ACM-001 - Sitio nuevo',
  tasks: 'ACM-001-01 Diseño de la oferta'
}

/**
 * Todas las carpetas y archivos por id: `{ id, name, is_folder, parentId, locked, canWrite, mime,
 * size, modified, by, externo }`. `canWrite` solo tiene sentido en carpetas; `externo` es un archivo
 * cuyo dueño está fuera de la unidad compartida y Drive no deja moverlo.
 */
const NODOS = new Map()
/** Carpeta raíz de cada entidad, por `raiz/id`. */
const RAIZ_DE = new Map()
let siguiente = 1

/** Vacía el árbol. Solo para las pruebas. */
export function reiniciarDrive () {
  NODOS.clear()
  RAIZ_DE.clear()
  siguiente = 1
}

/** Da de alta un nodo y devuelve su id. */
function alta (name, isFolder, parentId, extra = {}) {
  const id = `mock-drive-${siguiente++}`
  NODOS.set(id, {
    id, name, is_folder: isFolder, parentId, locked: false, canWrite: true, modified: new Date().toISOString(), ...extra
  })
  return id
}

/**
 * Da de alta un archivo de la semilla con su tipo, tamaño, fecha y autor.
 *
 * @param {string} name el nombre, cuya extensión decide el mime
 * @param {string} parentId la carpeta
 * @param {number|null} size bytes, o `null` si Drive no lo informa (documentos nativos)
 * @param {string} modified fecha ISO de la última modificación
 * @param {object|null} by quien lo subió por la app
 * @param {object} extra otros campos del nodo
 */
function archivo (name, parentId, size, modified, by = ANA, extra = {}) {
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  return alta(name, false, parentId, { mime: MIME[extension] ?? null, size, modified, by, ...extra })
}

/** Arma la carpeta de una entidad con su semilla: tipos, fechas y tamaños variados. */
function sembrar (raiz, id) {
  const raizId = alta(NOMBRE_RAIZ[raiz] ?? `${raiz}-${id}`, true, null, { modified: '2026-08-12T14:00:00Z' })

  const carpetas = PLANTILLA.map((nombre) => alta(nombre, true, raizId, { modified: '2026-08-12T14:05:00Z' }))
  archivo('Bases técnicas.pdf', carpetas[0], 2_457_600, '2026-09-02T13:20:00Z')
  archivo('Anexo de precios.xlsx', carpetas[0], 48_128, '2026-09-03T18:45:00Z', BRUNO)
  archivo('Consultas ronda 1.docx', carpetas[1], 31_744, '2026-09-10T15:10:00Z')

  const tarea = alta('ACM-001-01 Diseño de la oferta', true, raizId, { locked: true, modified: '2026-09-18T12:00:00Z' })
  archivo('borrador.docx', tarea, 88_064, '2026-09-24T21:30:00Z', BRUNO)
  const fotos = alta('ACM-001-02 Fotos de terreno', true, raizId, { locked: true, modified: '2026-09-20T12:00:00Z' })
  archivo('IMG_2041.jpg', fotos, 3_981_312, '2026-09-20T16:02:00Z')
  archivo('Recorrido del sitio.mp4', fotos, 18_874_368, '2026-09-20T16:40:00Z')

  const lectura = alta('Solo lectura', true, raizId, { canWrite: false, modified: '2026-07-30T10:00:00Z' })
  archivo('Reglamento interno.pdf', lectura, 612_352, '2026-07-30T10:05:00Z', null)

  archivo('propuesta.pdf', raizId, 1_258_291, '2026-09-24T19:12:00Z')
  archivo('Presupuesto 2026.xlsx', raizId, 96_256, '2026-09-22T14:30:00Z', BRUNO)
  archivo('Presentación kickoff.pptx', raizId, 5_452_595, '2026-09-15T11:00:00Z')
  archivo('logo-cliente.png', raizId, 182_272, '2026-08-28T09:15:00Z', BRUNO)
  archivo('Reunión de inicio.m4a', raizId, 9_437_184, '2026-09-05T17:45:00Z')
  archivo('Entregables v1.zip', raizId, 22_020_096, '2026-09-19T20:00:00Z')
  archivo('Acta firmada.pdf', raizId, 402_432, '2026-09-11T13:00:00Z', null, { externo: true })
  alta('Guion del video', false, raizId, {
    mime: 'application/vnd.google-apps.document', size: null, modified: '2026-09-25T08:40:00Z', by: null
  })

  return raizId
}

/** El nodo tal como sale en la API. */
function publico (nodo) {
  const base = {
    id: nodo.id,
    name: nodo.name,
    is_folder: nodo.is_folder,
    web_view_link: nodo.is_folder
      ? `https://drive.google.com/drive/folders/${nodo.id}`
      : `https://drive.google.com/file/d/${nodo.id}/view`,
    locked: nodo.locked,
    modified_time: nodo.modified ?? null,
    icon_link: null
  }

  if (nodo.is_folder) return { ...base, mime_type: MIME_CARPETA, size_bytes: null }

  return { ...base, uploaded_by: nodo.by ?? null, size_bytes: nodo.size ?? null, mime_type: nodo.mime ?? null }
}

/** La ruta desde la carpeta raíz de la entidad hasta `carpeta`, ambas incluidas, como `{id, name}`. */
function migasDe (carpeta) {
  const migas = []
  for (let actual = carpeta; actual !== undefined; actual = NODOS.get(actual.parentId)) {
    migas.unshift({ id: actual.id, name: actual.name })
    if (actual.parentId === null) break
  }
  return migas
}

/** Hijos directos de una carpeta, carpetas primero y por nombre, como los lista la API. */
function hijosDe (carpetaId) {
  return [...NODOS.values()]
    .filter((nodo) => nodo.parentId === carpetaId)
    .sort((a, b) => Number(b.is_folder) - Number(a.is_folder) || a.name.localeCompare(b.name))
    .map(publico)
}

/** Una carpeta existente o `404`. */
function carpetaO404 (id) {
  const nodo = NODOS.get(id)
  if (nodo === undefined || !nodo.is_folder) throw new ErrorApi(404, 'not_found', 'No existe esa carpeta.')
  return nodo
}

/** `403` si la carpeta no deja escribir. */
function exigirEscritura (carpeta) {
  if (!carpeta.canWrite) throw new ErrorApi(403, 'forbidden', 'No tienes permiso para modificar esta carpeta.')
}

/**
 * Valida un nombre igual que la API: recortado, no vacío, hasta 255 y sin `/`.
 *
 * @returns {string} el nombre recortado
 * @throws {ErrorApi} 422 con `details.name`
 */
function validarNombre (valor) {
  const nombre = typeof valor === 'string' ? valor.trim() : ''
  const motivo = nombre === ''
    ? 'required'
    : nombre.length > LARGO_MAXIMO_NOMBRE ? 'too_long' : nombre.includes('/') ? 'invalid' : null

  if (motivo !== null) throw new ErrorApi(422, 'validation_failed', 'El nombre no es válido.', { name: [motivo] })

  return nombre
}

/** Si `carpetaId` es `itemId` o cuelga de él. */
function esDescendiente (carpetaId, itemId) {
  for (let actual = carpetaId; actual !== null && actual !== undefined; actual = NODOS.get(actual)?.parentId) {
    if (actual === itemId) return true
  }
  return false
}

/** Un hijo directo de la carpeta o `404`. */
function hijoO404 (carpeta, itemId) {
  const item = NODOS.get(itemId)
  if (item === undefined || item.parentId !== carpeta.id) {
    throw new ErrorApi(404, 'not_found', 'Ese elemento no está en esta carpeta.')
  }
  return item
}

/** Saca un nodo y todo lo que cuelga de él: la papelera de Drive, vista desde el árbol. */
function mandarAPapelera (id) {
  for (const nodo of [...NODOS.values()]) {
    if (nodo.parentId === id) mandarAPapelera(nodo.id)
  }
  NODOS.delete(id)
}

/**
 * `PATCH /drive/{folder_id}/files/{item_id}`: renombra, mueve o las dos cosas.
 *
 * @throws {ErrorApi} 404, 409 (locked), 403 (sin escritura) o 422 (nombre o destino inválido)
 */
function cambiarNodo (carpeta, itemId, datos) {
  const item = hijoO404(carpeta, itemId)
  exigirEscritura(carpeta)
  if (item.locked) throw new ErrorApi(409, 'conflict', 'Es una carpeta del sistema: no se renombra, mueve ni elimina.')

  const entrada = datos ?? {}
  const nombre = entrada.name !== undefined ? validarNombre(entrada.name) : null
  let destino = null

  if (entrada.parent_id !== undefined) {
    if (typeof entrada.parent_id !== 'string' || esDescendiente(entrada.parent_id, item.id)) {
      throw new ErrorApi(422, 'validation_failed', 'No se puede mover a esa carpeta.', { parent_id: ['invalid'] })
    }
    destino = carpetaO404(entrada.parent_id)
    exigirEscritura(destino)
  }

  if (nombre !== null) item.name = nombre
  if (destino !== null) item.parentId = destino.id
  item.modified = new Date().toISOString()

  return publico(item)
}

/**
 * Por qué un item no se puede trasladar a `destino`, como `{ error, status }`, o `null` si puede.
 *
 * Es el chequeo por item del lote: los permisos de las dos carpetas se miran antes, para todo el
 * pedido a la vez.
 */
function falloDeTraslado (carpeta, itemId, destino) {
  const item = NODOS.get(itemId)
  if (item === undefined || item.parentId !== carpeta.id) return { error: 'Ese elemento no está en esta carpeta.', status: 404 }
  if (item.locked) return { error: 'Es una carpeta del sistema: no se mueve.', status: 409 }
  if (esDescendiente(destino.id, item.id)) return { error: 'No se puede mover una carpeta dentro de sí misma.', status: 422 }
  if (item.externo === true) return { error: 'Drive no deja moverlo: su dueño está fuera de la unidad compartida.', status: 403 }
  return null
}

/**
 * `POST /drive/{folder_id}/move`: traslada varios hijos de una carpeta a otra en un solo pedido.
 *
 * Los ids se validan en bloque (arreglo de 1 a 50 strings, destino existente y con escritura); cada
 * item se resuelve por separado y lo que falla queda en `failed` sin frenar al resto.
 *
 * @returns {{ moved: string[], failed: Array<{ id: string, error: string, status: number }> }}
 * @throws {ErrorApi} 422 si el cuerpo no es válido, 404 si el destino no existe, 403 sin escritura
 */
function moverEnLote (carpeta, datos) {
  const ids = datos?.item_ids
  const valido = Array.isArray(ids) && ids.length > 0 && ids.length <= TOPE_LOTE && ids.every((id) => typeof id === 'string')
  if (!valido) throw new ErrorApi(422, 'validation_failed', `Manda entre 1 y ${TOPE_LOTE} elementos.`, { item_ids: ['invalid'] })
  if (typeof datos.parent_id !== 'string') throw new ErrorApi(422, 'validation_failed', 'Falta la carpeta de destino.', { parent_id: ['required'] })

  if (datos.parent_id === carpeta.id) {
    throw new ErrorApi(422, 'validation_failed', 'Ya están en esa carpeta.', { parent_id: ['same_folder'] })
  }

  exigirEscritura(carpeta)
  const destino = carpetaO404(datos.parent_id)
  exigirEscritura(destino)

  const moved = []
  const failed = []
  for (const id of new Set(ids)) {
    const fallo = falloDeTraslado(carpeta, id, destino)
    if (fallo !== null) {
      failed.push({ id, ...fallo })
      continue
    }
    const item = NODOS.get(id)
    item.parentId = destino.id
    item.modified = new Date().toISOString()
    moved.push(id)
  }

  return { moved, failed }
}

/**
 * El archivo de un `multipart/form-data`, con su nombre y su tamaño. El mock no guarda los bytes.
 *
 * @returns {Promise<{ nombre: string, bytes: number } | null>}
 */
async function archivoDelMultipart (peticion) {
  const tipo = peticion?.headers['content-type'] ?? ''
  const separador = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(tipo)
  if (separador === null) return null

  const marca = '--' + (separador[1] ?? separador[2]).trim()
  const trozos = []
  for await (const trozo of peticion) trozos.push(trozo)

  for (const parte of Buffer.concat(trozos).toString('latin1').split(marca)) {
    const corte = parte.indexOf('\r\n\r\n')
    const nombre = corte < 0 ? null : /filename="([^"]*)"/.exec(parte.slice(0, corte))
    if (nombre === null || nombre[1] === '') continue

    const valor = parte.slice(corte + 4).replace(/\r\n$/, '')
    return { nombre: Buffer.from(nombre[1], 'latin1').toString('utf8'), bytes: Buffer.byteLength(valor, 'latin1') }
  }

  return null
}

/**
 * Da de alta el archivo subido, con las mismas validaciones que la API.
 *
 * @throws {ErrorApi} 422 sin archivo, con extensión rechazada o de más de 25 MB
 */
function subir (carpeta, archivoSubido) {
  if (archivoSubido === null) throw new ErrorApi(422, 'validation_failed', 'Falta el archivo.', { file: ['required'] })

  const extension = archivoSubido.nombre.includes('.') ? archivoSubido.nombre.split('.').pop().toLowerCase() : ''
  if (EXTENSIONES_RECHAZADAS.has(extension)) {
    throw new ErrorApi(422, 'validation_failed', `La extensión .${extension} no está permitida.`, { file: ['extension_not_allowed'] })
  }
  if (archivoSubido.bytes > TOPE_SUBIDA_BYTES) {
    throw new ErrorApi(422, 'validation_failed', 'El archivo supera el máximo de 25 MB.', { file: ['too_large'] })
  }

  const ahora = new Date().toISOString()
  const id = alta(archivoSubido.nombre, false, carpeta.id, {
    mime: MIME[extension] ?? 'application/octet-stream', size: archivoSubido.bytes, modified: ahora, by: ANA
  })
  const nodo = publico(NODOS.get(id))

  return {
    id: siguiente,
    drive_file_id: id,
    name: nodo.name,
    is_folder: false,
    web_view_link: nodo.web_view_link,
    mime_type: nodo.mime_type,
    size_bytes: nodo.size_bytes,
    uploaded_by: ANA,
    dateadded: ahora
  }
}

/**
 * Atiende `/{raiz}/{id}/drive`.
 *
 * @param {string} metodo
 * @param {string} raiz `clients`, `projects` o `tasks`
 * @param {string} id
 */
export function driveDeEntidadRuta (metodo, raiz, id) {
  if (!RAICES.has(raiz) || (metodo !== 'GET' && metodo !== 'POST')) {
    throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')
  }

  const clave = `${raiz}/${id}`
  if (!RAIZ_DE.has(clave)) RAIZ_DE.set(clave, sembrar(raiz, id))
  const carpeta = NODOS.get(RAIZ_DE.get(clave))

  const caido = DRIVE_CAIDO.has(clave)
  const folder = {
    id: carpeta.id,
    children: caido ? [] : hijosDe(carpeta.id),
    can_write: carpeta.canWrite,
    breadcrumbs: migasDe(carpeta),
    error: caido ? MENSAJE_DRIVE_CAIDO : null
  }
  const extra = raiz === 'clients' ? { letras: 'ACME' } : raiz === 'projects' ? { patente: 'ACM-001' } : {}

  return { estado: 200, cuerpo: { data: { ...extra, folder } } }
}

/**
 * Atiende `/drive/...`.
 *
 * @param {string} metodo
 * @param {string[]} resto los segmentos después de `drive`
 * @param {() => Promise<any>} cuerpo thunk que lee el JSON
 * @param {import('node:http').IncomingMessage} [peticion] la petición cruda, para leer el multipart
 */
export async function driveRuta (metodo, resto, cuerpo, peticion) {
  const [folderId, subrecurso, itemId, ...sobra] = resto
  if (folderId === undefined || sobra.length > 0) throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')

  const carpeta = carpetaO404(folderId)

  if (subrecurso === undefined && metodo === 'GET') {
    return {
      estado: 200,
      cuerpo: { data: { children: hijosDe(carpeta.id), can_write: carpeta.canWrite, breadcrumbs: migasDe(carpeta) } }
    }
  }

  if (subrecurso === 'move' && itemId === undefined && metodo === 'POST') {
    return { estado: 200, cuerpo: { data: moverEnLote(carpeta, await cuerpo()) } }
  }

  if (subrecurso === 'files' && itemId === undefined && metodo === 'POST') {
    exigirEscritura(carpeta)
    const subido = subir(carpeta, await archivoDelMultipart(peticion))
    return { estado: 201, cuerpo: { data: subido } }
  }

  if (subrecurso === 'permissions') {
    throw new ErrorApi(404, 'not_found', 'Esta carpeta no lleva permisos manuales: los da el Proyecto o el Cliente.')
  }

  if (subrecurso === 'folders' && itemId === undefined && metodo === 'POST') {
    exigirEscritura(carpeta)
    const nombre = validarNombre((await cuerpo())?.name)
    const repetida = [...NODOS.values()].some((nodo) => nodo.parentId === carpeta.id && nodo.is_folder && nodo.name.toLowerCase() === nombre.toLowerCase())
    if (repetida) throw new ErrorApi(409, 'conflict', 'Ya existe una carpeta con ese nombre.')
    const nueva = alta(nombre, true, carpeta.id)
    return { estado: 201, cuerpo: { data: publico(NODOS.get(nueva)) } }
  }

  if (subrecurso === 'files' && itemId !== undefined && metodo === 'PATCH') {
    return { estado: 200, cuerpo: { data: cambiarNodo(carpeta, itemId, await cuerpo()) } }
  }

  if (subrecurso === 'files' && itemId !== undefined && metodo === 'DELETE') {
    const item = hijoO404(carpeta, itemId)
    exigirEscritura(carpeta)
    if (item.locked) throw new ErrorApi(409, 'conflict', 'Es una carpeta del sistema: no se renombra, mueve ni elimina.')

    mandarAPapelera(item.id)
    return { estado: 204, cuerpo: null }
  }

  throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')
}
