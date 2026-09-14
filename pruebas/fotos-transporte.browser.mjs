import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as esperar } from 'node:timers/promises'
import { sellar } from '../src/datos/sobre-sesion.ts'

/** Verifica los bytes de las tres fotos atravesando Next real hacia un servidor local aislado. */
const clave = randomBytes(32)
const capturas = []
const upstream = createServer(async (peticion, respuesta) => {
  const trozos = []
  for await (const trozo of peticion) trozos.push(trozo)
  const cuerpo = Buffer.concat(trozos)
  const tipo = peticion.headers['content-type'] ?? ''
  const captura = { ruta: peticion.url, tipo, campos: [] }
  if (tipo.startsWith('multipart/form-data')) {
    const formulario = await new Response(cuerpo, { headers: { 'content-type': tipo } }).formData()
    for (const [nombre, archivo] of formulario) {
      captura.campos.push({ nombre, archivo: archivo.name, bytes: Buffer.from(await archivo.arrayBuffer()).toString('hex') })
    }
  } else captura.cuerpo = cuerpo.toString()
  capturas.push(captura)
  respuesta.writeHead(200, { 'content-type': 'application/json' })
  respuesta.end(JSON.stringify({ data: captura }))
})
upstream.listen(0, '127.0.0.1')
await once(upstream, 'listening')
const puerto = Number(process.env.FOTOS_TEST_PORT ?? 3112)
const next = spawn('node', ['node_modules/next/dist/bin/next', 'dev', '--port', String(puerto)], {
  env: { ...process.env, API_BASE: `http://127.0.0.1:${upstream.address().port}/api/v1`, SESION_CLAVE: clave.toString('hex') },
  stdio: ['ignore', 'pipe', 'pipe']
})
let salida = ''
next.stdout.on('data', dato => { salida += dato })
next.stderr.on('data', dato => { salida += dato })
const origen = `http://127.0.0.1:${puerto}`
try {
  let listo = false
  for (let intento = 0; intento < 90; intento++) {
    try { listo = (await fetch(`${origen}/api/bff/me`)).status === 401 } catch (error) {
      if (error.cause?.code !== 'ECONNREFUSED') throw error
    }
    if (listo) break
    if (next.exitCode !== null) throw new Error(salida)
    await esperar(500)
  }
  assert.ok(listo, `Next no arrancó: ${salida}`)
  const cookie = sellar({ acceso: 'prueba-local', refresco: 'refresco-local', venceEn: Math.floor(Date.now() / 1000) + 3600, sujeto: 'staff', sujetoId: 1 }, clave)
  const bytes = Buffer.from('89504e470d0a1a0a0001020304', 'hex')
  for (const [ruta, campo] of [['clients/1/image', 'image'], ['projects/1/image', 'image'], ['me/foto', 'profile_image']]) {
    const formulario = new FormData()
    formulario.append(campo, new Blob([bytes], { type: 'image/png' }), 'foto.png')
    const respuesta = await fetch(`${origen}/api/bff/${ruta}`, { method: 'POST', headers: { cookie: `ops_sesion=${cookie}`, origin: origen }, body: formulario })
    assert.equal(respuesta.status, 200, await respuesta.text())
  }
  assert.equal(capturas.length, 3)
  for (const [indice, campo] of ['image', 'image', 'profile_image'].entries()) {
    assert.match(capturas[indice].tipo, /^multipart\/form-data; boundary=/)
    assert.deepEqual(capturas[indice].campos, [{ nombre: campo, archivo: 'foto.png', bytes: bytes.toString('hex') }])
  }
  console.log('OK: clientes, proyectos y perfil conservan multipart y bytes del archivo.')
} finally {
  next.kill('SIGTERM')
  await once(next, 'exit')
  upstream.closeAllConnections()
  await new Promise(resolve => upstream.close(resolve))
}
