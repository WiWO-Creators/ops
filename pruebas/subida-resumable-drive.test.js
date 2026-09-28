/**
 * Pruebas de la subida resumable directa a Google Drive: los tres bugs de seguridad/robustez de
 * WIW-0469 que este seguimiento corrige.
 *
 *   1. Un `308` de Google manda el siguiente trozo desde el `Range` que Google confirmó, no desde el
 *      offset que el cliente cree haber enviado.
 *   2. Si Google ya confirmó el archivo (200/201) pero `confirmar` falla, el reintento no vuelve a
 *      abrir sesión ni a mandar un solo byte: reintenta solo `confirmar`.
 *   3. Un abort que llega mientras se pregunta el estado de una sesión no termina abriendo una sesión
 *      nueva por una carrera con el reintento.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function cargar ({ escribirEnBff, fetch }) {
  const fuente = ts.transpileModule(
    readFileSync(new URL('../src/componentes/archivos/subida-resumable-drive.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText

  const contexto = {
    exports: {},
    require: (nombre) => {
      if (nombre === '@/componentes/datos/mutaciones') return { escribirEnBff }
      if (nombre === '@/componentes/archivos/red-drive') return { rutaDeCarpeta: (id) => `drive/${id}` }
      throw new Error(`import no mockeado en la prueba: ${nombre}`)
    },
    fetch,
    console
  }
  vm.runInNewContext(fuente, contexto)

  return contexto.exports
}

/** Un `File` del tamaño pedido, sin gastar memoria de más (el contenido no importa). */
function archivoDe (bytes, nombre = 'video.mp4') {
  return new File([new Uint8Array(bytes)], nombre, { type: 'video/mp4' })
}

test('un 308 manda el siguiente trozo desde el Range que confirmó Google, no desde el offset local', async () => {
  const TROZO = 8 * 1024 * 1024
  const total = TROZO + 2 * 1024 * 1024 // fuerza dos trozos
  const archivo = archivoDe(total)
  const pedidos = []

  const { subirDirectoAGoogle } = cargar({
    escribirEnBff: async (ruta) => {
      if (ruta.endsWith('/upload-sessions')) return { ok: true, datos: { sessionUrl: 'https://google.test/sesion-1', expiraEn: 'x' } }
      if (ruta.endsWith('/confirmar')) return { ok: true, datos: { drive_file_id: 'gdrive-1' } }
      throw new Error(`ruta no mockeada: ${ruta}`)
    },
    fetch: async (url, opciones) => {
      pedidos.push(opciones.headers['Content-Range'])

      if (pedidos.length === 1) {
        // Google solo confirmó la mitad del primer trozo, no el trozo entero que mandó el cliente.
        return new Response(null, { status: 308, headers: { Range: 'bytes=0-4194303' } })
      }

      return Response.json({ id: 'gdrive-1' }, { status: 200 })
    }
  })

  const resultado = await subirDirectoAGoogle(
    'folder-1', archivo, () => {}, new AbortController().signal, undefined, () => {}
  )

  assert.equal(resultado.ok, true)
  assert.equal(pedidos[0], `bytes 0-${TROZO - 1}/${total}`)
  // El segundo trozo arranca en el byte que confirmó el `Range` (4194304), no en el que asumía el
  // cliente (TROZO = 8388608).
  assert.equal(pedidos[1], `bytes 4194304-${total - 1}/${total}`)
})

test('si confirmar falla tras un archivo ya subido, el reintento con driveFileId conocido no reabre sesión ni resube', async () => {
  const archivo = archivoDe(1024)
  let confirmarLlamado = 0
  const llamadasFetch = []

  const { subirDirectoAGoogle } = cargar({
    escribirEnBff: async (ruta) => {
      assert.match(ruta, /\/confirmar$/, 'no debería llamar a upload-sessions de nuevo')
      confirmarLlamado += 1
      return { ok: false, mensaje: 'timeout', estado: 504 }
    },
    fetch: async (url, opciones) => { llamadasFetch.push({ url, opciones }); throw new Error('no debería tocar Google') }
  })

  const resultado = await subirDirectoAGoogle(
    'folder-1', archivo, () => {}, new AbortController().signal,
    { sessionUrl: 'https://google.test/sesion-vieja', driveFileId: 'gdrive-ya-subido' },
    () => {}
  )

  assert.equal(resultado.ok, false)
  assert.equal(resultado.reintentable, true)
  assert.equal(confirmarLlamado, 1)
  assert.equal(llamadasFetch.length, 0, 'no debe volver a hablar con Google: ya está subido')
})

test('un abort durante la consulta de estado de la sesión no abre una sesión nueva', async () => {
  const archivo = archivoDe(1024)
  let abrirSesionLlamado = false

  const control = new AbortController()

  const { subirDirectoAGoogle } = cargar({
    escribirEnBff: async (ruta) => {
      if (ruta.endsWith('/upload-sessions')) abrirSesionLlamado = true
      return { ok: true, datos: { sessionUrl: 'https://google.test/sesion-nueva', expiraEn: 'x' } }
    },
    fetch: async () => {
      // La cancelación llega justo cuando se está preguntando el estado de la sesión: es la carrera
      // que el fix evita.
      control.abort()
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
  })

  const resultado = await subirDirectoAGoogle(
    'folder-1', archivo, () => {}, control.signal,
    { sessionUrl: 'https://google.test/sesion-vieja' },
    () => {}
  )

  assert.equal(resultado.ok, false)
  assert.equal(resultado.cancelada, true)
  assert.equal(abrirSesionLlamado, false, 'un abort no puede terminar abriendo una sesión nueva')
})
