import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { mensajeDeRespuesta } from '../src/datos/cliente.ts'

test('subidas conservan el archivo y solo confirman una respuesta válida de la API', async () => {
  const fuente = ts.transpileModule(readFileSync(new URL('../src/componentes/datos/mutaciones.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const archivo = new File(['imagen de prueba'], 'foto.png', { type: 'image/png' })
  let responder
  let envio
  const contexto = {
    exports: {}, FormData,
    require: nombre => {
      assert.equal(nombre, '@/datos/cliente')
      return { mensajeDeRespuesta }
    },
    fetch: async (url, opciones) => { envio = { url, ...opciones }; return responder() }
  }
  vm.runInNewContext(fuente, contexto)
  const subir = contexto.exports.subirArchivoEnBff
  for (const [ruta, campo] of [['clients/1/image', 'image'], ['projects/1/image', 'image'], ['me/foto', 'profile_image']]) {
    responder = () => Response.json({ data: { image_url: '/foto.png' } })
    const resultado = await subir(ruta, archivo, campo)
    assert.equal(resultado.ok, true)
    assert.equal(resultado.datos.image_url, '/foto.png')
    assert.equal(envio.url, `/api/bff/${ruta}`)
    assert.equal(envio.method, 'POST')
    assert.equal(await envio.body.get(campo).text(), await archivo.text())
    assert.equal(envio.headers, undefined, 'El navegador debe generar el boundary multipart.')

    for (const cuerpo of ['', '<html>Login</html>', '{}', 'null', '{"data":null}', '{"error":{"message":"Falló"}}']) {
      responder = () => new Response(cuerpo, { status: 200 })
      const rechazo = await subir(ruta, archivo, campo)
      assert.equal(rechazo.ok, false, `No confirmar falso éxito: ${cuerpo}`)
      assert.match(rechazo.mensaje, /no confirmó/)
    }
    responder = () => Response.json({ error: { message: 'No se pudo guardar la imagen.' } }, { status: 409 })
    assert.equal((await subir(ruta, archivo, campo)).mensaje, 'No se pudo guardar la imagen.')
    responder = () => { throw new Error('Sin conexión') }
    assert.equal((await subir(ruta, archivo, campo)).ok, false)
  }
})
