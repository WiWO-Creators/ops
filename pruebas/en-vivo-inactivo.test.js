/**
 * Pruebas del modo inactivo del servicio de «Ops en vivo».
 *
 * Lo que se protege: que sin los secretos el servicio no se caiga (PM2 no entra en bucle de
 * reinicios), que solo conteste la salud con `sin_configurar`, que rechace sockets e internas, que
 * un secreto inválido siga siendo error y que ningún mensaje delate valores.
 */

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'
import {
  decidirModoDeArranque,
  leerConfiguracion,
  leerConfiguracionInactiva,
  secretosFaltantes
} from '../servicios/en-vivo/configuracion.ts'
import { crearServicioInactivo } from '../servicios/en-vivo/inactivo.ts'
import { ORIGEN, PREFIJO, SECRETO, SECRETO_BOLETO } from './apoyo/en-vivo.mjs'

let servicio
let puerto

before(async () => {
  servicio = crearServicioInactivo(leerConfiguracionInactiva({ EN_VIVO_PUERTO: '0' }), ['EN_VIVO_SECRETO', 'EN_VIVO_BOLETO_SECRETO'])
  puerto = await servicio.escuchar()
})

after(async () => {
  await servicio.cerrar()
})

test('secretosFaltantes: nombra solo los ausentes o vacíos', () => {
  assert.deepEqual(secretosFaltantes({}), ['EN_VIVO_SECRETO', 'EN_VIVO_BOLETO_SECRETO'])
  assert.deepEqual(secretosFaltantes({ EN_VIVO_SECRETO: SECRETO, EN_VIVO_BOLETO_SECRETO: '  ' }), ['EN_VIVO_BOLETO_SECRETO'])
  assert.deepEqual(secretosFaltantes({ EN_VIVO_SECRETO: SECRETO, EN_VIVO_BOLETO_SECRETO: SECRETO_BOLETO }), [])
})

test('un secreto presente pero inválido sigue siendo error, sin mostrar su valor', () => {
  const corto = 'corto-pero-presente'

  assert.deepEqual(secretosFaltantes({ EN_VIVO_SECRETO: corto, EN_VIVO_BOLETO_SECRETO: SECRETO_BOLETO }), [])
  assert.throws(
    () => leerConfiguracion({ EN_VIVO_SECRETO: corto, EN_VIVO_BOLETO_SECRETO: SECRETO_BOLETO }),
    (error) => error.message.includes('EN_VIVO_SECRETO') && !error.message.includes(corto)
  )
})

test('configuración inactiva: valores por defecto y validación del puerto y el prefijo', () => {
  assert.deepEqual(leerConfiguracionInactiva({}), { puerto: 4010, host: '127.0.0.1', prefijo: '/en-vivo' })
  assert.equal(leerConfiguracionInactiva({ EN_VIVO_PREFIJO: '/otro' }).prefijo, '/otro')
  assert.throws(() => leerConfiguracionInactiva({ EN_VIVO_PUERTO: 'abc' }), /EN_VIVO_PUERTO/)
  assert.throws(() => leerConfiguracionInactiva({ EN_VIVO_PREFIJO: 'sin-barra' }), /EN_VIVO_PREFIJO/)
})

test('la salud responde ok:false con el motivo', async () => {
  const respuesta = await fetch(`http://127.0.0.1:${puerto}${PREFIJO}/salud`)

  assert.equal(respuesta.status, 503)
  assert.deepEqual(await respuesta.json(), { ok: false, motivo: 'sin_configurar' })
})

test('las rutas internas se rechazan y lo demás no existe', async () => {
  const interna = await fetch(`http://127.0.0.1:${puerto}${PREFIJO}/interno/eventos`, { method: 'POST', body: '{}' })

  assert.equal(interna.status, 503)
  assert.equal((await fetch(`http://127.0.0.1:${puerto}${PREFIJO}/otra`)).status, 404)
  assert.equal((await fetch(`http://127.0.0.1:${puerto}/salud`)).status, 404)
})

test('los sockets de bus y documentos se rechazan con 503', async () => {
  for (const ruta of ['bus', 'doc']) {
    const ws = new WebSocket(`ws://127.0.0.1:${puerto}${PREFIJO}/${ruta}`, { headers: { origin: ORIGEN } })
    const [, respuesta] = await once(ws, 'unexpected-response')

    assert.equal(respuesta.statusCode, 503, ruta)
    respuesta.resume()
  }
})

test('el proceso arranca sin secretos, avisa ready, registra una línea sin valores y se apaga con SIGTERM', async () => {
  const entorno = { PATH: process.env.PATH, EN_VIVO_PUERTO: '0', EN_VIVO_HOST: '127.0.0.1' }
  // Se ejecuta desde otra carpeta para que un `.env` local con secretos no cambie el resultado.
  const hijo = spawn(process.execPath, [fileURLToPath(new URL('../servicios/en-vivo/servidor.ts', import.meta.url))], {
    cwd: tmpdir(),
    env: entorno,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  })
  let salida = ''
  let error = ''

  hijo.stdout.on('data', (trozo) => { salida += trozo })
  hijo.stderr.on('data', (trozo) => { error += trozo })

  const [mensaje] = await Promise.race([
    once(hijo, 'message'),
    once(hijo, 'exit').then(([codigo]) => { throw new Error(`salió con ${codigo}: ${error}`) })
  ])

  assert.equal(mensaje, 'ready')

  const lineas = salida.trim().split('\n').map((linea) => JSON.parse(linea))

  assert.ok(lineas.some((l) => l.evento === 'inactivo' && l.motivo === 'sin_configurar' && l.faltan === 'EN_VIVO_SECRETO,EN_VIVO_BOLETO_SECRETO'))
  assert.ok(!salida.includes(SECRETO))

  hijo.kill('SIGTERM')

  const [codigo] = await once(hijo, 'exit')

  assert.equal(codigo, 0)
})

const ENTORNO_VALIDO = {
  EN_VIVO_SECRETO: SECRETO,
  EN_VIVO_BOLETO_SECRETO: SECRETO_BOLETO,
  EN_VIVO_ORIGENES: ORIGEN,
  API_BASE: 'http://127.0.0.1:9/api/v1',
  EN_VIVO_PUERTO: '0'
}

test('decidirModoDeArranque: activo con todo válido, inactivo sin secretos o con configuración inválida', () => {
  assert.equal(decidirModoDeArranque(ENTORNO_VALIDO).modo, 'activo')

  const sinSecretos = decidirModoDeArranque({ EN_VIVO_PUERTO: '0' })

  assert.equal(sinSecretos.modo, 'inactivo')
  assert.equal(sinSecretos.motivo, 'sin_configurar')
  assert.deepEqual(sinSecretos.detalle, ['EN_VIVO_SECRETO', 'EN_VIVO_BOLETO_SECRETO'])

  for (const [variable, valor] of [['EN_VIVO_ORIGENES', 'no-es-url-secreta'], ['API_BASE', 'ftp://x'], ['EN_VIVO_DEBOUNCE_MS', 'abc']]) {
    const invalida = decidirModoDeArranque({ ...ENTORNO_VALIDO, [variable]: valor })

    assert.equal(invalida.modo, 'inactivo', variable)
    assert.equal(invalida.motivo, 'configuracion_invalida', variable)
    assert.ok(invalida.detalle.join(' ').includes(variable), variable)
    assert.ok(!invalida.detalle.join(' ').includes(valor), `${variable}: el detalle no lleva el valor`)
  }
})

test('con secretos presentes pero configuración inválida el proceso arranca inactivo, avisa ready y no delata valores', async () => {
  const entorno = { ...ENTORNO_VALIDO, PATH: process.env.PATH, EN_VIVO_HOST: '127.0.0.1', EN_VIVO_ORIGENES: 'valor-invalido-que-no-debe-salir' }
  const hijo = spawn(process.execPath, [fileURLToPath(new URL('../servicios/en-vivo/servidor.ts', import.meta.url))], {
    cwd: tmpdir(),
    env: entorno,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  })
  let salida = ''
  let error = ''

  hijo.stdout.on('data', (trozo) => { salida += trozo })
  hijo.stderr.on('data', (trozo) => { error += trozo })

  const [mensaje] = await Promise.race([
    once(hijo, 'message'),
    once(hijo, 'exit').then(([codigo]) => { throw new Error(`salió con ${codigo}: ${error}`) })
  ])

  assert.equal(mensaje, 'ready')

  const lineas = salida.trim().split('\n').map((linea) => JSON.parse(linea))

  assert.ok(lineas.some((l) => l.evento === 'inactivo' && l.motivo === 'configuracion_invalida' && String(l.detalle).includes('EN_VIVO_ORIGENES')))
  assert.ok(!salida.includes(SECRETO) && !salida.includes(SECRETO_BOLETO) && !salida.includes('valor-invalido-que-no-debe-salir'))

  hijo.kill('SIGTERM')

  const [codigo] = await once(hijo, 'exit')

  assert.equal(codigo, 0)
})

test('la salud del servicio inactivo por configuración inválida da el motivo', async () => {
  const inactivo = crearServicioInactivo(leerConfiguracionInactiva({ EN_VIVO_PUERTO: '0' }), ['EN_VIVO_ORIGENES debe ser una URL.'], 'configuracion_invalida')
  const puertoInactivo = await inactivo.escuchar()

  try {
    const respuesta = await fetch(`http://127.0.0.1:${puertoInactivo}${PREFIJO}/salud`)

    assert.equal(respuesta.status, 503)
    assert.deepEqual(await respuesta.json(), { ok: false, motivo: 'configuracion_invalida' })
  } finally {
    await inactivo.cerrar()
  }
})
