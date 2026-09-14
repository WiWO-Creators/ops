import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { STAFF } from '../mock/datos.js'

/** Comprueba la bienvenida y la entrada sin escrituras de negocio, contra Next y API mock locales. */
const destino = new URL(process.env.ENTRADA_TEST_URL ?? 'http://localhost:3121')
assert.ok(['localhost', '127.0.0.1'].includes(destino.hostname), 'Solo se permite un entorno local.')
const salida = 'output/playwright/entrada-marca'
await mkdir(salida, { recursive: true })
const navegador = await chromium.launch()
try {
  for (const movil of [false, true]) {
    const contexto = await navegador.newContext({
      viewport: movil ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      recordVideo: { dir: salida, size: movil ? { width: 390, height: 844 } : { width: 1440, height: 1000 } }
    })
    const login = await contexto.request.post(new URL('/api/sesion', destino).href, {
      data: { email: STAFF[0].email, password: STAFF[0].password }
    })
    assert.ok(login.ok(), `Login mock: HTTP ${login.status()}`)
    const { version } = await (await contexto.request.get(new URL('/api/version', destino).href)).json()
    const pagina = await contexto.newPage()
    const errores = []
    pagina.on('pageerror', error => errores.push(error.message))
    await pagina.goto(new URL('/espacios', destino).href)
    await pagina.locator('h1').waitFor()
    await pagina.evaluate(version => sessionStorage.setItem('wiwo-version-recien', version), version)
    await pagina.reload()
    const monito = pagina.locator('.bienvenida-capa')
    await monito.waitFor()
    assert.equal(await pagina.locator('h1').evaluate(el => getComputedStyle(el).animationPlayState), 'paused')
    await pagina.waitForTimeout(850)
    await pagina.screenshot({ path: `${salida}/${movil ? 'movil' : 'escritorio'}-monito.png` })
    await monito.waitFor({ state: 'detached' })
    await pagina.waitForTimeout(850)
    const titulo = pagina.locator('h1')
    const estado = await titulo.evaluate(el => {
      const css = getComputedStyle(el)
      return { transform: css.transform, opacity: css.opacity, filter: css.filter, animation: css.animationName }
    })
    assert.equal(estado.transform, 'none')
    assert.equal(estado.opacity, '1')
    assert.equal(estado.filter, 'none')
    assert.equal(estado.animation, 'entrada-titulo')
    assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await pagina.screenshot({ path: `${salida}/${movil ? 'movil' : 'escritorio'}-pagina.png` })
    // Un refresco de datos no vuelve a montar el titulo ni reinicia su entrada.
    await titulo.evaluate(el => { el.dataset.verificacionEntrada = 'conservada' })
    await Promise.all([
      pagina.waitForResponse(respuesta => new URL(respuesta.url()).pathname === '/espacios' && respuesta.ok()),
      pagina.getByRole('button', { name: 'Refrescar', exact: true }).click()
    ])
    await pagina.getByRole('button', { name: 'Refrescar', exact: true }).waitFor()
    assert.equal(await titulo.getAttribute('data-verificacion-entrada'), 'conservada')
    await pagina.emulateMedia({ reducedMotion: 'reduce' })
    await pagina.evaluate(version => sessionStorage.setItem('wiwo-version-recien', version), version)
    await pagina.reload()
    await monito.waitFor()
    assert.equal(await pagina.locator('h1').evaluate(el => getComputedStyle(el).animationName), 'none')
    assert.equal(await pagina.locator('.monito-brazo').evaluate(el => getComputedStyle(el).animationName), 'none')
    await monito.waitFor({ state: 'detached' })
    assert.deepEqual(errores, [])
    const video = pagina.video()
    await contexto.close()
    await video.saveAs(`${salida}/${movil ? 'movil' : 'escritorio'}.webm`)
  }
  console.log('Entrada y monito: escritorio, móvil, refresco de datos y movimiento reducido OK.')
} finally {
  await navegador.close()
}
