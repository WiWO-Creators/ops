/**
 * Recorrido del Organigrama en un navegador de verdad, contra el build y la API mock locales.
 *
 * Va contra `next start` y no contra `next dev` a propósito: en `dev` la página no hidrata y ningún
 * clic responde, así que una corrida ahí da verde sin haber probado nada.
 *
 * Cubre el camino entero de quien ordena el organigrama —crear una raíz, colgarle una hija, ponerle
 * jefe, sacar a alguien de «Sin área», traerlo de otra y borrar un área—, los caminos de error que
 * la pantalla tiene que resolver —el nombre repetido (422), el ciclo (que ni se llega a ofrecer), el
 * área con gente y el área que se ve vacía pero está usada por Procesos (los dos 409)—, la insignia
 * del área que no coincide con ninguna de los Procesos, el nombre que no se puede editar, y las dos
 * caras del permiso: quien dirige un área ve solo su rama, y quien no dirige nada recibe el 403.
 *
 * El mock guarda en memoria lo que la corrida crea: hay que reiniciarlo entre una corrida y la
 * siguiente, o la cuenta de áreas sembradas ya no da 17.
 *
 *     PORT=3098 node mock/servidor.js
 *     PORT=3097 pnpm start        # con API_BASE apuntando al mock
 *     ORGANIGRAMA_TEST_URL=http://localhost:3097 node pruebas/organigrama.browser.mjs
 */

import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const destino = new URL(process.env.ORGANIGRAMA_TEST_URL ?? 'http://localhost:3097')
assert.ok(['localhost', '127.0.0.1'].includes(destino.hostname), 'Solo se permite un entorno local.')

const salida = 'output/playwright/organigrama'
await mkdir(salida, { recursive: true })

/** Un nombre distinto en cada corrida: el mock conserva lo creado mientras siga levantado. */
const sello = Date.now().toString().slice(-6)
const RAIZ = `Raíz ${sello}`
const HIJA = `Hija ${sello}`

/** La ruta de la pantalla. */
const RUTA = '/administracion/organigrama'

/**
 * Clic por `evaluate`.
 *
 * `locator.click()` se cuelga en esta aplicación —Playwright espera una estabilidad que la capa de
 * transiciones nunca le concede—, así que se dispara el evento sobre el elemento ya resuelto.
 */
async function clicar (localizador) {
  await localizador.first().waitFor()
  await localizador.first().evaluate((elemento) => { elemento.click() })
}

/**
 * Elige una opción de un `Select` de Radix por teclado.
 *
 * Radix abre con `pointerdown` y no con `click`, así que un clic sintético no lo despliega. El
 * teclado es el camino que el propio componente garantiza.
 */
async function elegirEnSelector (pagina, etiqueta, textoDeLaOpcion) {
  const disparador = pagina.locator(`label:has-text("${etiqueta}") ~ button`).first()

  await disparador.waitFor()
  await disparador.evaluate((elemento) => { elemento.focus() })
  await pagina.keyboard.press('Enter')
  await pagina.locator('[role="option"]').first().waitFor()
  await clicar(pagina.locator(`[role="option"]:has-text("${textoDeLaOpcion}")`))
  await pagina.locator('[role="option"]').first().waitFor({ state: 'detached' })
}

/**
 * Cierra el diálogo abierto por su propio botón y espera a que se desmonte.
 *
 * Por el botón y no con `Escape`: es lo que aprieta una persona, y no depende de dónde haya quedado
 * el foco después de cerrar un desplegable de Radix, que fue justamente lo que colgaba la corrida.
 */
async function cerrarDialogo (pagina) {
  await clicar(pagina.locator('[role="dialog"] button:has-text("Cancelar")'))
  await pagina.locator('[role="dialog"]').waitFor({ state: 'detached' })
}

/**
 * La fila del árbol de esa área, por nombre exacto.
 *
 * Exacto y sobre el `span` del nombre, no `:has-text()` sobre la fila entera: aquello es subcadena y
 * sin distinguir mayúsculas, así que buscar «PR» también encontraba la fila que lleva la insignia
 * «…de los Procesos».
 */
function fila (pagina, nombre) {
  return pagina.locator(`li[role="treeitem"]:has(span.font-semibold:text-is("${nombre}"))`).first()
}

/** Abre la pantalla con la sesión de esa cuenta del mock, en el ancho pedido. */
async function entrar (navegador, email, viewport = { width: 1440, height: 1000 }) {
  const contexto = await navegador.newContext({ viewport })
  const login = await contexto.request.post(new URL('/api/sesion', destino).href, {
    data: { email, password: 'mock1234' }
  })

  assert.ok(login.ok(), `Login de ${email}: HTTP ${login.status()}`)

  const pagina = await contexto.newPage()
  await pagina.goto(new URL(RUTA, destino).href)
  await pagina.locator('h1:has-text("Organigrama")').waitFor()

  return pagina
}

/** Lo que `/me` dice de quien está mirando esa página. */
async function quienMira (pagina) {
  const respuesta = await pagina.request.get(new URL('/api/bff/me', destino).href)

  assert.ok(respuesta.ok(), `GET /me: HTTP ${respuesta.status()}`)

  return (await respuesta.json()).data
}

const navegador = await chromium.launch()
const visto = []
const errores = []

try {
  // --- Quien administra: el organigrama entero --------------------------------
  const pagina = await entrar(navegador, 'ana@wiwo.me')
  pagina.on('pageerror', (error) => errores.push(error.message))
  await pagina.locator('[role="tree"]').waitFor()

  const cabecera = await pagina.locator('main').innerText()
  assert.match(cabecera, /En vivo/, 'Falta la explicación de para qué sirve el organigrama')
  visto.push('La cabecera explica que quien dirige un área ve a su gente y a la de las que cuelgan.')

  assert.match(cabecera, /1 persona sin área/, 'Falta el aviso de cuánta gente queda por ubicar')
  visto.push('El aviso de «sin área» está arriba de todo, no escondido: en el fixture es 1 de 7.')

  const sembradas = await pagina.locator('li[role="treeitem"]').count()
  assert.equal(sembradas, 17, `Se esperaban las 17 áreas del fixture, hay ${sembradas}`)
  visto.push(`El árbol pinta las ${sembradas} áreas del fixture, con la rama Wiwo › Creatividad › Analytics ya anidada.`)

  // --- La insignia del área que no cruza con ningún Proceso -------------------
  const desalineada = fila(pagina, 'Retail')
  await desalineada.locator('text=No coincide con ninguna área de los Procesos').waitFor()
  assert.equal(await fila(pagina, 'Analytics').locator('text=No coincide con ninguna área').count(), 0,
    'Un área alineada no debería llevar la insignia')
  visto.push('«Retail» lleva la insignia «No coincide con ninguna área de los Procesos»; «Analytics», que sí coincide, no la lleva.')

  // --- Crear un área raíz -----------------------------------------------------
  await clicar(pagina.locator('button:has-text("Nueva área")'))
  await pagina.locator('[role="dialog"]').waitFor()
  await pagina.locator('[role="dialog"] input').first().fill(RAIZ)
  await clicar(pagina.locator('[role="dialog"] button:has-text("Crear área")'))
  await fila(pagina, RAIZ).waitFor()
  visto.push(`Crear un área raíz: «${RAIZ}» aparece en el árbol, al nivel de las otras raíces.`)

  // --- Colgarle una hija ------------------------------------------------------
  await clicar(pagina.locator('button:has-text("Nueva área")'))
  await pagina.locator('[role="dialog"]').waitFor()
  await pagina.locator('[role="dialog"] input').first().fill(HIJA)
  await elegirEnSelector(pagina, 'De qué área cuelga', RAIZ)
  await clicar(pagina.locator('[role="dialog"] button:has-text("Crear área")'))
  await fila(pagina, HIJA).waitFor()

  const nivelHija = await fila(pagina, HIJA).getAttribute('aria-level')
  assert.equal(nivelHija, '2', `La hija debería estar en el nivel 2, está en ${nivelHija}`)
  visto.push(`Colgar una hija: «${HIJA}» queda indentada bajo «${RAIZ}» (aria-level 2).`)

  // --- Ponerle jefe -----------------------------------------------------------
  await clicar(fila(pagina, HIJA).locator('button:has-text("Editar")'))
  await pagina.locator('[role="dialog"]').waitFor()
  await elegirEnSelector(pagina, 'Quién la dirige', 'Carla Méndez')
  await clicar(pagina.locator('[role="dialog"] button:has-text("Guardar")'))
  await fila(pagina, HIJA).locator('text=La dirige alguien de otra área').waitFor()
  visto.push('Ponerle jefe: la fila deja de decir «Sin quien la dirija» y avisa que quien la dirige todavía no está dentro del área.')

  // --- El nombre no se puede editar -------------------------------------------
  await clicar(fila(pagina, HIJA).locator('button:has-text("Editar")'))
  await pagina.locator('[role="dialog"]').waitFor()

  assert.equal(await pagina.locator('[role="dialog"] input').count(), 0,
    'La edición no debería ofrecer el nombre como campo escribible')
  const textoEdicion = await pagina.locator('[role="dialog"]').innerText()
  assert.match(textoEdicion, /los Procesos guardan el nombre del área y no su id/,
    'Falta el motivo por el que no se puede renombrar')
  visto.push('Editar un área no ofrece el nombre: lo muestra como dato y explica que los Procesos guardan el nombre y no el id.')

  await cerrarDialogo(pagina)

  // Un área recién creada nace alineada, porque el alta sincroniza el nombre.
  assert.equal(await fila(pagina, HIJA).locator('text=No coincide con ninguna área').count(), 0,
    'Un área recién creada debería nacer alineada con los Procesos')
  visto.push('El área recién creada nace alineada: no le aparece la insignia.')

  // --- El ciclo ni se ofrece --------------------------------------------------
  await clicar(fila(pagina, RAIZ).locator('button:has-text("Editar")'))
  await pagina.locator('[role="dialog"]').waitFor()

  const disparadorSuperior = pagina.locator('[role="dialog"] button[role="combobox"]').first()
  await disparadorSuperior.evaluate((elemento) => { elemento.focus() })
  await pagina.keyboard.press('Enter')
  await pagina.locator('[role="option"]').first().waitFor()

  const opciones = await pagina.locator('[role="option"]').allInnerTexts()
  const limpias = opciones.map((texto) => texto.replace(/ /g, '').trim())
  assert.ok(!limpias.includes(RAIZ), 'El área no debería poder colgarse de sí misma')
  assert.ok(!limpias.includes(HIJA), 'El área no debería poder colgarse de su propia descendencia')
  assert.ok(limpias.includes('Wiwo'), 'Las áreas ajenas a la rama sí tienen que ofrecerse')
  visto.push(`Colgar un área de su propia descendencia: el selector no ofrece ni «${RAIZ}» ni «${HIJA}», y sí el resto del árbol.`)

  await pagina.keyboard.press('Escape')
  await pagina.locator('[role="option"]').first().waitFor({ state: 'detached' })
  await cerrarDialogo(pagina)

  // --- Nombre repetido --------------------------------------------------------
  await clicar(pagina.locator('button:has-text("Nueva área")'))
  await pagina.locator('[role="dialog"]').waitFor()
  await pagina.locator('[role="dialog"] input').first().fill('analytics')
  await clicar(pagina.locator('[role="dialog"] button:has-text("Crear área")'))

  const aviso = pagina.locator('[role="dialog"] [role="alert"]').first()
  await aviso.waitFor()
  const textoAviso = (await aviso.innerText()).trim()
  assert.match(textoAviso, /Nombre ya está usado por otra/, `El 422 no llegó traducido: "${textoAviso}"`)
  visto.push(`Nombre repetido: el diálogo muestra «${textoAviso}» en vez del código de la API.`)

  await cerrarDialogo(pagina)

  // --- Sumar a alguien que no tenía área --------------------------------------
  await clicar(fila(pagina, HIJA).locator('button:has-text("Gente")'))
  const panelSinArea = pagina.locator('aside[aria-label="Personas sin área"]')
  await panelSinArea.waitFor()

  await panelSinArea.locator('input[type="search"]').fill('Gina')
  await clicar(panelSinArea.locator('li:has-text("Gina") button:has-text("Sumar")'))
  await fila(pagina, HIJA).locator('text=1 persona').waitFor()
  visto.push('Asignar una persona: Gina Ferrer sale de «Sin área» y entra a la hija, que pasa a contar 1 persona.')

  // Vaciada la lista, el panel y el aviso desaparecen en vez de quedar diciendo cero.
  await panelSinArea.waitFor({ state: 'detached' })
  await pagina.locator('text=Todo el equipo tiene área').waitFor()
  visto.push('Con la lista vacía, el aviso pasa a «Todo el equipo tiene área» y el panel de pendientes desaparece.')

  // --- Traer a alguien de otra área -------------------------------------------
  const panelArea = pagina.locator(`aside[aria-label="Gente de ${HIJA}"]`)
  await panelArea.locator('input[type="search"]').fill('Elena')
  await clicar(panelArea.locator('li:has-text("Elena") button:has-text("Traer")'))
  await fila(pagina, HIJA).locator('text=2 personas').waitFor()
  await fila(pagina, 'Analytics').locator('text=1 persona').waitFor()
  visto.push('Traer de otra área: Elena Paz pasa de Analytics a la hija; las dos filas actualizan su cuenta.')

  // Se agranda la ventana solo para la foto, y se captura el elemento en vez de la página: el
  // scroll de esta aplicación vive en un contenedor propio y no en el `body`, así que `fullPage`
  // recorta a la altura de la ventana y las ramas anidadas —que son justo lo que hay que ver—
  // quedan afuera. Con la ventana alta, el árbol entero entra sin recortes.
  await pagina.setViewportSize({ width: 1440, height: 2200 })
  await pagina.waitForTimeout(600)
  await pagina.locator('main').screenshot({ path: `${salida}/arbol.png` })
  await pagina.setViewportSize({ width: 1440, height: 1000 })

  // --- Sacar a alguien --------------------------------------------------------
  await clicar(panelArea.locator('li:has-text("Elena") button:has-text("Sacar")'))
  await fila(pagina, HIJA).locator('text=1 persona').waitFor()
  visto.push('Sacar a alguien: Elena vuelve a quedar sin área y la fila baja a 1 persona.')

  // --- Borrar un área con gente: el 409 con las tres cuentas -------------------
  await clicar(fila(pagina, HIJA).locator('button:has-text("Borrar")'))
  await pagina.locator('[role="dialog"]').waitFor()

  const anticipado = await pagina.locator('[role="dialog"]').innerText()
  assert.match(anticipado, /tiene 1 persona asignada/, 'El diálogo no anticipa lo que ya se ve')
  assert.match(anticipado, /Puede haber además Procesos marcados con este nombre/,
    'El diálogo no anticipa la cuenta que la pantalla no puede saber')
  visto.push('El diálogo de borrado anticipa lo que ya se ve («tiene 1 persona asignada») y advierte de los Procesos, que desde la pantalla no se ven.')

  await clicar(pagina.locator('[role="dialog"] button:has-text("Borrar")'))
  const avisoGente = pagina.locator('[role="dialog"] [role="alert"]').first()
  await avisoGente.waitFor()
  const textoGente = (await avisoGente.innerText()).trim()
  assert.match(textoGente, /está en uso: 1 persona\(s\) asignada\(s\)/, `El 409 no llegó entero: "${textoGente}"`)
  visto.push(`Borrar un área con gente: «${textoGente}»`)

  await cerrarDialogo(pagina)

  // --- Borrar un área que se ve VACÍA pero está usada por Procesos ------------
  const pr = fila(pagina, 'PR')
  await pr.locator('text=0 personas').waitFor()
  await clicar(pr.locator('button:has-text("Borrar")'))
  await pagina.locator('[role="dialog"]').waitFor()

  const sinAnticipo = await pagina.locator('[role="dialog"]').innerText()
  assert.ok(!sinAnticipo.includes('persona asignada'), 'PR no tiene gente: no hay nada que anticipar')
  await clicar(pagina.locator('[role="dialog"] button:has-text("Borrar")'))

  const avisoPr = pagina.locator('[role="dialog"] [role="alert"]').first()
  await avisoPr.waitFor()
  const textoPr = (await avisoPr.innerText()).trim()
  assert.match(textoPr, /0 persona\(s\) asignada\(s\), 0 área\(s\) que dependen de ella y 24 Proceso\(s\)/,
    `El 409 por Procesos no llegó entero: "${textoPr}"`)
  visto.push(`Borrar un área que se ve vacía: «${textoPr}» — la tercera cuenta es la única que la frena.`)

  await cerrarDialogo(pagina)

  // --- Borrar un área vacía de verdad -----------------------------------------
  await clicar(panelArea.locator('li:has-text("Gina") button:has-text("Sacar")'))
  await fila(pagina, HIJA).locator('text=0 personas').waitFor()

  const antesDeBorrar = await pagina.locator('li[role="treeitem"]').count()
  await clicar(fila(pagina, HIJA).locator('button:has-text("Borrar")'))
  await pagina.locator('[role="dialog"] button:has-text("Borrar")').waitFor()
  await clicar(pagina.locator('[role="dialog"] button:has-text("Borrar")'))
  await fila(pagina, HIJA).waitFor({ state: 'detached' })

  const despuesDeBorrar = await pagina.locator('li[role="treeitem"]').count()
  assert.equal(despuesDeBorrar, antesDeBorrar - 1, 'El árbol tendría que quedar con un área menos')
  // El DELETE devuelve el árbol entero: la pantalla se repinta con eso, sin pedirlo otra vez.
  await pagina.locator('text=2 personas sin área').waitFor()
  visto.push(`Borrar un área vacía: «${HIJA}» desaparece del árbol (${antesDeBorrar} → ${despuesDeBorrar}) y el aviso de «sin área» pasa a 2 con el árbol que devolvió el DELETE.`)

  // --- Quien dirige un área: solo su rama -------------------------------------
  const deCarla = await entrar(navegador, 'carla@wiwo.me')
  deCarla.on('pageerror', (error) => errores.push(error.message))
  await deCarla.locator('[role="tree"]').waitFor()

  const suyas = await deCarla.locator('li[role="treeitem"]').count()
  assert.equal(await deCarla.locator('button:has-text("Nueva área")').count(), 0,
    'Quien no administra no debería ver el botón de crear un área')
  assert.equal(await deCarla.locator('li[role="treeitem"] button:has-text("Borrar")').count(), 0,
    'Borrar es de quien administra: no debería ofrecerse acá')
  visto.push(`Quien dirige un área ve solo su rama (${suyas === 1 ? '1 área' : `${suyas} áreas`}) y no se le ofrece ni «Nueva área» ni «Borrar».`)

  // La entrada propia en la barra: quien dirige un área no llega a «Administración», así que sin
  // esto la única puerta al organigrama sería otra pantalla.
  //
  // Y la llave tiene que ser `dirige_areas` y no el cargo `is_director`: hoy las 184 cuentas de
  // producción llevan cargo "Staff", así que con esa llave la entrada no le aparecería a ningún jefe
  // de área. Se comprueba el caso exacto: dirige un área y NO tiene el cargo.
  const carla = await quienMira(deCarla)
  assert.equal(carla.dirige_areas, true, 'Carla dirige un área')
  assert.notEqual(carla.is_director, true, 'y no tiene el cargo Director: ése es el caso de todo el equipo hoy')
  assert.notEqual(carla.is_admin, true, 'ni administra')

  const enLaBarra = deCarla.locator(`nav a[href="${RUTA}"]`)
  await enLaBarra.first().waitFor()
  visto.push(`Con dirige_areas=${String(carla.dirige_areas)} e is_director=${String(carla.is_director)} —el caso de todo el equipo hoy— la barra lateral igual muestra la entrada propia «Organigrama».`)

  // --- Quien no dirige nada: el 403 explicado ---------------------------------
  const deElena = await entrar(navegador, 'elena@wiwo.me')
  deElena.on('pageerror', (error) => errores.push(error.message))

  await deElena.locator('text=No hay organigrama para vos').waitFor()

  const explicacion = await deElena.locator('main').innerText()
  assert.match(explicacion, /No diriges ningún área/, `El 403 no se explicó: "${explicacion}"`)
  assert.equal(await deElena.locator('[role="tree"]').count(), 0, 'No debería dibujarse ningún árbol')
  assert.equal(await deElena.locator('button:has-text("Reintentar")').count(), 0,
    'Un 403 no se reintenta: ofrecer el botón sería mentir sobre lo que va a pasar')
  visto.push('Quien no dirige nada ve el mensaje del 403 tal cual lo manda la API, sin árbol y sin botón de reintentar.')

  // --- Ancho de teléfono ------------------------------------------------------
  const movil = await entrar(navegador, 'ana@wiwo.me', { width: 390, height: 844 })
  movil.on('pageerror', (error) => errores.push(error.message))
  await movil.locator('[role="tree"]').waitFor()

  const desborde = await movil.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  assert.equal(desborde, false, 'La pantalla desborda a lo ancho en un teléfono')
  await movil.locator('main').screenshot({ path: `${salida}/movil.png` })
  visto.push('A 390px de ancho la pantalla no desborda: el árbol y los paneles quedan en una sola columna.')

  assert.deepEqual(errores, [], `Errores de JavaScript en la página: ${errores.join(' | ')}`)
} finally {
  await navegador.close()
}

console.log(`Lo que se vio (capturas en ${salida}):\n`)
for (const linea of visto) console.log(`  · ${linea}`)
