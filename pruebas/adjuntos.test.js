/**
 * Adjuntos de un Espacio o de un Proceso.
 *
 * Las tres funciones deciden lo que la ficha muestra y a donde apunta cada boton, y las tres se
 * rompen en silencio: una ruta mal armada da `404`, y un origen mal clasificado ofrece descargar un
 * enlace de Google Drive que no existe como binario. Nada de eso lo atrapa TypeScript.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nombreDeArchivo, origenDeArchivo, rutaDeAdjuntos } from '../src/definiciones/archivos.ts'

/** Fila minima de la API, con lo que cada prueba necesita pisar. */
function archivo (campos) {
  return {
    id: 77,
    file_name: 'informe-1725.pdf',
    original_file_name: null,
    subject: null,
    filetype: 'application/pdf',
    rel_type: 'task',
    rel_id: 512,
    staff_id: 183,
    date_added: '2026-08-02T11:00:00Z',
    visible_to_customer: false,
    external: null,
    url: null,
    thumbnail_url: null,
    ...campos
  }
}

test('la ruta de adjuntos cuelga de la entidad, no del archivo', () => {
  assert.equal(rutaDeAdjuntos('tasks', 512), 'tasks/512/files')
  assert.equal(rutaDeAdjuntos('projects', 8), 'projects/8/files')
})

test('el nombre legible prefiere lo que escribio la persona al nombre en disco', () => {
  assert.equal(nombreDeArchivo(archivo({ subject: 'Informe final' })), 'Informe final')
  assert.equal(nombreDeArchivo(archivo({ original_file_name: 'informe.pdf' })), 'informe.pdf')
  assert.equal(nombreDeArchivo(archivo({})), 'informe-1725.pdf')
})

test('un adjunto interno se baja por el BFF, no por la ruta de la API', () => {
  const origen = origenDeArchivo(archivo({ url: '/api/v1/files/task/77/download' }))

  assert.deepEqual(origen, { tipo: 'descargable', ruta: '/api/bff/files/task/77/download' })
})

test('un adjunto externo se abre en su servicio y no ofrece descarga', () => {
  const origen = origenDeArchivo(archivo({ external: 'gdrive', url: 'https://drive.google.com/file/d/abc/view' }))

  assert.deepEqual(origen, {
    tipo: 'externo',
    servicio: 'gdrive',
    enlace: 'https://drive.google.com/file/d/abc/view'
  })
})

test('sin url no hay nada que ofrecer, ni siquiera con `external`', () => {
  assert.equal(origenDeArchivo(archivo({})).tipo, 'sinEnlace')
  assert.equal(origenDeArchivo(archivo({ external: 'gdrive' })).tipo, 'sinEnlace')
  assert.equal(origenDeArchivo(archivo({ external: '', url: '' })).tipo, 'sinEnlace')
})

test('una url que no es del contrato no se convierte en ruta del BFF', () => {
  assert.equal(origenDeArchivo(archivo({ url: '/uploads/tasks/77/informe.pdf' })).tipo, 'sinEnlace')
})
