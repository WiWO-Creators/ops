/**
 * Pruebas del árbol de Drive en el mock, contra el servidor.
 *
 * Queda clavado el contrato de los ajustes: `can_write` y `locked` en la lectura, el alta de
 * carpetas, el `PATCH` que renombra y mueve con sus `404`/`409`/`403`/`422`, y el borrado que manda
 * a la papelera también las carpetas no bloqueadas.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { reiniciarDrive } from './drive.js'

let base
let staff

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`

  const respuesta = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ana@wiwo.me', password: 'mock1234' })
  })
  staff = (await respuesta.json()).data.access_token
})

after(() => new Promise((resolver) => servidor.close(resolver)))

/**
 * Pide una ruta con la sesión del staff.
 *
 * @returns {Promise<{ estado: number, cuerpo: any }>}
 */
async function pedir (ruta, metodo = 'GET', datos) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${staff}`, 'content-type': 'application/json' },
    ...(datos === undefined ? {} : { body: JSON.stringify(datos) })
  })

  return { estado: respuesta.status, cuerpo: respuesta.status === 204 ? null : await respuesta.json() }
}

/** La carpeta raíz del Proyecto 1, con la semilla fresca. */
async function raiz () {
  reiniciarDrive()
  const { cuerpo } = await pedir('/projects/1/drive')
  const porNombre = (nombre) => cuerpo.data.folder.children.find((hijo) => hijo.name === nombre)
  return { folder: cuerpo.data.folder, porNombre }
}

test('la lectura trae can_write en la carpeta y locked en cada hijo', async () => {
  const { folder, porNombre } = await raiz()

  assert.equal(folder.can_write, true)
  assert.equal(porNombre('01_Bases').locked, false)
  assert.equal(porNombre('ACM-001-01 Diseño de la oferta').locked, true)
  assert.equal(porNombre('propuesta.pdf').locked, false)

  const { cuerpo } = await pedir(`/drive/${porNombre('Solo lectura').id}`)
  assert.equal(cuerpo.data.can_write, false)
})

test('crear una carpeta devuelve el nodo y valida el nombre', async () => {
  const { folder } = await raiz()

  const creada = await pedir(`/drive/${folder.id}/folders`, 'POST', { name: '  07_Anexos ' })
  assert.equal(creada.estado, 201)
  assert.equal(creada.cuerpo.data.name, '07_Anexos')
  assert.equal(creada.cuerpo.data.is_folder, true)
  assert.equal(creada.cuerpo.data.locked, false)

  for (const name of ['', 'a/b', 'a'.repeat(256)]) {
    assert.equal((await pedir(`/drive/${folder.id}/folders`, 'POST', { name })).estado, 422)
  }
})

test('renombrar y mover con el PATCH', async () => {
  const { folder, porNombre } = await raiz()
  const bases = porNombre('01_Bases')
  const oferta = porNombre('03_Oferta_Tecnica')

  const renombrada = await pedir(`/drive/${folder.id}/files/${bases.id}`, 'PATCH', { name: '01_Bases_v2' })
  assert.equal(renombrada.estado, 200)
  assert.equal(renombrada.cuerpo.data.name, '01_Bases_v2')

  const movida = await pedir(`/drive/${folder.id}/files/${bases.id}`, 'PATCH', { parent_id: oferta.id })
  assert.equal(movida.estado, 200)
  assert.deepEqual((await pedir(`/drive/${oferta.id}`)).cuerpo.data.children.map((h) => h.name), ['01_Bases_v2'])

  // Ya no es hijo directo de la raíz.
  assert.equal((await pedir(`/drive/${folder.id}/files/${bases.id}`, 'PATCH', { name: 'x' })).estado, 404)
})

test('el PATCH rechaza locked, destino propio o descendiente y destino sin permiso', async () => {
  const { folder, porNombre } = await raiz()
  const bases = porNombre('01_Bases')
  const tarea = porNombre('ACM-001-01 Diseño de la oferta')

  assert.equal((await pedir(`/drive/${folder.id}/files/${tarea.id}`, 'PATCH', { name: 'x' })).estado, 409)
  assert.equal((await pedir(`/drive/${folder.id}/files/${bases.id}`, 'PATCH', { parent_id: bases.id })).estado, 422)

  const hija = (await pedir(`/drive/${bases.id}/folders`, 'POST', { name: 'hija' })).cuerpo.data
  assert.equal((await pedir(`/drive/${folder.id}/files/${bases.id}`, 'PATCH', { parent_id: hija.id })).estado, 422)
  assert.equal((await pedir(`/drive/${folder.id}/files/${bases.id}`, 'PATCH', { parent_id: porNombre('Solo lectura').id })).estado, 403)
})

test('borrar manda a la papelera una carpeta con su contenido, pero no una locked', async () => {
  const { folder, porNombre } = await raiz()
  const bases = porNombre('01_Bases')
  const tarea = porNombre('ACM-001-01 Diseño de la oferta')
  await pedir(`/drive/${bases.id}/folders`, 'POST', { name: 'hija' })

  assert.equal((await pedir(`/drive/${folder.id}/files/${bases.id}`, 'DELETE')).estado, 204)
  assert.equal((await pedir(`/drive/${bases.id}`)).estado, 404)
  assert.equal((await pedir(`/drive/${folder.id}/files/${tarea.id}`, 'DELETE')).estado, 409)
})

test('la lectura trae fecha, tamaño, mime y las migas desde la raíz', async () => {
  const { folder, porNombre } = await raiz()
  const pdf = porNombre('propuesta.pdf')

  assert.equal(pdf.mime_type, 'application/pdf')
  assert.equal(typeof pdf.size_bytes, 'number')
  assert.match(pdf.modified_time, /^\d{4}-\d{2}-\d{2}T/)
  assert.equal(pdf.icon_link, null)
  assert.deepEqual(pdf.uploaded_by, { id: 1, name: 'Ana Pérez' })
  assert.equal(porNombre('Guion del video').size_bytes, null)

  const bases = porNombre('01_Bases')
  const { cuerpo } = await pedir(`/drive/${bases.id}`)
  assert.deepEqual(cuerpo.data.breadcrumbs.map((miga) => miga.id), [folder.id, bases.id])
  assert.equal(cuerpo.data.breadcrumbs[1].name, '01_Bases')
})

test('el traslado en lote mueve lo que puede y reporta cada fallo', async () => {
  const { folder, porNombre } = await raiz()
  const destino = porNombre('03_Oferta_Tecnica')
  const ids = [porNombre('propuesta.pdf').id, porNombre('Acta firmada.pdf').id, porNombre('ACM-001-01 Diseño de la oferta').id]

  const { estado, cuerpo } = await pedir(`/drive/${folder.id}/move`, 'POST', { item_ids: ids, parent_id: destino.id })
  assert.equal(estado, 200)
  assert.deepEqual(cuerpo.data.moved, [ids[0]])
  assert.deepEqual(cuerpo.data.failed.map((fallo) => [fallo.id, fallo.status]), [[ids[1], 403], [ids[2], 409]])
  assert.deepEqual((await pedir(`/drive/${destino.id}`)).cuerpo.data.children.map((hijo) => hijo.name), ['propuesta.pdf'])
})

test('el traslado en lote valida el cuerpo y los permisos del destino', async () => {
  const { folder, porNombre } = await raiz()
  const pdf = porNombre('propuesta.pdf').id

  assert.equal((await pedir(`/drive/${folder.id}/move`, 'POST', { item_ids: [], parent_id: folder.id })).estado, 422)
  assert.equal((await pedir(`/drive/${folder.id}/move`, 'POST', { item_ids: Array(51).fill(pdf), parent_id: folder.id })).estado, 422)
  assert.equal((await pedir(`/drive/${folder.id}/move`, 'POST', { item_ids: [pdf] })).estado, 422)
  assert.equal((await pedir(`/drive/${folder.id}/move`, 'POST', { item_ids: [pdf], parent_id: porNombre('Solo lectura').id })).estado, 403)

  const bases = porNombre('01_Bases').id
  const dentro = await pedir(`/drive/${folder.id}/move`, 'POST', { item_ids: [bases], parent_id: bases })
  assert.deepEqual(dentro.cuerpo.data.failed.map((fallo) => fallo.status), [422])
})

test('la subida multipart valida extensión y guarda el archivo en la carpeta', async () => {
  const { folder } = await raiz()

  /** Sube un archivo con ese nombre y contenido. */
  async function subir (nombre, contenido = 'hola') {
    const datos = new FormData()
    datos.append('file', new Blob([contenido]), nombre)
    const respuesta = await fetch(`${base}/drive/${folder.id}/files`, {
      method: 'POST', headers: { authorization: `Bearer ${staff}` }, body: datos
    })
    return { estado: respuesta.status, cuerpo: await respuesta.json() }
  }

  const subido = await subir('notas.txt')
  assert.equal(subido.estado, 201)
  assert.equal(subido.cuerpo.data.name, 'notas.txt')
  assert.equal(subido.cuerpo.data.size_bytes, 4)
  assert.equal((await subir('instalar.exe')).estado, 422)

  const hijos = (await pedir(`/drive/${folder.id}`)).cuerpo.data.children
  assert.ok(hijos.some((hijo) => hijo.id === subido.cuerpo.data.drive_file_id))
})

test('crear una carpeta con el nombre de una hermana responde 409', async () => {
  const { folder } = await raiz()
  assert.equal((await pedir(`/drive/${folder.id}/folders`, 'POST', { name: '01_bases' })).estado, 409)
})

test('mover a la misma carpeta responde 422 same_folder', async () => {
  const { folder, porNombre } = await raiz()
  const { estado, cuerpo } = await pedir(`/drive/${folder.id}/move`, 'POST', { item_ids: [porNombre('propuesta.pdf').id], parent_id: folder.id })
  assert.equal(estado, 422)
  assert.deepEqual(cuerpo.error.details.parent_id, ['same_folder'])
})

test('una subida de más de 25 MB responde 422 too_large', async () => {
  const { folder } = await raiz()
  const datos = new FormData()
  datos.append('file', new Blob([new Uint8Array(25 * 1024 * 1024 + 1)]), 'enorme.zip')
  const respuesta = await fetch(`${base}/drive/${folder.id}/files`, { method: 'POST', headers: { authorization: `Bearer ${staff}` }, body: datos })
  assert.equal(respuesta.status, 422)
  assert.deepEqual((await respuesta.json()).error.details.file, ['too_large'])
})

test('con Drive caído la raíz trae el error y ningún hijo, y el reintento contesta', async () => {
  reiniciarDrive()
  const { cuerpo } = await pedir('/projects/9/drive')
  assert.match(cuerpo.data.folder.error, /no responde/)
  assert.deepEqual(cuerpo.data.folder.children, [])
  assert.ok((await pedir(`/drive/${cuerpo.data.folder.id}`)).cuerpo.data.children.length > 0)
  assert.equal((await pedir('/projects/1/drive')).cuerpo.data.folder.error, null)
})

// --- Subida resumable directa (WIW-0469) --------------------------------------------------------

/** Manda un trozo (o una consulta de estado con "bytes star/total") a la sessionUrl de una sesión. */
async function mandarTrozo (sessionUrl, contentRange, cuerpo) {
  const respuesta = await fetch(sessionUrl, {
    method: 'PUT',
    headers: { 'content-range': contentRange },
    body: cuerpo
  })
  return { estado: respuesta.status, rango: respuesta.headers.get('range'), cuerpo: respuesta.status < 300 && respuesta.status !== 308 ? await respuesta.json() : null }
}

test('abre una sesión resumable, valida su tamaño y su extensión', async () => {
  const { folder } = await raiz()

  const sesion = await pedir(`/drive/${folder.id}/upload-sessions`, 'POST', { name: 'video.mp4', mimeType: 'video/mp4', size: 50 * 1024 * 1024 })
  assert.equal(sesion.estado, 200)
  assert.match(sesion.cuerpo.data.sessionUrl, /\/drive\/mock-sesion\//)
  assert.ok(new Date(sesion.cuerpo.data.expiraEn).getTime() > Date.now())

  const enorme = await pedir(`/drive/${folder.id}/upload-sessions`, 'POST', { name: 'video.mp4', mimeType: 'video/mp4', size: 3 * 1024 * 1024 * 1024 })
  assert.equal(enorme.estado, 422)
  assert.deepEqual(enorme.cuerpo.error.details.size, ['too_large'])

  const rechazada = await pedir(`/drive/${folder.id}/upload-sessions`, 'POST', { name: 'app.exe', mimeType: 'application/x-msdownload', size: 100 })
  assert.equal(rechazada.estado, 422)
})

test('sube un archivo en trozos por la sesión resumable y lo confirma', async () => {
  const { folder } = await raiz()
  const total = 20
  const sesion = (await pedir(`/drive/${folder.id}/upload-sessions`, 'POST', { name: 'clip.mp4', mimeType: 'video/mp4', size: total })).cuerpo.data

  const primero = await mandarTrozo(sesion.sessionUrl, `bytes 0-9/${total}`, new Uint8Array(10))
  assert.equal(primero.estado, 308)
  assert.equal(primero.rango, 'bytes=0-9')

  const segundo = await mandarTrozo(sesion.sessionUrl, `bytes 10-19/${total}`, new Uint8Array(10))
  assert.equal(segundo.estado, 200)
  assert.ok(typeof segundo.cuerpo.id === 'string' && segundo.cuerpo.id.length > 0)

  const confirmacion = await pedir(`/drive/${folder.id}/files/${segundo.cuerpo.id}/confirmar`, 'POST', {})
  assert.equal(confirmacion.estado, 201)
  assert.equal(confirmacion.cuerpo.data.name, 'clip.mp4')
  assert.equal(confirmacion.cuerpo.data.size_bytes, total)

  const hijos = (await pedir(`/drive/${folder.id}`)).cuerpo.data.children
  assert.ok(hijos.some((hijo) => hijo.id === confirmacion.cuerpo.data.drive_file_id))

  // Confirmar dos veces la misma subida ya no tiene nada pendiente.
  assert.equal((await pedir(`/drive/${folder.id}/files/${segundo.cuerpo.id}/confirmar`, 'POST', {})).estado, 404)
})

test('reanuda una sesión resumable: la consulta de estado dice cuánto tiene Google', async () => {
  const { folder } = await raiz()
  const total = 30
  const sesion = (await pedir(`/drive/${folder.id}/upload-sessions`, 'POST', { name: 'clip.mp4', mimeType: 'video/mp4', size: total })).cuerpo.data

  await mandarTrozo(sesion.sessionUrl, `bytes 0-14/${total}`, new Uint8Array(15))

  // Se "cae la conexión": el reintento pregunta antes de mandar más, en vez de mandar todo de nuevo.
  const estado = await mandarTrozo(sesion.sessionUrl, `bytes */${total}`, undefined)
  assert.equal(estado.estado, 308)
  assert.equal(estado.rango, 'bytes=0-14')

  const resto = await mandarTrozo(sesion.sessionUrl, `bytes 15-29/${total}`, new Uint8Array(15))
  assert.equal(resto.estado, 200)
})

test('un token de sesión que no existe responde 404, no 401: la URL no lleva el token de la persona', async () => {
  const respuesta = await fetch(`${base}/drive/mock-sesion/no-existe`, { method: 'PUT', headers: { 'content-range': 'bytes 0-0/1' }, body: new Uint8Array(1) })
  assert.equal(respuesta.status, 404)
})
