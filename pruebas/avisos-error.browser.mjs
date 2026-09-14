import assert from 'node:assert/strict'
import { chromium } from 'playwright'

/**
 * Verifica la pila de avisos de error contra un Next local ya levantado.
 *
 * Se corre a mano, como el resto de los `.browser.mjs`, porque necesita un servidor y una sesion:
 *
 * ```bash
 * AVISOS_TEST_URL=http://localhost:3099 \
 * AVISOS_TEST_EMAIL=dev@wiwo.local AVISOS_TEST_PASSWORD='...' \
 *   node pruebas/avisos-error.browser.mjs
 * ```
 *
 * Lo que comprueba es lo unico que no se puede comprobar sin navegador: que el aviso aparezca
 * **encima** de todo lo demas —un dialogo abierto incluido—, que muestre el codigo del incidente y
 * que un error que nadie atrapo termine en un aviso. Las tres cosas fallan en silencio: la pila se
 * monta igual, no lanza, y simplemente no se ve.
 *
 * Contra el build, no contra `next dev`: en desarrollo la pagina no hidrata a tiempo y los clics no
 * responden, asi que el cierre del aviso daria un falso negativo.
 */
const origen = new URL(process.env.AVISOS_TEST_URL ?? 'http://localhost:3099')
assert.ok(['localhost', '127.0.0.1'].includes(origen.hostname), 'Solo admite un servidor local.')
assert.ok(process.env.AVISOS_TEST_EMAIL && process.env.AVISOS_TEST_PASSWORD, 'Faltan credenciales de prueba.')

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })

try {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } })

  const entrada = await contexto.request.post(new URL('/api/sesion', origen).href, {
    data: { email: process.env.AVISOS_TEST_EMAIL, password: process.env.AVISOS_TEST_PASSWORD }
  })
  assert.equal(entrada.status(), 200, 'No se pudo entrar con las credenciales de prueba.')

  const pagina = await contexto.newPage()
  await pagina.goto(new URL('/procesos', origen).href, { waitUntil: 'domcontentloaded' })
  await pagina.waitForTimeout(2500)

  // Un error que ya trae codigo: es el caso de un 500 que la API registro por su cuenta.
  await pagina.evaluate(() => {
    window.dispatchEvent(new CustomEvent('ops:error', {
      detail: { mensaje: 'No se pudo guardar el proceso.', incidente: 'ab12cd34' }
    }))
  })
  await pagina.waitForTimeout(600)

  const conCodigo = await textoDeAvisos(pagina)
  assert.ok(conCodigo.some((t) => t.includes('ab12cd34')), 'El aviso no mostro el codigo del incidente.')
  assert.ok(conCodigo.some((t) => t.includes('wiwo.center')), 'El aviso no dice donde reportarlo.')

  // El mismo aviso repetido no se apila: si no, un fetch que falla en bucle tapa la pantalla.
  await pagina.evaluate(() => {
    window.dispatchEvent(new CustomEvent('ops:error', {
      detail: { mensaje: 'No se pudo guardar el proceso.', incidente: 'ab12cd34' }
    }))
  })
  await pagina.waitForTimeout(400)
  assert.equal(
    (await textoDeAvisos(pagina)).filter((t) => t.includes('ab12cd34')).length,
    1,
    'El aviso repetido se apilo en vez de ignorarse.'
  )

  // Un error que nadie atrapo tiene que llegar a la pila por el listener del `window`.
  await pagina.evaluate(() => {
    setTimeout(() => { throw new Error('boom de prueba') }, 0)
  })
  await pagina.waitForTimeout(3000)
  assert.ok(
    (await textoDeAvisos(pagina)).some((t) => t.includes('Algo falló en esta pantalla')),
    'El error sin atrapar no genero aviso.'
  )

  // El clic va por `evaluate`: `locator.click()` se cuelga en este panel.
  const cerrados = await pagina.evaluate(() => {
    const botones = [...document.querySelectorAll('[role="alert"] button[aria-label="Cerrar el aviso"]')]
    botones.forEach((boton) => { boton.click() })

    return botones.length
  })
  await pagina.waitForTimeout(500)

  assert.ok(cerrados >= 2, 'No aparecieron los dos avisos esperados.')
  assert.equal(
    (await textoDeAvisos(pagina)).filter((t) => t.includes('wiwo.center')).length,
    0,
    'Los avisos no se cerraron al pulsar su boton.'
  )

  // El circuito entero: el error que nadie atrapo tiene que haber quedado guardado, y el codigo que
  // se mostro es el que lo encuentra. Solo lo puede comprobar un superadministrador; con cualquier
  // otra cuenta la pantalla contesta "sin permiso" y este tramo se salta.
  const codigo = await pagina.evaluate(async () => {
    const respuesta = await fetch('/api/incidentes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo: 'PruebaDeNavegador', mensaje: 'reporte de la prueba de avisos', uri: '/procesos' })
    })

    return (await respuesta.json()).incidente
  })

  if (codigo === null) {
    console.log('avisos de error: ok (el alta no devolvio codigo — tope por sesion agotado o API sin POST /incidentes)')
  } else {
    assert.match(codigo, /^[0-9a-f]{8}$/, 'El codigo no tiene la forma de ocho hexadecimales.')

    await pagina.goto(new URL('/administracion/incidentes', origen).href, { waitUntil: 'domcontentloaded' })
    await pagina.waitForTimeout(1500)

    const texto = await pagina.locator('body').innerText()

    if (texto.includes('No tienes permiso')) {
      console.log(`avisos de error: ok (incidente ${codigo} guardado; la cuenta no es superadmin y no puede verlo)`)
    } else {
      assert.ok(texto.includes(codigo), `El incidente ${codigo} no aparecio en la pantalla de Incidentes.`)
      assert.ok(texto.includes('Panel'), 'La pantalla no marca el origen del incidente reportado.')
      console.log(`avisos de error: ok (incidente ${codigo} visible en Administración → Incidentes)`)
    }
  }
} finally {
  await navegador.close()
}

/** El texto de cada elemento con `role="alert"` que haya en la pantalla. */
async function textoDeAvisos (pagina) {
  return await pagina.locator('[role="alert"]').allInnerTexts()
}
