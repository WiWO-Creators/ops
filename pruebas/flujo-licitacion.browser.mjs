import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

/**
 * Servidores locales: PORT=4010 node mock/servidor.js; node pruebas/flujo-licitacion.browser.mjs --fixture.
 * Next: API_BASE=http://localhost:4014/api/v1 SESION_CLAVE=<clave-local> npm run dev -- --port 3114.
 * Prueba: TAREA_TEST_EMAIL=ana@wiwo.me TAREA_TEST_PASSWORD=mock1234 node pruebas/flujo-licitacion.browser.mjs.
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE permite elegir Chromium instalado; sólo se interceptan escrituras locales.
 */
if (process.argv.includes('--fixture')) {
  const prospecto = { id: 1, empresa: 'Neumaticon', estado: 'abierto', cliente: { company: 'Neumaticon' }, client_id: null, client: null, convertido_en: null, creado_en: '2026-09-09', creado_por: 1, licitaciones_total: 0, licitaciones_abiertas: 0, contactos: [{ id: 42, contacto: { firstname: 'Ana', lastname: 'Existente', email: 'ana@example.test', phonenumber: '', title: '' } }], licitaciones: [] }
  const servidor = http.createServer(async (peticion, respuesta) => {
    try {
      const ruta = new URL(peticion.url, 'http://localhost').pathname
      const lista = ruta === '/api/v1/prospectos' ? [prospecto] : []
      respuesta.setHeader('content-type', 'application/json')
      if (ruta === '/api/v1/prospectos/1') return respuesta.end(JSON.stringify({ data: prospecto }))
      if (['/api/v1/prospectos', '/api/v1/prospectos/1/contactos', '/api/v1/licitaciones'].includes(ruta)) {
        return respuesta.end(JSON.stringify({ data: lista, meta: { pagination: { page: 1, per_page: 25, total: lista.length, total_pages: 1 } } }))
      }
      const fragmentos = []
      for await (const fragmento of peticion) fragmentos.push(fragmento)
      const remoto = await fetch('http://localhost:4010' + peticion.url, { method: peticion.method, headers: peticion.headers, body: fragmentos.length ? Buffer.concat(fragmentos) : undefined })
      respuesta.statusCode = remoto.status
      if (ruta === '/api/v1/me') {
        const sobre = await remoto.json()
        sobre.data.secciones_habilitadas.push('prospectos', 'licitaciones', 'upsells')
        return respuesta.end(JSON.stringify(sobre))
      }
      respuesta.end(Buffer.from(await remoto.arrayBuffer()))
    } catch (error) {
      respuesta.statusCode = 500
      respuesta.end(JSON.stringify({ error: { message: String(error) } }))
    }
  })
  servidor.listen(4014, '127.0.0.1')
  await new Promise(resolve => servidor.on('close', resolve))
  process.exit(0)
}

const destino = new URL(process.env.FLUJO_TEST_URL ?? 'http://localhost:3114')
assert.ok(['localhost', '127.0.0.1'].includes(destino.hostname), 'Sólo pruebas locales.')
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })
try {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 1100 } })
  const login = await contexto.request.post(new URL('/api/sesion', destino).href, { data: { email: process.env.TAREA_TEST_EMAIL, password: process.env.TAREA_TEST_PASSWORD } })
  assert.ok(login.ok(), `Login HTTP ${login.status()}`)
  const escrituras = []
  let fallo = false
  await contexto.route('**/api/bff/**', async ruta => {
    const peticion = ruta.request()
    if (['GET', 'HEAD'].includes(peticion.method())) return ruta.continue()
    const pathname = new URL(peticion.url()).pathname
    if (!/\/(prospectos(?:\/\d+(?:\/contactos(?:\/\d+)?)?)?|licitaciones)$/.test(pathname)) return ruta.abort()
    escrituras.push({ ruta: pathname, metodo: peticion.method(), cuerpo: peticion.postDataJSON() })
    if (fallo) return ruta.fulfill({ status: 503, json: { error: { message: 'Fallo controlado de prueba' } } })
    return ruta.fulfill({ json: { data: { id: pathname.endsWith('/licitaciones') ? 3 : pathname.includes('/contactos') ? 2 : 1 } } })
  })
  const pagina = await contexto.newPage()
  pagina.setDefaultTimeout(10000)
  const errores = []
  pagina.on('pageerror', error => errores.push(error.message))
  const dialogo = pagina.getByRole('dialog')
  const boton = nombre => dialogo.getByRole('button', { name: nombre, exact: true })
  const etapa = nombre => dialogo.getByRole('heading', { name: nombre, exact: true }).waitFor()
  const abrir = async () => {
    await pagina.goto(new URL('/prospectos', destino).href, { timeout: 90000 })
    await pagina.getByRole('button', { name: 'Nuevo prospecto', exact: true }).click()
    await dialogo.waitFor()
  }
  await abrir()
  await boton('Guardar y continuar').click()
  assert.equal(escrituras.length, 0)
  await dialogo.getByLabel(/^Nombre o razón social/).fill('Empresa de prueba')
  await boton('Guardar y salir').click()
  await pagina.getByRole('button', { name: 'Nuevo prospecto', exact: true }).click()
  assert.equal(await dialogo.getByLabel(/^Nombre o razón social/).inputValue(), 'Empresa de prueba')
  await boton('Guardar y continuar').click()
  await etapa('Contacto')
  assert.equal(escrituras.length, 1)
  await dialogo.getByLabel(/^Nombre/, { exact: false }).fill('Ana')
  await dialogo.getByLabel(/^Apellido/).fill('Prueba')
  await dialogo.getByLabel(/^Correo/).fill('invalido')
  await boton('Guardar y continuar').click()
  assert.equal(escrituras.length, 1)
  await dialogo.getByLabel(/^Correo/).fill('ana@example.test')
  await abrir()
  await etapa('Contacto')
  assert.equal(await dialogo.getByLabel(/^Correo/).inputValue(), 'ana@example.test')
  assert.equal(escrituras.length, 1, 'Recargar no repite prospecto.')
  await boton('Guardar y continuar').click()
  await etapa('Licitación')
  await dialogo.getByLabel(/^Nombre del/).fill('Proyecto de prueba')
  await dialogo.getByLabel(/^Fecha de inicio/).fill('2026-09-09')
  await boton('Atrás').click()
  await etapa('Contacto')
  assert.equal(await dialogo.getByLabel(/^Correo/).inputValue(), 'ana@example.test')
  await dialogo.getByLabel(/^Apellido/).fill('Corregido')
  await boton('Guardar y continuar').click()
  await etapa('Licitación')
  assert.equal(escrituras.at(-1).metodo, 'PATCH')
  assert.match(escrituras.at(-1).ruta, /\/contactos\/2$/)
  assert.equal(await dialogo.getByLabel(/^Nombre del/).inputValue(), 'Proyecto de prueba')
  await mkdir('output/playwright', { recursive: true })
  await pagina.screenshot({ path: 'output/playwright/flujo-licitacion-desktop.png', fullPage: true })
  await pagina.setViewportSize({ width: 390, height: 844 })
  await pagina.screenshot({ path: 'output/playwright/flujo-licitacion-mobile.png', fullPage: true })
  assert.ok(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Sin desborde móvil.')
  await boton('Crear licitación').click()
  await pagina.waitForURL('**/licitaciones/3')
  assert.equal(escrituras.filter(e => e.ruta.endsWith('/licitaciones')).length, 1)
  assert.equal(escrituras.at(-1).cuerpo.prospecto_id, 1)
  assert.equal(await pagina.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('wiwo:licitacion:')).length), 0)
  await abrir()
  await dialogo.getByLabel(/^Nombre o razón social/).fill('Empresa con fallo')
  fallo = true
  await boton('Guardar y continuar').click()
  await dialogo.getByText('No se pudo confirmar la última creación.', { exact: false }).waitFor()
  assert.ok(await boton('Guardar y continuar').isDisabled())
  const total = escrituras.length
  await abrir()
  assert.ok(await boton('Guardar y continuar').isDisabled())
  assert.equal(escrituras.length, total)
  // El detalle local de prueba contiene el contacto 42, que debe reutilizarse.
  fallo = false
  await pagina.goto(new URL('/prospectos/1?tab=licitaciones', destino).href)
  await pagina.getByRole('button', { name: 'Nueva licitación', exact: true }).click()
  await etapa('Contacto')
  await boton('Atrás').click()
  await etapa('Prospecto')
  assert.ok(await dialogo.getByLabel(/^Nombre o razón social/).isDisabled())
  await boton('Continuar').click()
  await etapa('Contacto')
  await dialogo.getByLabel('Usar contacto', { exact: true }).click()
  await pagina.getByRole('option', { name: 'Ana Existente', exact: true }).click()
  assert.equal(await dialogo.getByLabel(/^Correo/).inputValue(), 'ana@example.test')
  await boton('Guardar y continuar').click()
  await etapa('Licitación')
  assert.equal(escrituras.at(-1).metodo, 'PATCH')
  assert.match(escrituras.at(-1).ruta, /\/contactos\/42$/)
  await boton('Guardar y salir').click()
  await pagina.evaluate(() => {
    for (const clave of Object.keys(localStorage)) if (clave.startsWith('wiwo:licitacion:') && clave.endsWith(':nuevo')) localStorage.setItem(clave, '{corrupto')
  })
  await abrir()
  await dialogo.getByText('El borrador guardado no es válido.', { exact: false }).waitFor()
  await pagina.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Almacenamiento bloqueado de prueba') } })
  await dialogo.getByLabel(/^Nombre o razón social/).fill('Sin almacenamiento')
  await dialogo.getByText('No se pudo guardar el borrador en este navegador.', { exact: false }).waitFor()
  const antesBloqueo = escrituras.length
  await boton('Guardar y continuar').click()
  assert.equal(escrituras.length, antesBloqueo, 'Sin checkpoint durable no se envía un POST.')
  await boton('Guardar y salir').click()
  assert.ok(await dialogo.isVisible(), 'No anuncia guardado ni cierra ante fallo de almacenamiento.')
  assert.deepEqual(errores, [])
  console.log('Flujo verificado: requerido, correo inválido, guardar/salir, recarga, IDs, PATCH al volver, creación única, borrador eliminado, móvil, fallo ambiguo persistido, contacto existente sin duplicar, borrador corrupto y almacenamiento bloqueado.')
} finally {
  await navegador.close()
}
