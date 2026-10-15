import assert from 'node:assert/strict'
import { chromium } from 'playwright'

/**
 * Recorre los comentarios en línea del Meeting Paper (fase 10) con el editor de siempre: comentar un
 * fragmento, que la marca viaje en el HTML guardado, responder, resolver, reabrir y borrar.
 *
 * Requiere, todo local:
 *   - `MOCK_EN_VIVO=1 pnpm mock` (el mock con el maestro de «en vivo» y los comentarios encendidos),
 *   - `pnpm dev` con `NEXT_PUBLIC_EN_VIVO_URL` puesta (no hace falta el servicio: el sondeo basta).
 * `COMENTARIOS_TEST_URL` cambia el origen del panel (por defecto http://localhost:3010);
 * `COMENTARIOS_TEST_CAPTURAS` es una carpeta donde guardar capturas de pantalla.
 *
 * La edición conjunta no se recorre aquí: necesita el servicio. Su parte de comentarios es la misma
 * marca y el mismo panel, y la marca se prueba contra el esquema del servicio en
 * `pruebas/en-vivo-marca-comentario.test.js`.
 *
 * Los clics van por `evaluate` y no con `locator.click()`, que en este entorno se cuelga.
 */
const destino = new URL(process.env.COMENTARIOS_TEST_URL ?? 'http://localhost:3010')
const capturas = process.env.COMENTARIOS_TEST_CAPTURAS ?? ''
const ESPERA_MS = 15000

assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo admite un servidor local.')

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })

/** Espera a que se cumpla una condición dentro de la página. */
async function esperar (pagina, condicion, arg = null) {
  await pagina.waitForFunction(condicion, arg, { timeout: ESPERA_MS })
}

/** Clic por `evaluate` sobre el primer botón del `ambito` cuyo texto es exactamente `texto`. */
async function clicPorTexto (pagina, texto, ambito = 'body') {
  const encontrado = await pagina.evaluate(({ buscado, css }) => {
    const raiz = css === 'body' ? document.body : [...document.querySelectorAll(css)].at(-1)
    const objetivo = [...(raiz?.querySelectorAll('button, [role="menuitem"]') ?? [])]
      .find((n) => (n.textContent ?? '').trim() === buscado && !n.disabled)

    if (objetivo === undefined) return false
    objetivo.click()

    return true
  }, { buscado: texto, css: ambito })

  assert.ok(encontrado, `No se encontró nada que diga "${texto}" en ${ambito}`)
}

/** Escribe en un campo de texto controlado por React. */
async function escribir (pagina, etiqueta, texto) {
  await pagina.evaluate(({ nombre, valor }) => {
    const campo = document.querySelector(`textarea[aria-label="${nombre}"]`)
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set

    setter?.call(campo, valor)
    campo?.dispatchEvent(new Event('input', { bubbles: true }))
  }, { nombre: etiqueta, valor: texto })
}

/** El panel de comentarios es el último diálogo de la página con su descripción. */
const PANEL = '[role="dialog"]'

async function textoDelPanel (pagina) {
  return await pagina.evaluate((css) => {
    const panel = [...document.querySelectorAll(css)].find((d) => (d.textContent ?? '').includes('Conversaciones sobre fragmentos'))

    return panel?.textContent ?? null
  }, PANEL)
}

async function capturar (pagina, nombre) {
  if (capturas !== '') await pagina.screenshot({ path: `${capturas}/${nombre}.png` })
}

let pagina = null

try {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 1000 } })
  const sesion = await contexto.request.post(new URL('/api/sesion', destino).href, {
    data: { email: 'ana@wiwo.me', password: 'mock1234' }
  })

  assert.equal(sesion.status(), 200, 'No se pudo iniciar sesión en el mock')

  const ajustes = await (await contexto.request.get(new URL('/api/bff/settings', destino).href)).json()

  assert.equal(ajustes.data.editable.wiwo_acta_comentarios.value, '1', 'El mock no tiene los comentarios encendidos (MOCK_EN_VIVO=1)')

  const actas = await (await contexto.request.get(new URL('/api/bff/projects/1/actas', destino).href)).json()
  const acta = actas.data[0]

  assert.ok(acta, 'El mock no trae ningún Meeting Paper en el Espacio 1')

  pagina = await contexto.newPage()

  await pagina.goto(new URL(`/proyectos/1?tab=actas&acta=${acta.id}`, destino).href, { waitUntil: 'networkidle' })

  // --- Con comentarios encendidos aparece «Comentarios», sin contador mientras no haya hilos.
  await esperar(pagina, () => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Comentarios'))

  // --- Corregir con el editor de siempre y comentar un fragmento.
  await clicPorTexto(pagina, 'Corregir')
  await esperar(pagina, () => document.querySelector('.ProseMirror') !== null)

  const sinSeleccion = await pagina.evaluate(() => document.querySelector('button[aria-label="Comentar el fragmento seleccionado"]')?.disabled)

  assert.equal(sinSeleccion, true, '«Comentar» tiene que estar apagado sin selección')

  // Se elige con el propio editor (TipTap lo deja en `.ProseMirror.editor`): ProseMirror solo lee la
  // selección del documento con el foco puesto, y este entorno no se lo da a `evaluate`.
  await pagina.evaluate(() => {
    document.querySelector('.ProseMirror')?.editor.chain().focus().setTextSelection({ from: 1, to: 13 }).run()
  })
  await esperar(pagina, () => document.querySelector('button[aria-label="Comentar el fragmento seleccionado"]')?.disabled === false)
  await pagina.evaluate(() => { document.querySelector('button[aria-label="Comentar el fragmento seleccionado"]')?.click() })

  await pagina.waitForSelector('textarea[aria-label="Comentario"]', { timeout: ESPERA_MS })
  await esperar(pagina, () => document.querySelector('.ProseMirror span[data-hilo]') !== null)

  const ancla = await pagina.evaluate(() => document.querySelector('.ProseMirror span[data-hilo]')?.getAttribute('data-hilo'))

  assert.match(ancla ?? '', /^[A-Za-z0-9_-]{1,64}$/, 'La ancla no cumple el patrón del board')
  await capturar(pagina, '1-comentario-nuevo')

  // --- Enviar vacío no llega al board; con texto sí.
  await clicPorTexto(pagina, 'Comentar', PANEL)
  await esperar(pagina, () => document.body.textContent?.includes('Escribe un comentario.') === true)
  await escribir(pagina, 'Comentario', 'Confirmar este dato antes de enviarlo.')
  await clicPorTexto(pagina, 'Comentar', PANEL)
  await esperar(pagina, () => document.querySelector('[role="dialog"] article') !== null)

  assert.ok((await textoDelPanel(pagina))?.includes('Confirmar este dato antes de enviarlo.'))
  await capturar(pagina, '2-hilo-creado')

  // --- Responder.
  await clicPorTexto(pagina, 'Responder', PANEL)
  await escribir(pagina, 'Respuesta', 'Listo, lo confirmé.')
  await clicPorTexto(pagina, 'Responder', PANEL)
  await esperar(pagina, () => document.querySelectorAll('[role="dialog"] article li').length === 2)

  // --- Resolver y reabrir.
  await clicPorTexto(pagina, 'Resolver', PANEL)
  await esperar(pagina, () => document.body.textContent?.includes('Resueltos (1)') === true)
  await capturar(pagina, '3-resuelto')
  await pagina.evaluate(() => { document.querySelector('[role="dialog"] details summary')?.click() })
  await clicPorTexto(pagina, 'Reabrir', PANEL)
  await esperar(pagina, () => document.body.textContent?.includes('Resueltos (') !== true)

  // --- Cerrar el panel y guardar: la marca viaja en el HTML del acta.
  await pagina.keyboard.press('Escape')
  await esperar(pagina, () => ![...document.querySelectorAll('[role="dialog"]')].some((d) => (d.textContent ?? '').includes('Conversaciones sobre')))
  await clicPorTexto(pagina, 'Guardar')
  await esperar(pagina, () => ![...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Guardar'))

  const guardada = await (await contexto.request.get(new URL(`/api/bff/projects/1/actas/${acta.id}`, destino).href)).json()

  assert.ok(guardada.data.content.includes(`data-hilo="${ancla}"`), 'La marca no quedó en el HTML guardado')

  // --- Con el acta cerrada el hilo sigue ahí y cita el texto comentado, sin editor.
  await pagina.reload({ waitUntil: 'networkidle' })
  await esperar(pagina, () => [...document.querySelectorAll('button')].some((b) => (b.textContent ?? '').startsWith('Comentarios')))
  await pagina.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').startsWith('Comentarios'))?.click()
  })
  await esperar(pagina, () => document.querySelector('[role="dialog"] blockquote') !== null)

  const cita = await pagina.evaluate(() => document.querySelector('[role="dialog"] blockquote')?.textContent ?? '')

  assert.ok(cita.length > 3 && !cita.includes('ya no está'), `La cita no se leyó del acta: ${cita}`)
  await capturar(pagina, '4-lectura')

  // --- Borrar la raíz se lleva el hilo.
  // El menú ⋯ de Radix se abre con `pointerdown`, que `click()` no emite: va con el ratón de verdad.
  const caja = await pagina.evaluate(() => {
    const { x, y, width, height } = document.querySelector('[role="dialog"] article button[aria-label^="Acciones del comentario"]').getBoundingClientRect()

    return { x: x + width / 2, y: y + height / 2 }
  })

  await pagina.mouse.click(caja.x, caja.y)
  await esperar(pagina, () => [...document.querySelectorAll('[role="menuitem"]')].some((i) => (i.textContent ?? '').includes('Eliminar')))
  await pagina.evaluate(() => {
    [...document.querySelectorAll('[role="menuitem"]')].find((i) => (i.textContent ?? '').includes('Eliminar'))?.click()
  })
  await esperar(pagina, () => document.body.textContent?.includes('Se elimina el comentario y sus respuestas.') === true)
  await clicPorTexto(pagina, 'Eliminar', PANEL)
  await esperar(pagina, () => document.body.textContent?.includes('Todavía no hay comentarios') === true)

  console.log('comentarios en línea del Meeting Paper: bien')
} catch (fallo) {
  // Con las capturas pedidas, un fallo deja una foto de cómo quedó la pantalla.
  if (pagina !== null) await capturar(pagina, 'fallo')

  throw fallo
} finally {
  await navegador.close()
}
