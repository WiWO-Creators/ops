/**
 * El árbol de Drive en el mock.
 *
 * Replica el contrato de `GET|POST /{clients|projects|tasks}/{id}/drive`, `GET /drive/{folder_id}`,
 * `POST /drive/{folder_id}/folders`, `PATCH|DELETE /drive/{folder_id}/files/{item_id}` y el `404` de
 * `GET /drive/{folder_id}/permissions` en carpetas que no son de una Tarea.
 *
 * Cada entidad nace con su carpeta al primer pedido, con una semilla que ejercita todo lo que la
 * pantalla distingue: subcarpetas de plantilla editables, una carpeta de Tarea `locked`, un archivo y
 * una carpeta sin permiso de escritura (`can_write: false`), que además rechaza los traslados con
 * `403`. Borrar manda a la papelera: el nodo sale del árbol, igual que en la API.
 */

import { ErrorApi } from './consulta.js'

/** Tope de largo de un nombre, igual que la API. */
export const LARGO_MAXIMO_NOMBRE = 255

/** Raíces que tienen árbol de Drive. */
const RAICES = new Set(['clients', 'projects', 'tasks'])

/** Subcarpetas de plantilla de una licitación: son las que se renombran y mueven desde la app. */
const PLANTILLA = ['01_Bases', '02_Consultas', '03_Oferta_Tecnica', '04_Oferta_Economica', '05_Adjudicacion', '06_Comunicaciones']

/**
 * Todas las carpetas y archivos por id: `{ id, name, is_folder, parentId, locked, canWrite, mime }`.
 * `canWrite` solo tiene sentido en carpetas.
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
  NODOS.set(id, { id, name, is_folder: isFolder, parentId, locked: false, canWrite: true, ...extra })
  return id
}

/** Arma la carpeta de una entidad con su semilla. */
function sembrar (raiz, id) {
  const raizId = alta(`${raiz}-${id}`, true, null)

  for (const nombre of PLANTILLA) alta(nombre, true, raizId)
  const tarea = alta('ACM-001-01 Diseño de la oferta', true, raizId, { locked: true })
  alta('borrador.docx', false, tarea, { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  alta('Solo lectura', true, raizId, { canWrite: false })
  alta('propuesta.pdf', false, raizId, { mime: 'application/pdf' })

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
    locked: nodo.locked
  }

  if (nodo.is_folder) return base

  return { ...base, uploaded_by: null, size_bytes: null, mime_type: nodo.mime ?? null }
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

  return publico(item)
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

  const folder = { id: carpeta.id, children: hijosDe(carpeta.id), can_write: carpeta.canWrite }
  const extra = raiz === 'clients' ? { letras: 'ACME' } : raiz === 'projects' ? { patente: 'ACM-001' } : {}

  return { estado: 200, cuerpo: { data: { ...extra, folder } } }
}

/**
 * Atiende `/drive/...`.
 *
 * @param {string} metodo
 * @param {string[]} resto los segmentos después de `drive`
 * @param {() => Promise<any>} cuerpo thunk que lee el JSON
 */
export async function driveRuta (metodo, resto, cuerpo) {
  const [folderId, subrecurso, itemId, ...sobra] = resto
  if (folderId === undefined || sobra.length > 0) throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')

  const carpeta = carpetaO404(folderId)

  if (subrecurso === undefined && metodo === 'GET') {
    return { estado: 200, cuerpo: { data: { children: hijosDe(carpeta.id), can_write: carpeta.canWrite } } }
  }

  if (subrecurso === 'permissions') {
    throw new ErrorApi(404, 'not_found', 'Esta carpeta no lleva permisos manuales: los da el Proyecto o el Cliente.')
  }

  if (subrecurso === 'folders' && itemId === undefined && metodo === 'POST') {
    exigirEscritura(carpeta)
    const nombre = validarNombre((await cuerpo())?.name)
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
