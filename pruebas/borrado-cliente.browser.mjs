import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { chromium } from 'playwright'
import { CLIENTES } from '../mock/datos.js'

/** Verifica la confirmación y el contrato del cliente contra Next y una API mock local. Nunca ejecuta DELETE. */
const origen = new URL(process.env.CLIENTE_TEST_URL ?? 'http://localhost:3119')
assert.ok(['localhost', '127.0.0.1'].includes(origen.hostname), 'Solo admite un servidor local con API mock.')
assert.ok(process.env.CLIENTE_TEST_EMAIL && process.env.CLIENTE_TEST_PASSWORD, 'Faltan credenciales de prueba.')
const mock = spawn(process.execPath, ['--input-type=module', '-e', `
  import { CLIENTES } from './mock/datos.js'
  for (const cliente of CLIENTES) cliente.shipping ??= { ...cliente.billing }
  const { servidor } = await import('./mock/servidor.js')
  servidor.listen(Number(process.env.PORT), () => process.stdout.write('listo'))
`], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: process.env.CLIENTE_TEST_API_PORT ?? '4019' }, stdio: ['ignore', 'pipe', 'inherit'] })
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })
try {
  await once(mock.stdout, 'data', { signal: AbortSignal.timeout(10000) })
  const contexto = await navegador.newContext()
  const sesion = await contexto.request.post(new URL('/api/sesion', origen).href, {
    data: { email: process.env.CLIENTE_TEST_EMAIL, password: process.env.CLIENTE_TEST_PASSWORD }
  })
  assert.ok(sesion.ok(), `Login: ${sesion.status()}`)
  const cliente = CLIENTES.find((registro) => !registro.active)
  const activo = CLIENTES.find((registro) => registro.active)
  assert.ok(cliente && activo)
  const recurso = `/api/bff/clients/${cliente.id}`
  const bajas = []
  const borrados = []
  await contexto.route('**/api/bff/**', async (ruta) => {
    const peticion = ruta.request()
    const url = new URL(peticion.url())
    if (peticion.method() === 'DELETE') {
      assert.equal(url.pathname, recurso)
      assert.equal(url.search, '')
      borrados.push(peticion.postDataJSON())
      return borrados.length === 1
        ? ruta.fulfill({ status: 503, json: { error: { message: 'Fallo de prueba' } } })
        : ruta.fulfill({ status: 204 })
    }
    if (peticion.method() === 'PATCH') {
      assert.equal(url.pathname, `/api/bff/clients/${activo.id}`)
      bajas.push(peticion.postDataJSON())
      return ruta.fulfill({ status: 503, json: { error: { message: 'Baja interceptada' } } })
    }
    return ruta.continue()
  })
  const pagina = await contexto.newPage()
  pagina.setDefaultTimeout(15000)
  await pagina.goto(new URL(`/clientes/${activo.id}`, origen).href)
  await pagina.getByRole('button', { name: 'Dar de baja', exact: true }).click()
  await pagina.getByText('Baja interceptada', { exact: true }).waitFor()
  await pagina.goto(new URL(`/clientes/${cliente.id}`, origen).href)
  await pagina.getByRole('button', { name: 'Eliminar definitivamente', exact: true }).waitFor()
  assert.deepEqual(bajas, [{ active: false }])
  assert.equal(borrados.length, 0)
  await pagina.getByRole('button', { name: 'Eliminar definitivamente', exact: true }).click()
  const dialogo = pagina.getByRole('dialog')
  const entrada = dialogo.getByLabel('Escribe «ELIMINAR» para confirmar', { exact: false })
  const eliminar = dialogo.getByRole('button', { name: 'Eliminar', exact: true })
  for (const invalido of ['', cliente.company, 'eliminar']) {
    await entrada.fill(invalido)
    assert.equal(await eliminar.isDisabled(), true)
  }
  await entrada.fill('ELIMINAR')
  assert.equal(await eliminar.isEnabled(), true)
  await eliminar.click()
  await dialogo.getByRole('alert').waitFor()
  assert.deepEqual(borrados, [{ confirmacion: 'ELIMINAR' }])
  assert.equal(await entrada.inputValue(), 'ELIMINAR')
  await eliminar.click()
  await pagina.waitForURL(new URL('/clientes', origen).href)
  assert.deepEqual(borrados, [{ confirmacion: 'ELIMINAR' }, { confirmacion: 'ELIMINAR' }])
  console.info('OK: baja por PATCH, confirmación exacta, DELETE con cuerpo, reintento y redirección. Ningún DELETE real.')
} finally {
  await navegador.close()
  mock.kill()
}
