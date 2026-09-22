import assert from 'node:assert/strict'
import { chromium } from 'playwright'

/**
 * Verifica el aviso de cierre de jornada contra un Next local ya levantado sobre el mock.
 *
 * Se corre a mano, como el resto de los `.browser.mjs`, porque necesita un servidor y una sesion:
 *
 * ```bash
 * MOCK_JORNADA_CIERRE_EN=15 node mock/servidor.js &        # el corte, 15 s despues de abrir
 * OPS_API_URL=http://127.0.0.1:4000/api/v1 pnpm start -p 3099 &
 * CIERRE_TEST_URL=http://localhost:3099 \
 * CIERRE_TEST_EMAIL=ana@wiwo.me CIERRE_TEST_PASSWORD=mock1234 \
 *   node pruebas/cierre-jornada.browser.mjs
 * ```
 *
 * Lo que comprueba es lo unico que no se puede comprobar sin navegador: que el aviso **aparezca
 * solo** al llegar la hora de corte —el reloj vive en un efecto, no en una respuesta—, que la cuenta
 * regresiva baje de verdad, y que "Sigo trabajando" lo retire y corra el cierre. Las tres fallan en
 * silencio: el componente se monta igual, no lanza, y simplemente no sale nunca.
 *
 * Y comprueba las dos que rompen datos, que son las caras: que al agotarse el plazo la jornada quede
 * CERRADA de verdad en la API —y no solo el aviso apagado en la pantalla—, y que con dos pestañas
 * abiertas contestar en una no deje que la otra cierre el dia al vencer su propia cuenta.
 *
 * Contra el build, no contra `next dev`: en desarrollo la pagina no hidrata a tiempo y los clics no
 * responden, asi que el boton daria un falso negativo.
 */
const origen = new URL(process.env.CIERRE_TEST_URL ?? 'http://localhost:3099')
assert.ok(['localhost', '127.0.0.1'].includes(origen.hostname), 'Solo admite un servidor local.')
assert.ok(process.env.CIERRE_TEST_EMAIL && process.env.CIERRE_TEST_PASSWORD, 'Faltan credenciales de prueba.')

/** El aviso, por su texto: no tiene id ni `data-*`, y el `role` lo comparte con otros. */
const AVISO = '[role="alert"]:has-text("Tu jornada se cierra sola")'

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })

try {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } })

  const entrada = await contexto.request.post(new URL('/api/sesion', origen).href, {
    data: { email: process.env.CIERRE_TEST_EMAIL, password: process.env.CIERRE_TEST_PASSWORD }
  })
  assert.equal(entrada.status(), 200, 'No se pudo entrar con las credenciales de prueba.')

  // El cierre automatico apagado es el estado de fabrica y con el no hay `closing` ninguno: se
  // enciende igual que desde el panel de mantenimiento.
  const encendido = await contexto.request.patch(
    new URL('/api/bff/mantenimiento/interruptores', origen).href,
    { data: { wiwo_live_cierre_automatico: true } }
  )
  assert.equal(encendido.status(), 200, 'No se pudo encender el cierre automatico.')

  const pagina = await contexto.newPage()
  await pagina.goto(new URL('/inicio', origen).href, { waitUntil: 'domcontentloaded' })
  await pagina.waitForTimeout(2500)

  // La jornada se abre por la API y no por la ventana de apertura: ese modal tapa los clics del
  // resto de la pagina, y lo que se prueba aca empieza despues de tenerla abierta.
  //
  // Se cierra antes de abrir porque el mock guarda su estado entre corridas: una jornada heredada
  // de la corrida anterior ya tiene el corte pasado, y la primera comprobacion —que el aviso NO
  // este todavia— fallaria sin que hubiera nada roto.
  await contexto.request.post(new URL('/api/bff/me/jornada/cierre', origen).href, { data: {} })
  await contexto.request.post(new URL('/api/bff/me/jornada', origen).href, { data: {} })
  await pagina.reload({ waitUntil: 'domcontentloaded' })
  await pagina.waitForTimeout(2500)

  // --- 1. El aviso no esta antes de la hora, y aparece solo al llegar -------------------------
  assert.equal(await pagina.locator(AVISO).count(), 0, 'El aviso salio antes de la hora de corte.')

  await pagina.waitForSelector(AVISO, { timeout: 30_000 })

  // --- 2. La cuenta regresiva baja de verdad ---------------------------------------------------
  const primero = await numeroDelAviso(pagina)
  assert.ok(primero > 0 && primero <= 30, `La cuenta arranco en ${primero}, fuera del plazo.`)

  await pagina.waitForTimeout(2200)
  const segundo = await numeroDelAviso(pagina)
  assert.ok(segundo < primero, `La cuenta no bajo: ${primero} -> ${segundo}.`)

  // --- 3. "Sigo trabajando" retira el aviso y corre el cierre en la API -------------------------
  const cortePrevio = await corteDeLaApi(contexto)

  // Por `evaluate` y no con `locator.click()`: el clic de Playwright se cuelga en este panel.
  await pagina.evaluate(() => {
    const boton = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Sigo trabajando'))
    boton?.click()
  })
  await pagina.waitForSelector(AVISO, { state: 'detached', timeout: 10_000 })

  const corteNuevo = await corteDeLaApi(contexto)
  assert.ok(
    Date.parse(corteNuevo.at) > Date.parse(cortePrevio.at),
    'La prorroga no movio el cierre en la API: el aviso solo se apago a si mismo.'
  )
  assert.equal(corteNuevo.extended, true, 'La API no marco la jornada como prorrogada.')

  // --- 4. Con dos pestañas, contestar en una no deja que la otra cierre el dia -----------------
  // Las dos montan el mismo aviso con su propia cuenta. Sin la comprobacion previa al cierre, la
  // segunda llega a cero antes de que su intervalo le cuente que el corte se movio, y cierra el dia
  // que acaban de salvar.
  await contexto.request.post(new URL('/api/bff/me/jornada/cierre', origen).href, { data: {} })
  await contexto.request.post(new URL('/api/bff/me/jornada', origen).href, { data: {} })

  const segunda = await contexto.newPage()
  await Promise.all([
    pagina.goto(new URL('/inicio', origen).href, { waitUntil: 'domcontentloaded' }),
    segunda.goto(new URL('/inicio', origen).href, { waitUntil: 'domcontentloaded' })
  ])

  await pagina.waitForSelector(AVISO, { timeout: 40_000 })
  await segunda.waitForSelector(AVISO, { timeout: 40_000 })

  // Se contesta en la primera; la segunda se queda con su cuenta corriendo hacia cero.
  await pagina.evaluate(() => {
    const boton = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Sigo trabajando'))
    boton?.click()
  })
  await pagina.waitForSelector(AVISO, { state: 'detached', timeout: 10_000 })

  // Los treinta de gracia de la segunda, mas el margen de su comprobacion.
  await segunda.waitForSelector(AVISO, { state: 'detached', timeout: 45_000 })

  const tras = await (await contexto.request.get(new URL('/api/bff/me/jornada', origen).href)).json()
  assert.ok(
    tras.data.open !== null,
    'La segunda pestaña cerro la jornada que la primera acababa de prorrogar.'
  )
  await segunda.close()

  // --- 5. Agotado el plazo, la jornada queda cerrada en la API ---------------------------------
  // Se vuelve a poner el corte al alcance moviendo la jornada: se cierra y se reabre, que es lo que
  // el mock hace con `MOCK_JORNADA_CIERRE_EN` contado desde la apertura.
  await contexto.request.post(new URL('/api/bff/me/jornada/cierre', origen).href, { data: {} })
  await contexto.request.post(new URL('/api/bff/me/jornada', origen).href, { data: {} })
  await pagina.reload({ waitUntil: 'domcontentloaded' })

  await pagina.waitForSelector(AVISO, { timeout: 40_000 })
  // Los treinta de gracia, y un margen para la peticion de cierre.
  await pagina.waitForSelector(AVISO, { state: 'detached', timeout: 45_000 })

  const estado = await (await contexto.request.get(new URL('/api/bff/me/jornada', origen).href)).json()
  assert.equal(estado.data.open, null, 'El plazo se agoto y la jornada siguio abierta en la API.')

  console.log('OK: el aviso de cierre sale a su hora, cuenta, prorroga de verdad y cierra al vencer')
} finally {
  await navegador.close()
}

/** Los segundos que quedan, leidos del propio aviso. */
async function numeroDelAviso (pagina) {
  const texto = await pagina.locator(AVISO).innerText()
  const encontrado = /se cierra sola en\s+(\d+)/.exec(texto.replace(/\s+/g, ' '))

  assert.ok(encontrado, `El aviso no muestra la cuenta regresiva: ${texto}`)

  return Number(encontrado[1])
}

/** El `closing` que la API publica ahora mismo. */
async function corteDeLaApi (contexto) {
  const respuesta = await contexto.request.get(new URL('/api/bff/me/jornada', origen).href)
  const cuerpo = await respuesta.json()

  assert.ok(cuerpo.data.closing, 'La API dejo de anunciar el cierre.')

  return cuerpo.data.closing
}
