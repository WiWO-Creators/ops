import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { setTimeout as esperar } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { CONTACTOS, STAFF } from '../mock/datos.js'
import {
  PERFILES, contarBloqueados, contarRsc, emularRed, instalarSonda, interceptarBff, medirClic, nombrarBloqueados
} from './apoyo/red-lenta.mjs'

/**
 * Banco de pruebas de red lenta: recorre un modulo con una red mala y mide lo que la persona sentiria.
 *
 * Se corre a mano contra Next (build + start, nunca `next dev`: ahi la pagina no hidrata y los clics no
 * responden) y la API mock, como el resto de los `.browser.mjs`:
 *
 * ```bash
 * PORT=4021 node mock/servidor.js
 * API_BASE=http://localhost:4021/api/v1 SESION_CLAVE=<64 hex> pnpm build && pnpm exec next start -p 3121
 * TAREA_TEST_URL=http://localhost:3121 node pruebas/red-lenta.browser.mjs --modulo tareas
 * ```
 *
 * Opciones: `--modulo tareas|proyectos|tickets|portal`, `--perfil 3g-lento|rtt-2s|ninguno`,
 * `--escenarios abrir,estado,crear,tablero,filtrar`, `--retardo-escritura <ms>` y `--guardar-base`
 * (escribe `pruebas/red-lenta.base.json`; sin la opcion, la corrida se compara con esa base).
 * Variables: `TAREA_TEST_URL` (origen de Next), `TAREA_TEST_EMAIL`/`TAREA_TEST_PASSWORD` (por defecto
 * la primera cuenta del mock; en el portal, la primera contacta), `TAREA_TEST_STORAGE_STATE`,
 * `PLAYWRIGHT_CHROMIUM_EXECUTABLE` y `NEXT_PUBLIC_TIEMPO_ESCRITURA_MS` (el limite con el que se
 * construyo la app; el retardo por defecto lo supera en 3 s).
 *
 * Cada escenario imprime una linea JSON con su resumen. Solo FALLA en aserciones de seguridad: un
 * control que queda colgado mas alla del limite, la escritura incierta sin aviso o el contenido que
 * nunca llega. Los numeros (tiempos, escrituras duplicadas, clics sin respuesta visual) son medidas
 * para comparar contra la base, no condiciones. El mock vive en memoria: las tareas que crea el
 * escenario `crear` desaparecen al reiniciarlo.
 */

const RAIZ_BASE = new URL('./red-lenta.base.json', import.meta.url)
/** Un clic sin cambio visible en este tiempo se cuenta como "no registrado". */
const LIMITE_RESPUESTA_VISUAL_MS = 100
/** Tiempo maximo para que aparezca el primer contenido de una apertura, antes de dar la prueba por colgada. */
const LIMITE_CONTENIDO_MS = 90_000
/** Holgura despues del limite de escritura para que el aviso y el desbloqueo lleguen. */
const HOLGURA_MS = 6_000
/** Tiempo extra que se tolera para que la pantalla se recargue tras un fallo con la red lenta. */
const LIMITE_RECARGA_MS = 30_000
const LIMITE_ESCRITURA_MS = Number(process.env.NEXT_PUBLIC_TIEMPO_ESCRITURA_MS) > 0
  ? Number(process.env.NEXT_PUBLIC_TIEMPO_ESCRITURA_MS)
  : 20_000
const RUTA_CREAR_TAREA = /\/tasks$/

const { values: opciones } = parseArgs({
  options: {
    modulo: { type: 'string', default: 'tareas' },
    perfil: { type: 'string', default: '3g-lento' },
    escenarios: { type: 'string', default: 'abrir,estado,crear,tablero,filtrar' },
    'retardo-escritura': { type: 'string', default: String(LIMITE_ESCRITURA_MS + 3000) },
    'guardar-base': { type: 'boolean', default: false }
  }
})

/**
 * Descripcion de cada modulo: por donde se entra y que control hace cada cosa. Un escenario sin
 * entrada aqui se informa como omitido, con el motivo; no cuenta como fallo.
 */
const MODULOS = {
  tareas: {
    sesion: 'staff',
    lista: '/tareas',
    abrir: { enlace: 'tbody a[href^="?tarea="]:visible', destino: 'modal' },
    estado: { menu: 'tbody button[aria-label="Acciones"]', opcion: 'Marcar completado', aviso: true },
    crear: { boton: 'Nueva tarea' },
    tablero: { url: '/tareas/tablero', destino: 'En proceso', aviso: true },
    filtrar: { buscador: 'Buscar tareas', primero: 'Migrar', segundo: 'Maquetar' }
  },
  proyectos: {
    sesion: 'staff',
    lista: '/proyectos',
    abrir: { enlace: 'main a[href^="/proyectos/"]:not([href*="plantillas"]):not([href*="solicitudes"]):visible', destino: 'ruta' },
    estado: { omitido: 'la lista de proyectos no cambia el estado desde la tabla' },
    crear: { omitido: 'el alta de proyecto es un asistente largo; se cubre en tareas' },
    tablero: { omitido: 'la lista de proyectos no tiene tablero de movimientos' },
    filtrar: { buscador: 'Buscar proyectos', primero: 'Portal', segundo: 'Integración' }
  },
  tickets: {
    sesion: 'staff',
    lista: '/tickets',
    abrir: { enlace: 'a[href^="?ticket="]:visible', destino: 'modal' },
    estado: { omitido: 'el estado del ticket se cambia dentro de su ficha, no desde la tabla' },
    crear: { omitido: 'el alta de tickets es del portal' },
    tablero: { omitido: 'la bandeja de tickets no tiene movimiento por columnas' },
    filtrar: { buscador: 'Buscar tickets', primero: 'formulario', segundo: 'logo' }
  },
  portal: {
    sesion: 'contacto',
    lista: '/portal/proyectos',
    abrir: { enlace: 'main a[href^="/portal/proyectos/"]:visible', destino: 'ruta' },
    estado: { omitido: 'el portal no cambia estados' },
    crear: { omitido: 'el alta de solicitud del portal queda para la oleada del portal' },
    tablero: { omitido: 'el portal no mueve tarjetas' },
    filtrar: { buscador: 'Buscar proyectos…', primero: 'Panel', segundo: 'Rediseño' }
  }
}

const modulo = MODULOS[opciones.modulo]
assert.ok(modulo, `Modulo desconocido: ${opciones.modulo}. Usa ${Object.keys(MODULOS).join(', ')}.`)
assert.ok(opciones.perfil in PERFILES, `Perfil desconocido: ${opciones.perfil}. Usa ${Object.keys(PERFILES).join(', ')}.`)
const retardoEscritura = Number(opciones['retardo-escritura'])
assert.ok(Number.isInteger(retardoEscritura) && retardoEscritura > 0, '--retardo-escritura debe ser un entero positivo de milisegundos.')
const destino = new URL(process.env.TAREA_TEST_URL ?? 'http://localhost:3106')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo admite un servidor local.')

/**
 * Credenciales de la sesion que pide el modulo.
 *
 * @returns {{ email: string, password: string, portal?: boolean }}
 */
function credenciales () {
  const propias = process.env.TAREA_TEST_EMAIL && process.env.TAREA_TEST_PASSWORD
    ? { email: process.env.TAREA_TEST_EMAIL, password: process.env.TAREA_TEST_PASSWORD }
    : null
  if (modulo.sesion === 'contacto') return { ...(propias ?? { email: CONTACTOS[0].email, password: CONTACTOS[0].password }), portal: true }

  return propias ?? { email: STAFF[0].email, password: STAFF[0].password }
}

let primeraCarga = true

/**
 * Cierra los dialogos que la app abre sola al entrar (apertura de jornada, novedades).
 *
 * Aparecen unos segundos despues de cargar, asi que se espera antes de buscarlos; si quedara uno
 * encima, cualquier clic del escenario fallaria por "intercepta los eventos del puntero". La app
 * recuerda por el dia que se cerro (`localStorage`), asi que solo la primera pagina de la sesion
 * espera de verdad.
 *
 * @param {import('playwright').Page} pagina pagina recien cargada
 * @returns {Promise<void>}
 */
async function cerrarDialogos (pagina) {
  const abiertos = pagina.locator('[role="dialog"], div.fixed[data-state="open"]')
  await abiertos.first().waitFor({ timeout: primeraCarga ? 8000 : 1500 }).catch(() => undefined)
  primeraCarga = false
  for (let intento = 0; intento < 5 && await abiertos.count() > 0; intento++) {
    await pagina.keyboard.press('Escape')
    await pagina.waitForTimeout(600)
  }
}

/**
 * Abre una pagina limpia del modulo, sin red emulada, con el dialogo de bienvenida cerrado.
 * La carga inicial va sin emulacion para no esperar minutos: lo que se mide es lo que sigue.
 *
 * @param {import('playwright').BrowserContext} contexto contexto con la sesion iniciada
 * @param {string} ruta ruta de la pantalla
 * @returns {Promise<{ pagina: import('playwright').Page, red: object, rsc: object }>}
 */
async function prepararPagina (contexto, ruta) {
  const pagina = await contexto.newPage()
  pagina.setDefaultTimeout(30_000)
  const red = await emularRed(pagina, opciones.perfil)
  const rsc = contarRsc(pagina)
  await pagina.goto(new URL(ruta, destino).href, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await pagina.waitForLoadState('networkidle')
  await cerrarDialogos(pagina)

  return { pagina, red, rsc }
}

/**
 * Anota un clic medido: cuanto tardo la pantalla en responder.
 *
 * @param {Array<{ nombre: string, respuestaMs: number | null }>} clics acumulador del escenario
 * @param {string} nombre que se pulso
 * @param {import('playwright').Page} pagina pagina con la sonda
 * @param {() => Promise<unknown>} accion interaccion
 * @returns {Promise<void>}
 */
async function clicMedido (clics, nombre, pagina, accion) {
  clics.push({ nombre, respuestaMs: await medirClic(pagina, accion) })
}

/**
 * Cuenta los clics que no tuvieron respuesta visual dentro del limite.
 *
 * @param {Array<{ respuestaMs: number | null }>} clics clics medidos
 * @returns {number}
 */
function sinRespuesta (clics) {
  return clics.filter((c) => c.respuestaMs === null || c.respuestaMs > LIMITE_RESPUESTA_VISUAL_MS).length
}

/**
 * Datos comunes de cierre de un escenario.
 *
 * @param {object} bff interceptor del BFF
 * @param {object} rsc contador de `_rsc`
 * @param {Array<{ nombre: string, respuestaMs: number | null }>} clics clics medidos
 * @returns {object}
 */
function cierre (bff, rsc, clics) {
  const escrituras = bff.escrituras()

  return {
    escrituras: escrituras.length,
    postsTotales: escrituras.filter((p) => p.metodo === 'POST').length,
    duplicadas: bff.duplicadas(),
    rsc: rsc.lista().length,
    rscRutas: rsc.lista(),
    clics,
    clicsSinRespuesta100ms: sinRespuesta(clics)
  }
}

/**
 * Abrir un elemento desde la lista: tiempo al primer contenido de su detalle y peticiones `_rsc`.
 *
 * @param {import('playwright').BrowserContext} contexto sesion iniciada
 * @param {object} bff interceptor del BFF
 * @returns {Promise<object>}
 * @throws {AssertionError} si el contenido no llega dentro del limite
 */
async function abrir (contexto, bff) {
  const { pagina, red, rsc } = await prepararPagina(contexto, modulo.lista)
  const clics = []
  try {
    const enlace = pagina.locator(modulo.abrir.enlace).first()
    const nombre = (await enlace.innerText()).split('\n')[0].trim()
    bff.establecer([])
    bff.reiniciar()
    rsc.reiniciar()
    await red.encender()

    const inicio = performance.now()
    await clicMedido(clics, `abrir ${nombre}`, pagina, async () => { await enlace.click({ noWaitAfter: true }) })
    const contenido = modulo.abrir.destino === 'modal'
      ? pagina.getByRole('dialog').getByText(nombre).first()
      : pagina.getByRole('heading', { name: nombre }).first()
    const llego = await contenido.waitFor({ timeout: LIMITE_CONTENIDO_MS }).then(() => true, () => false)
    const primerContenidoMs = llego ? Math.round(performance.now() - inicio) : null
    await pagina.waitForTimeout(2000)
    await red.apagar()

    assert.ok(llego, `El contenido de "${nombre}" no llego en ${LIMITE_CONTENIDO_MS} ms.`)

    return {
      primerContenidoMs,
      lecturasBff: bff.contar({ metodo: 'GET' }),
      ...cierre(bff, rsc, clics)
    }
  } finally {
    await pagina.close()
  }
}

/**
 * Sigue una escritura retenida hasta que la pantalla se desbloquea y, si se exige, aparece el aviso.
 *
 * "Colgado" es no desbloquearse dentro del limite (el de escritura mas la holgura de una recarga
 * lenta), no estar bloqueado un instante: tras un fallo la pantalla puede recargar y bloquearse un
 * rato con la red lenta, y eso es esperable.
 *
 * @param {import('playwright').Page} pagina pagina del escenario
 * @param {string} ambito selector donde buscar controles bloqueados
 * @param {number} antes bloqueados antes de la accion
 * @param {boolean} exigirAviso si la ausencia del aviso es un fallo
 * @returns {Promise<{ avisoMs: number | null, desbloqueoMs: number | null, avisos: string[] }>}
 * @throws {AssertionError} si la pantalla no se desbloquea o falta el aviso exigido
 */
async function verificarEscrituraIncierta (pagina, ambito, antes, exigirAviso) {
  const inicio = performance.now()
  const limite = LIMITE_ESCRITURA_MS + HOLGURA_MS + LIMITE_RECARGA_MS
  let avisoMs = null
  let desbloqueoMs = null

  while (performance.now() - inicio < limite) {
    const transcurrido = Math.round(performance.now() - inicio)
    if (avisoMs === null && await pagina.getByText(/no sabemos si/i).first().isVisible()) avisoMs = transcurrido
    if (desbloqueoMs === null && await contarBloqueados(pagina, ambito) <= antes) desbloqueoMs = transcurrido
    if (desbloqueoMs !== null && (avisoMs !== null || transcurrido >= LIMITE_ESCRITURA_MS + HOLGURA_MS)) break
    await pagina.waitForTimeout(250)
  }
  const avisos = (await pagina.locator('[role="alert"], [role="status"]').allInnerTexts()).map((t) => t.trim()).filter(Boolean)

  assert.ok(
    desbloqueoMs !== null,
    `Siguen controles colgados ${Math.round(limite / 1000)} s despues de la escritura retenida: ${JSON.stringify((await nombrarBloqueados(pagina, ambito)).slice(0, 6))}`
  )
  if (exigirAviso) assert.ok(avisoMs !== null, 'No aparecio el aviso "no sabemos si se guardo" al vencer el limite de escritura.')

  return { avisoMs, desbloqueoMs, avisos }
}

/**
 * Cambiar el estado desde la tabla con la respuesta retenida mas alla del limite de escritura.
 *
 * @param {import('playwright').BrowserContext} contexto sesion iniciada
 * @param {object} bff interceptor del BFF
 * @returns {Promise<object>}
 */
async function estado (contexto, bff) {
  const { pagina, red, rsc } = await prepararPagina(contexto, modulo.lista)
  const clics = []
  try {
    const antes = await contarBloqueados(pagina, 'main')
    bff.establecer([{ metodo: ['POST', 'PATCH', 'PUT'], ruta: /\/tasks\//, modo: { tipo: 'retardo', ms: retardoEscritura } }])
    bff.reiniciar()
    rsc.reiniciar()
    await red.encender()

    await clicMedido(clics, 'abrir menu de acciones', pagina, async () => { await pagina.locator(modulo.estado.menu).first().click() })
    await clicMedido(clics, modulo.estado.opcion, pagina, async () => {
      await pagina.getByRole('menuitem', { name: modulo.estado.opcion }).click()
    })
    const durante = await contarBloqueados(pagina, 'main')
    const verificacion = await verificarEscrituraIncierta(pagina, 'main', antes, modulo.estado.aviso)
    await red.apagar()

    return { retardoMs: retardoEscritura, bloqueadosAntes: antes, bloqueadosDuranteEspera: durante, ...verificacion, ...cierre(bff, rsc, clics) }
  } finally {
    bff.establecer([])
    await pagina.close()
  }
}

/**
 * Rellena el formulario de nueva tarea con lo minimo obligatorio.
 *
 * @param {import('playwright').Page} pagina pagina con el dialogo abierto
 * @param {string} nombre nombre de la tarea
 * @returns {Promise<void>}
 */
async function llenarNuevaTarea (pagina, nombre) {
  const dialogo = pagina.getByRole('dialog')
  await dialogo.getByLabel(/^Nombre/).fill(nombre)
  // Los enlaces de la lista que queda detras tambien dicen "Rediseño de marca": se excluyen.
  const opcion = pagina.getByText('Rediseño de marca', { exact: true }).and(pagina.locator(':not(a)')).first()
  // El selector de proyectos carga su catalogo al abrirse; si aun no hay opciones se cierra y se reabre.
  for (let intento = 0; intento < 4 && !await opcion.isVisible(); intento++) {
    await dialogo.getByText('Sin proyecto', { exact: true }).click()
    await opcion.waitFor({ timeout: 3000 }).catch(async () => { await pagina.keyboard.press('Escape') })
  }
  await opcion.click()
  await pagina.keyboard.press('Escape')
  await dialogo.getByLabel(/^Fecha de vencimiento/).fill('2027-01-15')
  await dialogo.getByLabel(/^Descripción/).fill('Tarea creada por el banco de red lenta.')
  await dialogo.getByLabel(/^Área/).click()
  await pagina.getByRole('option', { name: 'Diseño', exact: true }).click()
}

/**
 * Crear una tarea cuya respuesta se pierde y reintentar: cuenta los POST y las claves de idempotencia.
 *
 * El primer POST llega al servidor y se procesa; al navegador se le corta la respuesta. Despues la
 * persona vuelve a pulsar "Crear", como haria. Lo que importa es cuantos POST /tasks llegaron y si
 * comparten `Idempotency-Key` (el servidor podria deduplicar) o cada uno trae la suya (duplica).
 *
 * @param {import('playwright').BrowserContext} contexto sesion iniciada
 * @param {object} bff interceptor del BFF
 * @returns {Promise<object>}
 * @throws {AssertionError} si "Crear" queda deshabilitado para siempre tras el fallo
 */
async function crear (contexto, bff) {
  const { pagina, red, rsc } = await prepararPagina(contexto, modulo.lista)
  const clics = []
  try {
    await pagina.getByRole('button', { name: modulo.crear.boton, exact: true }).click()
    const dialogo = pagina.getByRole('dialog')
    await llenarNuevaTarea(pagina, `Banco red lenta ${Date.now()}`)
    const crearBoton = dialogo.getByRole('button', { name: 'Crear', exact: true })
    bff.establecer([{ metodo: 'POST', ruta: RUTA_CREAR_TAREA, veces: 1, modo: { tipo: 'perder-respuesta' } }])
    bff.reiniciar()
    rsc.reiniciar()
    await red.encender()

    await clicMedido(clics, 'Crear (respuesta perdida)', pagina, async () => { await crearBoton.click() })
    const reintentable = await crearBoton.isEnabled({ timeout: 1000 }).catch(() => false)
      || await crearBoton.waitFor({ timeout: LIMITE_ESCRITURA_MS + HOLGURA_MS }).then(() => crearBoton.isEnabled(), () => false)
    assert.ok(reintentable, 'El boton Crear quedo deshabilitado para siempre despues de perder la respuesta.')

    await clicMedido(clics, 'Crear (reintento)', pagina, async () => { await crearBoton.click() })
    await dialogo.waitFor({ state: 'hidden', timeout: LIMITE_ESCRITURA_MS }).catch(() => undefined)
    await pagina.waitForTimeout(1500)
    await red.apagar()

    const posts = bff.detalle({ metodo: 'POST', ruta: RUTA_CREAR_TAREA })

    return {
      postTasks: posts.length,
      claves: posts.map((p) => p.clave),
      clavesIguales: posts.length > 1 && posts.every((p) => p.clave !== null && p.clave === posts[0].clave),
      llegaronAlServidor: posts.filter((p) => p.llegoAlServidor).length,
      ...cierre(bff, rsc, clics)
    }
  } finally {
    bff.establecer([])
    await pagina.close()
  }
}

/**
 * Mover una tarjeta del tablero con la respuesta retenida mas alla del limite de escritura.
 *
 * @param {import('playwright').BrowserContext} contexto sesion iniciada
 * @param {object} bff interceptor del BFF
 * @returns {Promise<object>}
 */
async function tablero (contexto, bff) {
  const { pagina, red, rsc } = await prepararPagina(contexto, modulo.tablero.url)
  const clics = []
  try {
    const antes = await contarBloqueados(pagina, 'main')
    bff.establecer([{ metodo: ['POST', 'PATCH', 'PUT'], ruta: /\/tasks\//, modo: { tipo: 'retardo', ms: retardoEscritura } }])
    bff.reiniciar()
    rsc.reiniciar()
    await red.encender()

    await clicMedido(clics, 'abrir Mover a…', pagina, async () => { await pagina.getByRole('button', { name: 'Mover a…' }).first().click() })
    await clicMedido(clics, `mover a ${modulo.tablero.destino}`, pagina, async () => {
      await pagina.getByRole('menuitem', { name: modulo.tablero.destino, exact: true }).click()
    })
    const durante = await contarBloqueados(pagina, 'main')
    const verificacion = await verificarEscrituraIncierta(pagina, 'main', antes, modulo.tablero.aviso)
    await red.apagar()

    return { retardoMs: retardoEscritura, bloqueadosAntes: antes, bloqueadosDuranteEspera: durante, ...verificacion, ...cierre(bff, rsc, clics) }
  } finally {
    bff.establecer([])
    await pagina.close()
  }
}

/**
 * Identificadores de las filas visibles de la tabla.
 *
 * @param {import('playwright').Page} pagina pagina con la tabla
 * @returns {Promise<string[]>}
 */
async function filasVisibles (pagina) {
  return await pagina.locator('tbody tr, main article').evaluateAll((filas) => filas
    .filter((fila) => fila.getClientRects().length > 0)
    .map((fila) => (fila.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)))
}

/**
 * Espera a que la pantalla de una busqueda se asiente: URL, texto del buscador y filas sin cambios
 * durante varios retardos de lectura seguidos.
 *
 * @param {import('playwright').Page} pagina pagina con el buscador
 * @param {import('playwright').Locator} buscador campo de busqueda
 * @param {number} retardoLecturaMs retardo con que se retienen las lecturas
 * @returns {Promise<{ urlFinal: URL, asentadas: string[], valores: string[] }>}
 * @throws {Error} si la pantalla no se asienta dentro del limite de recarga
 */
async function esperarAsentado (pagina, buscador, retardoLecturaMs) {
  const limite = performance.now() + LIMITE_RECARGA_MS * 2
  const valores = []
  let ultima = ''
  let desde = performance.now()

  while (performance.now() < limite) {
    const valor = await buscador.inputValue()
    if (valores.at(-1) !== valor) valores.push(valor)
    const foto = JSON.stringify([pagina.url(), valor, (await filasVisibles(pagina)).length])
    if (foto !== ultima) {
      ultima = foto
      desde = performance.now()
    } else if (performance.now() - desde >= retardoLecturaMs * 2) {
      return { urlFinal: new URL(pagina.url()), asentadas: await filasVisibles(pagina), valores }
    }
    await pagina.waitForTimeout(250)
  }
  throw new Error('La pantalla de busqueda no se asento dentro del limite.')
}

/**
 * Filtrar dos veces seguidas mientras el refresco anterior sigue en curso.
 *
 * Retiene las lecturas (`_rsc` y BFF) varios segundos, busca un termino, y sin esperar busca otro. La
 * pantalla final tiene que mostrar el ultimo, no el de la respuesta que llego despues. Se compara con
 * una carga limpia (sin red ni retardo) de la misma URL.
 *
 * @param {import('playwright').BrowserContext} contexto sesion iniciada
 * @param {object} bff interceptor del BFF
 * @returns {Promise<object>}
 * @throws {AssertionError} si la pantalla asentada difiere de la carga limpia del ultimo filtro
 */
async function filtrar (contexto, bff) {
  const { pagina, red, rsc } = await prepararPagina(contexto, modulo.lista)
  const clics = []
  const retardoLecturaMs = 3000
  const retenerRsc = async (ruta) => {
    if (ruta.request().headers()['next-router-prefetch'] === undefined) await esperar(retardoLecturaMs)
    await ruta.continue().catch(() => undefined)
  }
  try {
    const buscador = pagina.getByLabel(modulo.filtrar.buscador).or(pagina.getByPlaceholder(modulo.filtrar.buscador)).first()
    bff.establecer([{ metodo: 'GET', modo: { tipo: 'retardo', ms: retardoLecturaMs } }])
    bff.reiniciar()
    rsc.reiniciar()
    await contexto.route(/[?&]_rsc=/, retenerRsc)
    await red.encender()

    await clicMedido(clics, `buscar ${modulo.filtrar.primero}`, pagina, async () => {
      await buscador.fill(modulo.filtrar.primero)
      await buscador.press('Enter')
    })
    await clicMedido(clics, `buscar ${modulo.filtrar.segundo}`, pagina, async () => {
      await buscador.fill(modulo.filtrar.segundo)
      await buscador.press('Enter')
    })
    const { urlFinal, asentadas, valores } = await esperarAsentado(pagina, buscador, retardoLecturaMs)
    await red.apagar()
    bff.establecer([])

    const limpia = await prepararPagina(contexto, `${urlFinal.pathname}${urlFinal.search}`)
    const esperadas = await filasVisibles(limpia.pagina)
    await limpia.pagina.close()

    const diferencia = asentadas.findIndex((fila, i) => fila !== esperadas[i])
    assert.ok(
      asentadas.length === esperadas.length && diferencia === -1,
      `La pantalla asentada (${asentadas.length} filas) no coincide con una carga limpia (${esperadas.length}) del ultimo filtro; primera diferencia: ${JSON.stringify(asentadas[diferencia])} contra ${JSON.stringify(esperadas[diferencia])}.`
    )

    return {
      filtroFinal: urlFinal.search,
      filas: asentadas.length,
      valoresDelBuscador: valores,
      buscadorCoincide: valores.at(-1) === modulo.filtrar.segundo,
      ...cierre(bff, rsc, clics)
    }
  } finally {
    await contexto.unroute(/[?&]_rsc=/, retenerRsc)
    bff.establecer([])
    await pagina.close()
  }
}

const ESCENARIOS = { abrir, estado, crear, tablero, filtrar }

/**
 * Lee la base guardada, si existe.
 *
 * @returns {Promise<object>}
 */
async function leerBase () {
  try {
    return JSON.parse(await readFile(RAIZ_BASE, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return { modulos: {} }
    throw error
  }
}

/**
 * Ejecuta el escenario si el modulo lo soporta; si no, lo informa como omitido.
 *
 * @param {string} nombre nombre del escenario
 * @param {import('playwright').BrowserContext} contexto sesion iniciada
 * @param {object} bff interceptor del BFF
 * @returns {Promise<object>}
 */
async function correr (nombre, contexto, bff) {
  const config = modulo[nombre]
  if (config?.omitido) return { omitido: config.omitido }
  assert.ok(config, `El modulo ${opciones.modulo} no declara el escenario ${nombre}.`)

  return await ESCENARIOS[nombre](contexto, bff)
}

const nombres = opciones.escenarios.split(',').map((n) => n.trim()).filter(Boolean)
for (const nombre of nombres) assert.ok(nombre in ESCENARIOS, `Escenario desconocido: ${nombre}. Usa ${Object.keys(ESCENARIOS).join(', ')}.`)

const base = await leerBase()
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })
const resultados = {}
const fallos = []

try {
  const contexto = await navegador.newContext({
    timezoneId: 'UTC', storageState: process.env.TAREA_TEST_STORAGE_STATE, viewport: { width: 1440, height: 1000 }
  })
  if (!process.env.TAREA_TEST_STORAGE_STATE) {
    const respuesta = await contexto.request.post(new URL('/api/sesion', destino).href, { data: credenciales() })
    assert.ok(respuesta.ok(), `Login: HTTP ${respuesta.status()}`)
  }
  await instalarSonda(contexto)
  const bff = await interceptarBff(contexto)

  for (const nombre of nombres) {
    try {
      resultados[nombre] = await correr(nombre, contexto, bff)
    } catch (error) {
      fallos.push({ escenario: nombre, mensaje: String(error?.message ?? error).split('\n').slice(0, 14).join(' ') })
      resultados[nombre] = { fallo: fallos.at(-1).mensaje }
    }
    const anterior = base.modulos?.[opciones.modulo]?.[nombre]
    console.log(JSON.stringify({
      modulo: opciones.modulo,
      perfil: opciones.perfil,
      escenario: nombre,
      ...resultados[nombre],
      ...(anterior?.primerContenidoMs === undefined ? {} : { basePrimerContenidoMs: anterior.primerContenidoMs })
    }))
  }
} finally {
  await navegador.close()
}

if (opciones['guardar-base']) {
  const validos = Object.fromEntries(Object.entries(resultados).filter(([, r]) => r.fallo === undefined))
  const modulos = { ...base.modulos, [opciones.modulo]: { ...base.modulos?.[opciones.modulo], ...validos } }
  const salida = { generado: new Date().toISOString(), perfil: opciones.perfil, retardoEscrituraMs: retardoEscritura, modulos }
  await writeFile(RAIZ_BASE, `${JSON.stringify(salida, null, 2)}\n`)
  console.log(`Linea base guardada en pruebas/red-lenta.base.json (${opciones.modulo}).`)
}

if (fallos.length > 0) {
  console.error(`Fallos de seguridad: ${JSON.stringify(fallos)}`)
  process.exitCode = 1
}
