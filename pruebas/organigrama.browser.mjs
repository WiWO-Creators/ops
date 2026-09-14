import assert from 'node:assert/strict'
import { chromium } from 'playwright'

/**
 * Recorre el organigrama en un servidor local: el mapa, la entrada a un área, el árbol y una
 * reasignación real.
 *
 * Configuración: ORG_TEST_URL, ORG_TEST_EMAIL/PASSWORD o ORG_TEST_STORAGE_STATE y
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE. Requiere una sesión de superadministración —sin ella no hay
 * edición que probar— contra un mock o una base de prueba: **escribe**, así que no se apunta a
 * producción. Termina con código distinto de cero ante errores de React o comportamiento incorrecto.
 *
 * Reemplaza a `jerarquia.browser.mjs`, que recorría la pantalla de áreas que este organigrama
 * sustituyó.
 */
const destino = new URL(process.env.ORG_TEST_URL ?? 'http://localhost:3121/equipo/jerarquia')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo se permite un servidor local de prueba.')
assert.ok(['http:', 'https:'].includes(destino.protocol), 'La URL debe usar HTTP o HTTPS.')
if (destino.pathname === '/') destino.pathname = '/equipo/jerarquia'
const correo = process.env.ORG_TEST_EMAIL
const clave = process.env.ORG_TEST_PASSWORD
assert.equal(Boolean(correo), Boolean(clave), 'Configura ORG_TEST_EMAIL y ORG_TEST_PASSWORD juntos.')

/** Clic por `evaluate`: `locator.click()` se cuelga en este panel por las capas de superposición. */
async function clicar (locator) {
  await locator.first().waitFor({ state: 'visible', timeout: 15000 })
  await locator.first().evaluate((elemento) => { elemento.click() })
}

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })
try {
  const contexto = await navegador.newContext({
    viewport: { width: 1440, height: 1000 },
    storageState: process.env.ORG_TEST_STORAGE_STATE
  })
  // Sólo el propio servidor: la prueba escribe, y una navegación fuera de origen sería otra cosa.
  await contexto.route('**/*', async (ruta) => {
    const peticion = ruta.request()

    if (peticion.isNavigationRequest() && new URL(peticion.url()).origin !== destino.origin) {
      await ruta.abort()

      return
    }

    await ruta.continue()
  })

  if (correo && clave) {
    const respuesta = await contexto.request.post(new URL('/api/sesion', destino).href, {
      data: { email: correo, password: clave },
      maxRedirects: 0
    })
    assert.ok(respuesta.ok(), `Falló la sesión local de prueba: HTTP ${respuesta.status()}.`)
  }

  const pagina = await contexto.newPage()
  const errores = []
  pagina.on('pageerror', (error) => errores.push(error.message))
  pagina.on('console', (mensaje) => {
    if (mensaje.type() === 'error' && /react|hydration|hydrating|unique.*key/i.test(mensaje.text())) {
      errores.push(mensaje.text())
    }
  })

  /**
   * Cierra el diálogo de la jornada, que el panel abre solo al entrar.
   *
   * Es un modal de verdad: mientras esté abierto marca el resto de la página con `aria-hidden`, así
   * que sin cerrarlo ninguna consulta por rol encuentra nada — y eso es correcto, no un fallo del
   * organigrama. Se ESPERA a que aparezca en vez de mirar si ya está: monta después de la primera
   * pintura, y preguntar de inmediato daba siempre cero y lo dejaba encima de todo lo que sigue.
   *
   * Es una función y no un bloque suelto porque hace falta las dos veces que se carga la página: al
   * entrar y al recargar para comprobar que la vista elegida se recuerda.
   */
  async function cerrarJornada () {
    const jornada = pagina.getByRole('dialog').filter({ hasText: 'jornada' })
    await jornada.first().waitFor({ timeout: 15000 }).catch(() => {})
    if (await jornada.count()) {
      await pagina.keyboard.press('Escape')
      await jornada.first().waitFor({ state: 'detached', timeout: 15000 })
    }
  }

  await pagina.goto(destino.href)
  await cerrarJornada()

  // --- 1. El mapa pinta ---------------------------------------------------
  const tarjetaSinArea = pagina.getByRole('button').filter({ hasText: 'Sin área' })
  await tarjetaSinArea.first().waitFor({ timeout: 20000 })

  const tarjetas = pagina.getByRole('listitem')
  assert.ok(await tarjetas.count() > 1, 'El mapa tiene que traer varias áreas más la de "Sin área".')

  const analytics = pagina.getByRole('button').filter({ hasText: 'Analytics' }).first()
  assert.ok(await analytics.count(), 'Falta el área Analytics del fixture.')
  assert.match(await analytics.innerText(), /Dirige /, 'La tarjeta tiene que decir quién dirige.')
  assert.match(await analytics.innerText(), /leads?$/m, 'La tarjeta tiene que decir cuántos leads.')

  // --- 2. Se entra a un área y el árbol se dibuja -------------------------
  await clicar(analytics)
  const volver = pagina.getByRole('button', { name: 'Todas las áreas' })
  await volver.waitFor({ timeout: 15000 })

  const cajas = pagina.locator('li button[draggable="true"]')
  const cuantas = await cajas.count()
  assert.ok(cuantas > 0, 'El árbol del área tiene que dibujar al menos una caja.')

  // El color del borde es el del área, y no el mismo para todas: es la pieza que hace visible que
  // una caja cuelga de un jefe de otra área.
  const bordes = new Set(await cajas.evaluateAll(
    (nodos) => nodos.map((nodo) => getComputedStyle(nodo).borderTopColor)
  ))
  assert.ok(bordes.size > 1, 'Con gente de dos áreas en el árbol, los bordes no pueden ser todos iguales.')

  // Las líneas son pseudo-elementos del módulo CSS: si no llegaron, el árbol se ve como una lista.
  const hayLineas = await pagina.locator('li').first().evaluate(
    (nodo) => getComputedStyle(nodo, '::after').content !== 'none' ||
      getComputedStyle(nodo, '::before').content !== 'none'
  )
  assert.ok(hayLineas, 'Faltan los conectores del árbol.')

  // --- 3. Volver al mapa sin recargar -------------------------------------
  const antes = await pagina.evaluate(() => performance.getEntriesByType('navigation').length)
  await clicar(volver)
  await tarjetaSinArea.first().waitFor({ timeout: 15000 })
  assert.equal(
    await pagina.evaluate(() => performance.getEntriesByType('navigation').length), antes,
    'Volver al mapa no puede recargar la página.'
  )

  // --- 4. Una reasignación escribe, y sólo con el teclado ------------------
  await clicar(analytics)
  await volver.waitFor({ timeout: 15000 })
  // La última caja es una hoja: la raíz ya está sin jefe y ahí "Sin jefe" no cambiaría nada.
  await clicar(cajas.last())

  const panel = pagina.getByRole('dialog')
  await panel.waitFor({ timeout: 15000 })
  assert.ok(await panel.getByText('Depende de').count(), 'El panel tiene que ofrecer el jefe de una lista.')
  assert.ok(await panel.getByText('Escalón').count(), 'El panel tiene que ofrecer el escalón.')
  assert.ok(await panel.getByText('Área').count(), 'El panel tiene que ofrecer el área.')

  const escritas = []
  pagina.on('response', (respuesta) => {
    if (respuesta.request().method() === 'PUT' && respuesta.url().includes('/api/bff/accesos/personas/')) {
      escritas.push(respuesta.status())
    }
  })

  // Se le cambia el jefe. Se elige la primera opción distinta de la que ya tiene —y no una fija—
  // para que la prueba se pueda correr dos veces seguidas: con el valor que ya está puesto no hay
  // cambio que guardar y el botón queda deshabilitado, que es lo correcto pero no lo que se prueba.
  // Todo el recorrido va con teclado a propósito: es la prueba de que arrastrar no es la única vía.
  const jefe = panel.getByRole('combobox').nth(1)
  const puesto = (await jefe.innerText()).trim()
  await jefe.focus()
  await pagina.keyboard.press('Enter')

  const opciones = pagina.getByRole('option')
  await opciones.first().waitFor({ timeout: 15000 })
  const textos = await opciones.allInnerTexts()
  const otra = textos.findIndex((texto) => texto.trim() !== puesto)
  assert.ok(otra >= 0, `El selector de jefe sólo ofrece lo que ya está puesto: ${textos.join(' / ')}.`)
  await clicar(opciones.nth(otra))

  const guardar = panel.getByRole('button', { name: 'Guardar' })
  assert.equal(await guardar.isDisabled(), false, 'Con un cambio puesto, Guardar tiene que habilitarse.')
  await guardar.focus()
  await pagina.keyboard.press('Enter')

  await panel.waitFor({ state: 'detached', timeout: 20000 })
  assert.deepEqual(escritas, [200], `La reasignación tenía que escribir un PUT con 200; fue ${escritas.join(', ') || 'ninguno'}.`)

  // --- 5. La lista: el conmutador, el buscador, el orden y la MISMA edición -
  //
  // La lista no es otra pantalla ni —sobre todo— otra forma de editar: es la otra lectura de lo
  // mismo. Lo que se comprueba acá es justamente eso, que una fila abre el MISMO panel y escribe el
  // MISMO `PUT /accesos/personas/{id}` que una caja del árbol. Dos idiomas de edición para el mismo
  // dato es lo que esta pantalla vino a evitar.
  const conmutador = pagina.getByRole('group', { name: 'Vista' })
  assert.ok(await conmutador.count(), 'El conmutador tiene que estar dentro de un área.')

  await clicar(volver)
  await tarjetaSinArea.first().waitFor({ timeout: 15000 })
  assert.ok(await conmutador.count(), 'El conmutador tiene que estar también en el mapa.')

  await clicar(conmutador.getByRole('button', { name: 'Lista' }))

  const tabla = pagina.getByRole('table')
  await tabla.waitFor({ timeout: 15000 })

  const encabezados = (await tabla.locator('thead th').allInnerTexts()).map((uno) => uno.trim())
  assert.deepEqual(encabezados, ['Persona', 'Escalón', 'Depende de', 'Área'])

  const filas = tabla.locator('tbody tr')
  const totalFilas = await filas.count()
  assert.ok(totalFilas > 1, 'La lista del mapa tiene que traer a toda la gente visible.')

  /** El nombre que pinta una fila, que es lo primero de su celda de persona. */
  const nombreDeFila = async (indice) => (await filas.nth(indice).innerText()).split('\n')[0].trim()

  // El buscador: con 184 personas una lista sin él no sirve.
  const buscador = pagina.getByRole('searchbox')
  const buscado = await nombreDeFila(0)
  await buscador.fill(buscado)
  await pagina.waitForFunction(
    (cuantas) => document.querySelectorAll('tbody tr').length < cuantas, totalFilas, { timeout: 15000 }
  )
  assert.ok(await filas.count() >= 1, 'El buscador dejó la lista en cero buscando a alguien que está.')
  assert.ok(
    (await filas.first().innerText()).includes(buscado),
    `Buscando "${buscado}" tiene que quedar su fila.`
  )

  await buscador.fill('')
  await pagina.waitForFunction(
    (cuantas) => document.querySelectorAll('tbody tr').length === cuantas, totalFilas, { timeout: 15000 }
  )

  // El orden: la lista abre por nombre, y pulsar la columna lo da vuelta.
  const primeroAscendente = await nombreDeFila(0)
  assert.equal(await tabla.locator('th').first().getAttribute('aria-sort'), 'ascending')
  await clicar(tabla.getByRole('button', { name: /^Persona/ }))
  await pagina.waitForFunction(
    (nombre) => !(document.querySelector('tbody tr')?.innerText ?? '').startsWith(nombre),
    primeroAscendente, { timeout: 15000 }
  )
  assert.equal(await tabla.locator('th').first().getAttribute('aria-sort'), 'descending')
  assert.notEqual(await nombreDeFila(0), primeroAscendente, 'Pulsar la columna tiene que dar vuelta el orden.')

  await clicar(tabla.getByRole('button', { name: /^Área/ }))
  assert.equal(await tabla.locator('th').nth(3).getAttribute('aria-sort'), 'ascending',
    'La columna de área también tiene que ordenar.')

  // Una fila abre el mismo panel y guarda por el mismo camino.
  await clicar(filas.first())
  const panelDeFila = pagina.getByRole('dialog')
  await panelDeFila.waitFor({ timeout: 15000 })
  assert.ok(await panelDeFila.getByText('Depende de').count(), 'La fila tiene que abrir el mismo panel que la caja.')

  const jefeDeFila = panelDeFila.getByRole('combobox').nth(1)
  const puestoDeFila = (await jefeDeFila.innerText()).trim()
  await jefeDeFila.focus()
  await pagina.keyboard.press('Enter')
  await opciones.first().waitFor({ timeout: 15000 })
  const textosDeFila = await opciones.allInnerTexts()
  const otraDeFila = textosDeFila.findIndex((texto) => texto.trim() !== puestoDeFila)
  assert.ok(otraDeFila >= 0, 'El selector de jefe de la fila sólo ofrece lo que ya está puesto.')
  await clicar(opciones.nth(otraDeFila))

  const guardarDeFila = panelDeFila.getByRole('button', { name: 'Guardar' })
  await guardarDeFila.focus()
  await pagina.keyboard.press('Enter')
  await panelDeFila.waitFor({ state: 'detached', timeout: 20000 })
  assert.deepEqual(escritas, [200, 200],
    `La fila tenía que escribir su propio PUT al mismo sitio; fue ${escritas.join(', ') || 'ninguno'}.`)

  // La vista elegida se recuerda: quien prefiere la lista no la vuelve a elegir en cada visita.
  await pagina.reload()
  await cerrarJornada()
  await tabla.waitFor({ timeout: 20000 })

  // En pantalla angosta la tabla desplaza DENTRO de su caja, sin empujar el ancho de la página.
  await pagina.setViewportSize({ width: 390, height: 844 })
  await tabla.waitFor({ timeout: 15000 })
  const desbordeLista = await pagina.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  assert.ok(desbordeLista <= 1, `La lista desborda ${desbordeLista}px a lo ancho en 390px.`)

  await pagina.setViewportSize({ width: 1440, height: 1000 })
  await clicar(conmutador.getByRole('button', { name: 'Organigrama' }))
  await tarjetaSinArea.first().waitFor({ timeout: 15000 })
  await clicar(analytics)
  await volver.waitFor({ timeout: 15000 })

  // --- 6. En pantalla angosta el layout no se rompe -----------------------
  await pagina.setViewportSize({ width: 390, height: 844 })
  await clicar(volver)
  await tarjetaSinArea.first().waitFor({ timeout: 15000 })
  const desborde = await pagina.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  assert.ok(desborde <= 1, `El mapa desborda ${desborde}px a lo ancho en 390px.`)

  assert.deepEqual(errores, [], `Errores en el navegador:\n${errores.join('\n')}`)
  console.log(`Organigrama verificado: ${cuantas} cajas, ${bordes.size} colores de borde, ${totalFilas} filas en la lista, 2 reasignaciones escritas.`)
} finally {
  await navegador.close()
}
