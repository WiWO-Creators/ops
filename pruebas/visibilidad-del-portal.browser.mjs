/**
 * Verificación del bloque «Qué ve el cliente» del panel del Proyecto, contra servidor local.
 *
 * Se corre a mano:
 * ```bash
 * node mock/servidor.js &
 * pnpm build && pnpm start &
 * node pruebas/visibilidad-del-portal.browser.mjs
 * ```
 *
 * Con `pnpm build && pnpm start`, no con `pnpm dev`: en desarrollo la página no hidrata a tiempo y
 * las casillas no responden al clic, así que un fallo acá no distinguiría un bug de una compilación
 * a medias.
 *
 * Variables: `PORTAL_TEST_URL` (por defecto http://127.0.0.1:3000), `PORTAL_TEST_EMAIL`,
 * `PORTAL_TEST_PASSWORD` y `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.
 *
 * ## QUÉ PROTEGE, Y POR QUÉ NO SE PODÍA ESCRIBIR ANTES
 *
 * `PUT /projects/{id}/portal-settings` es de REEMPLAZO TOTAL: una clave que el cuerpo no trae es 422.
 * Y el panel arma ese cuerpo con el objeto entero que le devolvió el GET, no con la lista de casillas
 * que dibuja. De ahí salen los dos modos de fallo que esta prueba cubre y que ninguna prueba de
 * unidad puede ver, porque viven en el ida y vuelta con la API:
 *
 *   1. Una clave que la API sirve y el panel no dibuja: viaja en cada guardado y nadie la puede
 *      tocar. Es un interruptor invisible.
 *   2. Un cuerpo al que le falta una clave: 422 en cada guardado, y el bloque entero deja de
 *      funcionar por haberle agregado una casilla.
 *
 * Y una tercera que es de interfaz y no de contrato: el cambio es optimista, así que si la API lo
 * rechaza la casilla tiene que volver a donde estaba. Quedarse encendida después de un 403 le dice
 * al staff que el cliente ya ve algo que no ve.
 *
 * ## POR QUÉ SE SALTEA SOLA EN VEZ DE FALLAR
 *
 * `mock/servidor.js` sirvió mucho tiempo una sola de las claves —`wiwo_portal_actas`— y su PUT
 * rechazaba las demás como `desconocida`. Contra ese mock este bloque no funciona, y no por un bug
 * del panel. Así que la prueba mira primero qué claves trae el GET y, si el mock todavía no las sirve
 * todas, imprime SKIP y sale con 0, igual que `portal_paridad.php` cuando le falta `API_BASE`. Una
 * prueba que falla por una razón que no es la que vino a medir se termina ignorando, y una ignorada
 * no protege nada.
 *
 * ## LO QUE NO AFIRMA A PROPÓSITO
 *
 * No afirma CUÁNTAS claves hay ni cuáles. La lista la manda la API y crece —la migración 0830 suma
 * ocho—; congelarla acá sería un número que hay que editar en dos repos. Lo que se afirma es que lo
 * que la API sirve y lo que el panel dibuja coincidan, y eso no depende de cuántas sean.
 *
 * Tampoco afirma el valor inicial de ningún interruptor. `wiwo_portal_tickets` nace encendido y su
 * fila ausente vale 1, al revés que los otros, pero eso lo decide `VisibilidadContacto::porDefecto()`
 * en el board y lo cubren las pruebas de allá. Acá se compara la casilla contra lo que el GET dijo,
 * sea lo que sea: así la prueba sigue sirviendo cuando el mock cambie sus valores de arranque.
 */

import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { STAFF } from '../mock/datos.js'

const destino = new URL(process.env.PORTAL_TEST_URL ?? 'http://127.0.0.1:3000')
const ESPACIO = 1
const CLAVE_TICKETS = 'wiwo_portal_tickets'

/** Las claves propias de este módulo, las que tienen migración y pueden perderse en un merge. */
const PROPIAS = ['wiwo_portal_actas', 'wiwo_portal_gestion', CLAVE_TICKETS]

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })

try {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 1200 } })

  const login = await contexto.request.post(new URL('/api/sesion', destino).href, {
    data: {
      email: process.env.PORTAL_TEST_EMAIL ?? STAFF[0].email,
      password: process.env.PORTAL_TEST_PASSWORD ?? STAFF[0].password
    }
  })
  assert.ok(login.ok(), `Entrar al panel: HTTP ${login.status()}`)

  /** Lo que el GET de los interruptores devolvió, para comparar la pantalla contra eso y no contra una lista a mano. */
  let servidos = null
  /** Los cuerpos de cada PUT, en orden. */
  const enviados = []
  /** Cuando es true, el próximo PUT se responde 503 sin llegar al mock. */
  let fallarProximoPut = false

  await contexto.route('**/api/bff/**', async (ruta) => {
    const peticion = ruta.request()
    const url = new URL(peticion.url())
    const esBloque = url.pathname.endsWith('/portal-settings')

    if (esBloque && peticion.method() === 'GET') {
      // Se deja pasar y se lee la respuesta: las claves las manda la API, y compararlas contra una
      // copia escrita acá sería comparar el panel contra esta prueba en vez de contra el contrato.
      const respuesta = await ruta.fetch()
      const cuerpo = await respuesta.json()
      servidos = cuerpo.data ?? cuerpo
      return await ruta.fulfill({ response: respuesta })
    }

    if (esBloque && peticion.method() === 'PUT') {
      const cuerpo = peticion.postDataJSON()
      enviados.push(cuerpo)

      if (fallarProximoPut) {
        fallarProximoPut = false

        return await ruta.fulfill({ status: 503, json: { error: { message: 'Fallo de prueba. No se guardó.' } } })
      }

      // Se responde con lo mismo que se mandó, que es lo que devuelve el endpoint real: el estado ya
      // guardado. Así no se escribe en el mock y la pantalla queda coherente igual.
      return await ruta.fulfill({ json: { data: cuerpo } })
    }

    // Ninguna otra escritura sale de acá: esta prueba mira una pantalla, no modifica datos.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(peticion.method())) return await ruta.abort()

    return await ruta.continue()
  })

  const pagina = await contexto.newPage()
  const errores = []
  pagina.on('pageerror', (error) => errores.push(error.message))

  await pagina.goto(new URL(`/proyectos/${ESPACIO}?tab=configuracion`, destino).href)

  // El modal de jornada se pinta encima y se come los clics. Puede no aparecer, así que el fallo de
  // la espera no es un fallo de la prueba.
  const jornada = pagina.getByRole('dialog').filter({ hasText: 'Abre tu jornada' })
  await jornada.waitFor({ timeout: 10000 }).catch(() => {})

  if (await jornada.count() > 0) {
    await jornada.getByRole('button', { name: 'Cerrar', exact: true }).evaluate((boton) => { boton.click() })
    await jornada.waitFor({ state: 'hidden' })
  }

  const maestro = pagina.locator('#portal-visible_para_cliente')
  await maestro.waitFor({ timeout: 20000 })

  assert.ok(servidos !== null, 'El panel no pidió los interruptores del portal.')

  const claves = Object.keys(servidos)
  const faltantes = PROPIAS.filter((clave) => !claves.includes(clave))

  if (faltantes.length > 0) {
    console.info(
      `visibilidad-del-portal: SKIP. La API local sirve ${claves.length} interruptor(es) y le faltan `
      + `${faltantes.join(', ')}. Contra un mock que no sirve el bloque entero, este archivo no mide `
      + 'el panel. Poné el mock al día leyendo de `Escritura\\AjustesDelPortal::CLAVES` y volvé a correrlo.'
    )
    await navegador.close()
    process.exit(0)
  }

  // 1. Todo lo que la API sirve se dibuja, y con el estado que la API dijo.
  for (const [clave, valor] of Object.entries(servidos)) {
    const casilla = pagina.locator(`#portal-${clave}`)

    assert.equal(await casilla.count(), 1, `La API sirve ${clave} y el panel no lo dibuja: es un interruptor invisible.`)
    assert.equal(
      await casilla.isChecked(),
      valor === true,
      `La casilla ${clave} no muestra lo que la API devolvió (${String(valor)}).`
    )
  }

  // 2. Las solicitudes de soporte viven en el grupo de pestañas, que es donde está la pregunta que
  //    contestan, y su letra chica dice lo que no se deduce de la casilla.
  const pestanias = pagina.locator('fieldset', { has: pagina.getByText('Pestañas del portal', { exact: true }) })

  assert.equal(await pestanias.locator(`#portal-${CLAVE_TICKETS}`).count(), 1, 'Las solicitudes de soporte no están en «Pestañas del portal».')
  await assert.doesNotReject(
    pestanias.getByText(/apagarlo le cierra también esa puerta/).waitFor({ timeout: 5000 }),
    'Falta la letra chica que avisa que apagar las solicitudes también le cierra la escritura al cliente.'
  )

  // 3. El PUT manda el bloque ENTERO con una sola casilla cambiada. Es la parte que ninguna prueba de
  //    unidad ve y la que rompe el bloque completo si se cae una clave.
  const tickets = pagina.locator(`#portal-${CLAVE_TICKETS}`)
  const antes = await tickets.isChecked()

  await tickets.evaluate((casilla) => { casilla.click() })
  await pagina.waitForFunction(() => document.querySelector('[aria-busy="false"]') !== null)

  assert.equal(enviados.length, 1, 'Tocar una casilla tiene que mandar exactamente un PUT.')

  const cuerpo = enviados[0]

  assert.deepEqual(
    Object.keys(cuerpo).sort(),
    claves.sort(),
    'El PUT no mandó las mismas claves que trajo el GET: el endpoint es de reemplazo total y contesta 422.'
  )
  assert.equal(cuerpo[CLAVE_TICKETS], !antes, 'El PUT no mandó el valor nuevo de la casilla tocada.')

  for (const [clave, valor] of Object.entries(servidos)) {
    if (clave === CLAVE_TICKETS) continue

    assert.equal(cuerpo[clave], valor, `El PUT cambió ${clave}, que nadie tocó.`)
  }

  assert.equal(await tickets.isChecked(), !antes, 'La casilla no quedó en el valor nuevo después de guardar.')

  // 4. Y si la API lo rechaza, la casilla vuelve. Quedarse encendida después de un 503 diría que el
  //    cliente ya ve algo que no ve.
  fallarProximoPut = true
  await tickets.evaluate((casilla) => { casilla.click() })

  // Se filtra por el texto porque el anunciador de rutas de Next también es `role="alert"` y está
  // vacío: `getByRole('alert')` a secas resuelve dos elementos y Playwright aborta por ambigüedad.
  await pagina.getByRole('alert').filter({ hasText: 'No se guardó' }).waitFor({ timeout: 10000 })

  assert.equal(enviados.length, 2, 'El segundo clic tiene que haber mandado su propio PUT.')
  assert.equal(
    await tickets.isChecked(),
    !antes,
    'Después de un PUT rechazado, la casilla tiene que volver al valor que tenía.'
  )

  assert.deepEqual(errores, [])
  console.info(
    `Visibilidad del portal: ${claves.length} interruptores dibujados y con el estado de la API, `
    + 'las solicitudes de soporte en el grupo de pestañas con su letra chica, el PUT de reemplazo '
    + 'total con una sola clave cambiada, y la casilla revertida tras un rechazo.'
  )
} finally {
  await navegador.close()
}
