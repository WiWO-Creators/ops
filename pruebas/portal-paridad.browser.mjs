/**
 * Verificacion en pantalla de la paridad del portal: las nueve pestañas que el cliente abre con el
 * MISMO panel que ve el colaborador —Descripcion, Tareas (tabla y tablero), Hitos, Tiempos,
 * Gantt, Calendario, Meeting Paper y Actividad—, la ficha de una Tarea, el interruptor
 * con el que el equipo enciende el Meeting Paper del cliente, y que el panel no regreso.
 *
 * El clic va por `evaluate`: en ops-v2 `locator.click()` se cuelga. La sesion se consigue pidiendo
 * la cookie a `/api/sesion` e inyectandola con `secure: false`.
 */
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

/*
 * Requiere el mock corriendo y la app levantada con `pnpm build` + `pnpm start` —nunca `pnpm dev`:
 * ahi la pagina no hidrata y los clics no responden—. `PARIDAD_URL` cambia el origen y
 * `PARIDAD_CAPTURAS` la carpeta de las capturas.
 */
const destino = new URL(process.env.PARIDAD_URL ?? 'http://localhost:3010')
assert.ok(['localhost', '127.0.0.1'].includes(destino.hostname), 'Solo permite pruebas locales.')

const BASE = destino.origin
const SALIDA = process.env.PARIDAD_CAPTURAS ?? 'capturas-portal-paridad'

await mkdir(SALIDA, { recursive: true })

/** Las cookies de una respuesta de `/api/sesion`, listas para inyectar. `secure: false` es la clave. */
function galletas (respuesta) {
  return respuesta.headers.getSetCookie()
    .map((c) => c.split(';')[0])
    .map((c) => {
      const [nombre, ...valor] = c.split('=')
      return { name: nombre, value: valor.join('='), domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }
    })
}

const CLIENTA = { portal: true, email: 'clienta@acme.com', password: 'portal1234' }
const ANA = { email: 'ana@wiwo.me', password: 'mock1234' }

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } })

/**
 * Cambia la sesion del navegador.
 *
 * El portal y el panel usan la MISMA cookie, asi que entrar como una persona pisa a la otra. Se
 * alterna a proposito: el interruptor del Meeting Paper se prende del lado del equipo y se mira del
 * lado del cliente, y sin ir y volver no se comprueba que la pestaña aparezca de verdad.
 */
async function entrarComo (credenciales) {
  const respuesta = await fetch(`${BASE}/api/sesion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(credenciales)
  })
  assert.equal(respuesta.status, 200, `no pude entrar como ${credenciales.email}`)
  await contexto.addCookies(galletas(respuesta))
}

await entrarComo(CLIENTA)
const pagina = await contexto.newPage()

const errores = []
pagina.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`))
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(`console: ${m.text()}`) })

/**
 * Peticiones que fallaron, con la pantalla desde la que salieron.
 *
 * Un panel podado que ademas pide lo que no puede leer se ve bien y deja al cliente con un 401 en la
 * consola: el conteo es la unica forma de notarlo, porque en pantalla no se ve nada.
 */
const fallidas = []
pagina.on('response', (r) => {
  if (r.status() >= 400) fallidas.push(`${r.status()} ${r.url()} @ ${pagina.url()}`)
})

/** Va a una ruta y espera que la red se calme. */
async function ir (ruta) {
  await pagina.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' })
}

/** Clic por `evaluate`: `locator.click()` se cuelga en este proyecto. */
async function clicar (selector, texto) {
  const hecho = await pagina.evaluate(([sel, txt]) => {
    const nodos = [...document.querySelectorAll(sel)]
    const nodo = txt === null ? nodos[0] : nodos.find((n) => n.textContent.trim() === txt)
    if (nodo === undefined) return false
    nodo.click()
    return true
  }, [selector, texto ?? null])

  assert.equal(hecho, true, `no encontre ${selector} ${texto ?? ''}`)
  await pagina.waitForLoadState('networkidle')
}

/** Los rotulos de las pestañas del proyecto. */
async function pestanias () {
  return await pagina.$$eval('[role="tab"]', (ns) => ns.map((n) => n.textContent.trim()))
}

const visto = {}

// ---- Proyecto 1: comparte Tareas y Calendario -------------------------------------------------
await ir('/portal/proyectos/1')
visto.pestanias = await pestanias()
assert.deepEqual(visto.pestanias, [
  'Descripción', 'Tareas', 'Tiempos', 'Hitos', 'Archivos', 'Diagrama de Gantt', 'Calendario',
  'Meeting Paper', 'Actividad'
])

// Las aprobaciones viven DENTRO de la pestaña Descripcion, no sobre el juego de pestañas: sueltas se
// repetian encima de las diez y se llevaban ~190 px del primer viewport en todas.
visto.aprobacionesEnDescripcion = (await pagina.textContent('body')).includes('Esperan tu visto bueno')
visto.aprobacionesSobreLasPestanias = await pagina.evaluate(() => {
  const titulo = [...document.querySelectorAll('h2')].find((n) => n.textContent.trim() === 'Esperan tu visto bueno')
  const pestania = document.querySelector('[role="tab"]')
  if (titulo === null || titulo === undefined || pestania === null) return null
  // `compareDocumentPosition`: 4 = el titulo esta ANTES de la primera pestaña en el documento.
  return (pestania.compareDocumentPosition(titulo) & 2) !== 0
})
assert.equal(visto.aprobacionesEnDescripcion, true, 'las aprobaciones desaparecieron de la pantalla')
assert.equal(visto.aprobacionesSobreLasPestanias, false, 'las aprobaciones siguen sobre el juego de pestañas')

// ---- Pestaña Tareas: la tabla del colaborador, sin escritura ----------------------------------
await ir('/portal/proyectos/1?tab=tasks')
await pagina.waitForSelector('table')
visto.encabezados = await pagina.$$eval('table thead th', (ns) => ns.map((n) => n.textContent.trim()))
visto.filas = await pagina.$$eval('table tbody tr', (ns) => ns.length)
visto.presentaciones = await pagina.$$eval('[aria-label="Presentación"] button', (ns) => ns.map((n) => n.textContent.trim()))
visto.botones = await pagina.$$eval('button', (ns) => ns.map((n) => n.textContent.trim()).filter(Boolean))
visto.casillasDeSeleccion = await pagina.$$eval('table input[type="checkbox"]', (ns) => ns.length)
visto.primeraFila = await pagina.$$eval('table tbody tr:first-child td', (ns) => ns.map((n) => n.textContent.trim()))
visto.menusDeAccion = await pagina.$$eval('table [aria-label="Acciones"]', (ns) => ns.length)
await pagina.screenshot({ path: `${SALIDA}/portal-tareas-tabla.png`, fullPage: true })

assert.equal(visto.filas > 0, true, 'la tabla no trajo filas')
// Sin la lectura de calendario: acota por rango de fechas y el contrato del contacto no lo acepta.
// El cliente tiene su calendario en la pestaña propia, que baja el mes entero de una vez.
assert.deepEqual(visto.presentaciones, ['Tabla', 'Tablero'])
assert.equal(visto.casillasDeSeleccion, 0, 'hay casillas de seleccion masiva con capacidades vacias')
// Dos acciones del equipo no piden capacidad, asi que `[]` no alcanzaba para podarlas: el cliente
// veia un menu por fila que solo podia devolver 404.
assert.equal(visto.menusDeAccion, 0, 'hay menu de acciones por fila en el portal')
// Las insignias resuelven contra el catalogo: sin esto la columna Prioridad decia "#4".
assert.equal(visto.primeraFila.some((celda) => /^#\d+$/.test(celda)), false, `celda sin resolver: ${visto.primeraFila.join(' | ')}`)
for (const prohibido of ['Nueva tarea', 'Crear', 'Nuevo', 'Guardar', 'Eliminar', 'Editar']) {
  assert.equal(visto.botones.includes(prohibido), false, `boton de escritura visible: ${prohibido}`)
}

// ---- Tablero, llegando por el control de presentacion y no por la URL -------------------------
// Un clic de verdad: es lo que prueba que la pagina hidrato y que el control responde.
await clicar('[aria-label="Presentación"] button', 'Tablero')
// El estado de la vista vive en la URL: `router.replace` la escribe despues del clic.
await pagina.waitForFunction(() => new URL(location.href).searchParams.get('vista') === 'tablero')
await pagina.waitForLoadState('networkidle')
await pagina.waitForSelector('[aria-label="Presentación"]')
visto.columnasDelTablero = await pagina.$$eval('h3, [data-columna]', (ns) => ns.map((n) => n.textContent.trim()).filter(Boolean))
visto.textoTablero = (await pagina.textContent('body')).includes('No se pudo cargar el tablero')
visto.tarjetasArrastrables = await pagina.$$eval('article[draggable="true"]', (ns) => ns.length)
visto.botonesDelTablero = await pagina.$$eval('article button', (ns) => ns.map((n) => n.textContent.trim()))
// Solo dentro de las tarjetas: el payload RSC de la pagina trae las etiquetas de las Tareas que
// esperan visto bueno —eso es contrato de la API, no de este panel— y buscarlas en todo el `body`
// encontraria ese texto dentro de un `<script>`.
visto.etiquetasEnTarjetas = (await pagina.$$eval('article', (ns) => ns.map((n) => n.textContent).join(' '))).includes('urgente')
await pagina.screenshot({ path: `${SALIDA}/portal-tareas-tablero.png`, fullPage: true })
assert.equal(visto.textoTablero, false, 'el tablero del portal fallo')
assert.equal(visto.columnasDelTablero.length > 0, true, 'el tablero no pinto columnas')
// Mover una tarjeta cambia el estado: es escritura, y sin capacidad no se ofrece ni arrastrando.
assert.equal(visto.tarjetasArrastrables, 0, 'las tarjetas del portal se pueden arrastrar')
assert.equal(visto.botonesDelTablero.includes('Mover a…'), false, 'el portal ofrece mover tarjetas')
// Las etiquetas son vocabulario interno: no son columna de la tabla del cliente ni van en su tarjeta.
assert.equal(visto.etiquetasEnTarjetas, false, 'la tarjeta del portal pinta etiquetas internas')

// ---- `?vista=calendario` en el portal cae a la tabla y no pide un rango que da 422 -------------
await ir('/portal/proyectos/1?tab=tasks&vista=calendario')
await pagina.waitForSelector('table')
visto.filasConVistaCalendario = await pagina.$$eval('table tbody tr', (ns) => ns.length)
await pagina.screenshot({ path: `${SALIDA}/portal-tareas-vista-invalida.png`, fullPage: true })
assert.equal(visto.filasConVistaCalendario > 0, true, 'la vista invalida no cayo a la tabla')

// ---- Pestaña Calendario (la nueva) -------------------------------------------------------------
await ir('/portal/proyectos/1?tab=calendar')
await pagina.waitForSelector('[aria-label="Vista del calendario"]')
visto.vistasDelCalendario = await pagina.$$eval('[aria-label="Vista del calendario"] button', (ns) => ns.map((n) => n.textContent.trim()))
visto.tituloDelPeriodo = await pagina.textContent('[aria-label="Vista del calendario"] ~ *, p.min-w-44').catch(() => null)
visto.entregasVisibles = await pagina.$$eval('a[href*="tarea="]', (ns) => ns.length)
await pagina.screenshot({ path: `${SALIDA}/portal-calendario.png`, fullPage: true })
assert.deepEqual(visto.vistasDelCalendario, ['Mes', 'Semana', 'Día', 'Lista'])

// ---- Ficha de una Tarea: solo lectura ----------------------------------------------------------
await ir('/portal/proyectos/1?tab=tasks&tarea=509')
await pagina.waitForSelector('[role="dialog"]')
await pagina.waitForFunction(() => !document.body.textContent.includes('Cargando la tarea'))
const dialogo = await pagina.textContent('[role="dialog"]')
visto.secciones = await pagina.$$eval('[role="dialog"] h4', (ns) => ns.map((n) => n.textContent.trim()))
visto.botonesDeLaFicha = await pagina.$$eval('[role="dialog"] button', (ns) => ns.map((n) => n.textContent.trim()).filter(Boolean))
visto.datosDeLaFicha = await pagina.$$eval('[role="dialog"] dt', (ns) => ns.map((n) => n.textContent.trim()))
await pagina.screenshot({ path: `${SALIDA}/portal-ficha-tarea.png`, fullPage: true })

assert.equal(dialogo.includes('No encontramos esta'), false, 'la ficha no cargo')
// El comentario llega firmado con `staff` o con `contact`, nunca con un `author` ya resuelto: quien
// firma ES el dato, y sin el la tarjeta decia "Sin autor" y sin fecha.
visto.autoresDeLaFicha = await pagina.$$eval('[role="dialog"] li span', (ns) => ns.map((n) => n.textContent.trim()))
assert.equal(visto.autoresDeLaFicha.includes('Sin autor'), false, 'el comentario perdió su autor')
assert.equal(visto.autoresDeLaFicha.includes('Ana Ríos'), true, 'falta el autor del comentario del equipo')
assert.equal(visto.autoresDeLaFicha.includes('Renata Ferreyra'), true, 'falta el autor del comentario del cliente')
assert.equal(visto.autoresDeLaFicha.includes('Cliente'), true, 'el comentario del cliente no lleva su insignia')
assert.equal(visto.secciones.includes('Comentarios'), true)
assert.equal(visto.secciones.includes('Tiempo registrado'), true)
// El titulo lleva el conteo pegado ("Lista de control 3/4"), igual que en el panel que si escribe.
assert.equal(visto.secciones.some((s) => s.startsWith('Lista de control')), true)
assert.equal(visto.secciones.includes('Enlaces'), false, 'dibujo Enlaces sin campos personalizados')
// La lista de control se lee: ni una casilla de formulario apagada, que se leeria como un control
// roto. El avance lo dice una marca y el texto tachado.
visto.casillasDeLaFicha = await pagina.$$eval('[role="dialog"] input[type="checkbox"]', (ns) => ns.length)
visto.tachadosDeLaFicha = await pagina.$$eval('[role="dialog"] .line-through', (ns) => ns.length)
assert.equal(visto.casillasDeLaFicha, 0, 'la lista de control del portal dibuja casillas deshabilitadas')
assert.equal(visto.tachadosDeLaFicha > 0, true, 'la lista de control perdió la marca de lo hecho')
for (const prohibido of ['Editar', 'Eliminar', 'Duplicar…', 'Compartir', 'Marcar completada']) {
  assert.equal(visto.botonesDeLaFicha.includes(prohibido), false, `boton de escritura en la ficha: ${prohibido}`)
}
for (const prohibido of ['ASIGNADOS', 'ETIQUETAS', 'PROYECTO']) {
  assert.equal(visto.datosDeLaFicha.includes(prohibido), false, `dato interno en la ficha: ${prohibido}`)
}

// ---- Tarea sin comentarios ---------------------------------------------------------------------
await ir('/portal/proyectos/1?tab=tasks&tarea=500')
await pagina.waitForSelector('[role="dialog"]')
await pagina.waitForFunction(() => !document.body.textContent.includes('Cargando la tarea'))
const fichaVacia = await pagina.textContent('[role="dialog"]')
visto.sinComentarios = fichaVacia.includes('Todavía no hay comentarios')
visto.datosDeLaFichaVacia = await pagina.$$eval('[role="dialog"] dt', (ns) => ns.map((n) => n.textContent.trim()))
visto.contadoresDeLaFichaVacia = await pagina.$$eval(
  '[role="dialog"] ul.grid-cols-2 span',
  (ns) => ns.map((n) => n.textContent.trim())
)
await pagina.screenshot({ path: `${SALIDA}/portal-ficha-sin-comentarios.png`, fullPage: true })
assert.equal(visto.sinComentarios, true)
// Sin hito y sin menu que ofrecer, la fila no se dibuja: un "Hito —" es una declaracion de ausencia
// que no le sirve a quien no puede ponerle uno.
assert.equal(visto.datosDeLaFichaVacia.includes('HITO'), false, 'la ficha dibujó "Hito —"')
// Con Comentarios y Adjuntos en cero, la tarjeta de contadores se colapsa: las dos secciones de
// abajo ya dicen que no hay ninguno.
assert.deepEqual(visto.contadoresDeLaFichaVacia, [], 'la ficha repitió los ceros de Comentarios y Adjuntos')

// ---- Listado vacio -----------------------------------------------------------------------------
await ir('/portal/proyectos/1?tab=tasks&filter%5Bstatus%5D=5')
await pagina.waitForLoadState('networkidle')
visto.listadoVacio = await pagina.textContent('body')
await pagina.screenshot({ path: `${SALIDA}/portal-tareas-vacio.png`, fullPage: true })
assert.equal(/Sin tareas|No hay|Todav/i.test(visto.listadoVacio), true, 'el listado vacio no dijo nada')

// ---- Pestaña Descripcion: la ficha y los indicadores del colaborador --------------------------
await ir('/portal/proyectos/1?tab=overview')
await pagina.waitForSelector('dl')
visto.datosDeLaDescripcion = await pagina.$$eval('dl dt', (ns) => ns.map((n) => n.textContent.trim()))
visto.metricas = await pagina.$$eval('section p, section span', (ns) => ns.map((n) => n.textContent.trim()))
visto.textoDescripcion = await pagina.textContent('body')
await pagina.screenshot({ path: `${SALIDA}/portal-descripcion.png`, fullPage: true })

// Las filas que el contrato del contacto SI manda, con el mismo rotulo que el panel.
for (const fila of ['Cliente', 'Estado', 'Fecha de creación', 'Fecha de inicio', 'Horas estimadas']) {
  assert.equal(visto.datosDeLaDescripcion.includes(fila), true, `falta la fila "${fila}"`)
}
// El tipo de facturacion no lo publica el contrato del contacto: la fila no se dibuja, y no se
// dibuja vacia.
assert.equal(visto.datosDeLaDescripcion.includes('Tipo de facturación'), false, 'fila que el contrato no manda')
// `expenses` no viaja al contacto: ni la metrica ni el bloque.
assert.equal(visto.textoDescripcion.includes('Gastos'), false, 'el portal pinto el bloque de Gastos')
// El grafico de horas es un subrecurso que el contacto no tiene: no se monta ni falla.
assert.equal(visto.textoDescripcion.includes('Horas registradas'), false, 'el portal monto el gráfico de horas')
assert.equal(visto.textoDescripcion.includes('No se pudo cargar'), false, 'la Descripción del portal falló')
// `logged_time` si viaja en el proyecto 1: la metrica esta.
assert.equal(visto.textoDescripcion.includes('Registro total de horas'), true, 'falta el total de horas')

// ---- Pestaña Hitos: la tabla del colaborador, sin kanban ni acciones --------------------------
await ir('/portal/proyectos/1?tab=milestones')
await pagina.waitForSelector('table')
visto.encabezadosDeHitos = await pagina.$$eval('table thead th', (ns) => ns.map((n) => n.textContent.trim()))
visto.filasDeHitos = await pagina.$$eval('table tbody tr', (ns) => ns.length)
visto.botonesDeHitos = await pagina.$$eval('button', (ns) => ns.map((n) => n.textContent.trim()).filter(Boolean))
visto.vistaDeHitos = await pagina.$$eval('[aria-label="Vista de hitos"] button', (ns) => ns.map((n) => n.textContent.trim()))
await pagina.screenshot({ path: `${SALIDA}/portal-hitos.png`, fullPage: true })

assert.equal(visto.filasDeHitos > 0, true, 'la tabla de Hitos no trajo filas')
assert.deepEqual(visto.encabezadosDeHitos, ['Nombre del hito', 'Fecha de inicio', 'Fecha de vencimiento', 'Descripción', 'Avance'])
// El endpoint del contacto no atiende `?vista=tablero`: el alternador no se ofrece.
assert.deepEqual(visto.vistaDeHitos, [], 'el portal ofrece el kanban de Hitos')
assert.equal(visto.botonesDeHitos.some((b) => b.startsWith('Nuevo hito')), false, 'el portal ofrece crear un Hito')
assert.equal(visto.botonesDeHitos.includes('Editar'), false, 'el portal ofrece editar un Hito')
// Buscar no es escribir: era la unica tabla del portal sin buscador.
visto.buscadorDeHitos = await pagina.$$eval('input[type="search"]', (ns) => ns.length)
assert.equal(visto.buscadorDeHitos > 0, true, 'la tabla de Hitos del portal no tiene buscador')
// La columna Descripcion existe porque el equipo compartio la del primer hito: la fila la trae.
visto.descripcionDelPrimerHito = await pagina.$$eval(
  'table tbody tr:first-child td',
  (ns) => ns.map((n) => n.textContent.trim())
)
assert.equal(
  visto.descripcionDelPrimerHito.some((celda) => celda.startsWith('Lo que entra en la primera entrega')),
  true,
  'el hito que comparte su descripción no la muestra'
)

// Buscando el otro hito —el que no comparte descripción— la columna entera desaparece: un encabezado
// sobre celdas en blanco dice que hay un dato y no lo hay.
await ir('/portal/proyectos/1?tab=milestones&q=Cierre')
await pagina.waitForSelector('table')
visto.filasDeHitosBuscadas = await pagina.$$eval('table tbody tr', (ns) => ns.length)
visto.encabezadosDeHitosBuscados = await pagina.$$eval('table thead th', (ns) => ns.map((n) => n.textContent.trim()))
await pagina.screenshot({ path: `${SALIDA}/portal-hitos-buscados.png`, fullPage: true })
assert.equal(visto.filasDeHitosBuscadas, 1, 'el buscador de Hitos no acotó la lista')
assert.deepEqual(
  visto.encabezadosDeHitosBuscados,
  ['Nombre del hito', 'Fecha de inicio', 'Fecha de vencimiento', 'Avance'],
  'la columna Descripción se dibujó sin una sola fila que la traiga'
)

// ---- Pestaña Tiempos: sin columnas que el contrato no manda y sin acciones por fila -----------
await ir('/portal/proyectos/1?tab=timesheets')
await pagina.waitForSelector('table')
visto.encabezadosDeTiempos = await pagina.$$eval('table thead th', (ns) => ns.map((n) => n.textContent.trim()).filter(Boolean))
visto.filasDeTiempos = await pagina.$$eval('table tbody tr', (ns) => ns.length)
visto.botonesDeTiempos = await pagina.$$eval('button', (ns) => ns.map((n) => n.textContent.trim()).filter(Boolean))
visto.textoTiempos = await pagina.textContent('body')
await pagina.screenshot({ path: `${SALIDA}/portal-tiempos.png`, fullPage: true })

assert.equal(visto.filasDeTiempos > 0, true, 'la tabla de horas no trajo filas')
assert.deepEqual(visto.encabezadosDeTiempos, [
  'Miembro', 'Tarea', 'Hora de inicio', 'Hora de finalización', 'Nota', 'Hora (h)'
])
// Ni etiquetas ni decimal: el contrato del contacto no las manda, y una columna siempre vacia o con
// "NaN" es peor que no tenerla.
assert.equal(visto.encabezadosDeTiempos.includes('Etiquetas'), false)
assert.equal(visto.encabezadosDeTiempos.includes('Hora (decimal)'), false)
assert.equal(visto.textoTiempos.includes('NaN'), false, 'la tabla de horas pinto NaN')
// Facturable / Facturado / Sin facturar salen de `muestra_finanzas`, que el contacto no recibe.
for (const prohibido of ['Facturable', 'Facturado', 'Sin facturar']) {
  assert.equal(visto.textoTiempos.includes(prohibido), false, `metrica de facturacion en el portal: ${prohibido}`)
}
assert.equal(visto.botonesDeTiempos.includes('Registro de horas'), false, 'el portal ofrece cargar horas')
assert.equal(visto.botonesDeTiempos.includes('Detener'), false, 'el portal ofrece detener un cronómetro')

// ---- Pestaña Gantt: el diagrama del colaborador, con una sola agrupacion ----------------------
await ir('/portal/proyectos/1?tab=gantt')
await pagina.waitForFunction(() => !document.body.textContent.includes('Cargando el Gantt'))
visto.agrupacionesDelGantt = await pagina.$$eval('[aria-label="Agrupar por"] button', (ns) => ns.map((n) => n.textContent.trim()))
visto.escalasDelGantt = await pagina.$$eval('[aria-label="Escala"] button', (ns) => ns.map((n) => n.textContent.trim()))
visto.textoGantt = await pagina.textContent('body')
await pagina.screenshot({ path: `${SALIDA}/portal-gantt.png`, fullPage: true })
// El endpoint del contacto responde 422 a cualquier agrupacion que no sea por Hitos: un control de
// una sola opcion es ruido, y ofrecer las otras dos seria mandar al cliente a un error.
assert.deepEqual(visto.agrupacionesDelGantt, [], 'el portal ofrece agrupar el Gantt')
assert.equal(visto.escalasDelGantt.length > 0, true, 'el Gantt del portal perdió la escala')
assert.equal(visto.textoGantt.includes('No se pudo cargar el diagrama'), false, 'el Gantt del portal falló')

// ---- Pestaña Actividad: la linea de tiempo, sin el interruptor de visibilidad -----------------
await ir('/portal/proyectos/1?tab=activity')
await pagina.waitForFunction(() => !document.body.textContent.includes('Cargando la actividad'))
visto.entradasDeActividad = await pagina.$$eval('ol ol li', (ns) => ns.length)
visto.interruptoresDeActividad = await pagina.$$eval('input[type="checkbox"]', (ns) => ns.length)
await pagina.screenshot({ path: `${SALIDA}/portal-actividad.png`, fullPage: true })
assert.equal(visto.entradasDeActividad > 0, true, 'la actividad no trajo entradas')
// La clave `visible_to_customer` no viaja al portal, y sin ella la fila no lleva control.
assert.equal(visto.interruptoresDeActividad, 0, 'el portal dibujó el interruptor de visibilidad')

// ---- Pestaña Meeting Paper: el acta se lee, no se escribe -------------------------------------
await ir('/portal/proyectos/1?tab=actas')
await pagina.waitForSelector('table')
visto.encabezadosDeActas = await pagina.$$eval('table thead th', (ns) => ns.map((n) => n.textContent.trim()))
visto.filasDeActas = await pagina.$$eval('table tbody tr', (ns) => ns.length)
visto.botonesDeActas = await pagina.$$eval('button', (ns) => ns.map((n) => n.textContent.trim()).filter(Boolean))
visto.textoActas = await pagina.textContent('body')
await pagina.screenshot({ path: `${SALIDA}/portal-actas-lista.png`, fullPage: true })

assert.equal(visto.filasDeActas, 2, 'el listado de Meeting Papers no trajo las dos actas')
assert.deepEqual(visto.encabezadosDeActas, ['Título', 'Cliente', 'Fecha de la reunión', 'Escrito por', 'Creado'])
assert.equal(visto.botonesDeActas.some((b) => b.includes('Nuevo Meeting Paper')), false, 'el portal ofrece crear un acta')
// `source` no viaja al contacto: como se escribio el acta es asunto del equipo.
assert.equal(visto.textoActas.includes('Escrito con IA'), false, 'el portal delata que el acta la escribio un modelo')
assert.equal(visto.textoActas.includes('No se pudo cargar'), false, 'el Meeting Paper del portal falló')

// El acta abierta: el documento, sus datos y sus archivos. Ni Corregir, ni Eliminar, ni el estilo.
await ir('/portal/proyectos/1?tab=actas&acta=901')
await pagina.waitForSelector('iframe')
visto.botonesDelActa = await pagina.$$eval('button', (ns) => ns.map((n) => n.textContent.trim()).filter(Boolean))
visto.textoDelActa = await pagina.textContent('body')
visto.adjuntosDelActa = await pagina.$$eval('figure figcaption span', (ns) => ns.map((n) => n.textContent.trim()))
await pagina.screenshot({ path: `${SALIDA}/portal-acta-abierta.png`, fullPage: true })

visto.encabezadoDelCuerpo = await pagina.evaluate(() => {
  const marco = document.querySelector('iframe')
  const cuerpo = marco?.contentDocument?.body
  return cuerpo === null || cuerpo === undefined ? null : cuerpo.textContent
})
assert.equal(visto.textoDelActa.includes('Kickoff del rediseño'), true, 'no se abrió el acta')
// El identificador del proyecto que el modelo no supo escribir no es un dato: es un hueco de su
// formulario, y no se le muestra al cliente como encabezado del documento.
assert.equal(
  visto.encabezadoDelCuerpo === null || !visto.encabezadoDelCuerpo.includes('#No especificado'),
  true,
  'el cuerpo del acta imprimió "#No especificado"'
)
assert.equal(visto.textoDelActa.includes('Asistentes: Ana Pérez, Renata Ferreyra'), true, 'el acta perdió sus asistentes')
assert.equal(visto.textoDelActa.includes('Archivos de la reunión'), true, 'el acta perdió sus adjuntos')
assert.equal(visto.adjuntosDelActa.some((s) => s === 'reunion-kickoff.m4a'), true, 'falta el audio de la reunión')
for (const prohibido of ['Corregir', 'Guardar', 'Eliminar', 'Descartar cambios']) {
  assert.equal(visto.botonesDelActa.includes(prohibido), false, `boton de escritura en el acta: ${prohibido}`)
}
assert.equal(visto.botonesDelActa.some((b) => b.startsWith('Estilo:')), false, 'el portal ofrece cambiar la marca')
// Exportar e imprimir no escriben nada: arman el archivo con el HTML que ya se descargo.
assert.equal(visto.botonesDelActa.includes('Exportar'), true, 'el cliente no puede bajarse el acta')

// Un acta sin adjuntos: el bloque no se dibuja vacio.
await ir('/portal/proyectos/1?tab=actas&acta=902')
await pagina.waitForSelector('iframe')
visto.textoActaSinAdjuntos = await pagina.textContent('body')
await pagina.screenshot({ path: `${SALIDA}/portal-acta-sin-adjuntos.png`, fullPage: true })
assert.equal(visto.textoActaSinAdjuntos.includes('Revisión semanal'), true, 'no se abrió el acta sin adjuntos')
assert.equal(visto.textoActaSinAdjuntos.includes('Archivos de la reunión'), false, 'dibujó el bloque de archivos vacío')

// `?acta=nuevo` lo escribe cualquiera en la URL: sin capacidad de alta no abre el asistente.
await ir('/portal/proyectos/1?tab=actas&acta=nuevo')
await pagina.waitForSelector('table')
visto.filasConActaNueva = await pagina.$$eval('table tbody tr', (ns) => ns.length)
visto.textoActaNueva = await pagina.textContent('body')
await pagina.screenshot({ path: `${SALIDA}/portal-actas-alta-por-url.png`, fullPage: true })
assert.equal(visto.filasConActaNueva, 2, '`?acta=nuevo` no cayó al listado')
assert.equal(visto.textoActaNueva.includes('Subir'), false, 'el asistente de creación se abrió en el portal')

// ---- Proyecto 8: pestañas apagadas y pestañas encendidas pero vacias --------------------------
await ir('/portal/proyectos/8')
visto.pestaniasDelOcho = await pestanias()
await pagina.screenshot({ path: `${SALIDA}/portal-proyecto-sin-tareas.png`, fullPage: true })
assert.deepEqual(visto.pestaniasDelOcho, ['Descripción', 'Hitos', 'Archivos', 'Actividad'])
for (const apagada of ['Tareas', 'Calendario', 'Tiempos', 'Diagrama de Gantt', 'Meeting Paper']) {
  assert.equal(visto.pestaniasDelOcho.includes(apagada), false, `pestaña apagada visible: ${apagada}`)
}

// Sin `logged_time` en el resumen: la metrica no se dibuja, no se dibuja en cero.
await ir('/portal/proyectos/8?tab=overview')
await pagina.waitForSelector('dl')
visto.textoDescripcionDelOcho = await pagina.textContent('body')
await pagina.screenshot({ path: `${SALIDA}/portal-descripcion-sin-horas.png`, fullPage: true })
assert.equal(visto.textoDescripcionDelOcho.includes('Registro total de horas'), false, 'inventó un total de horas')
assert.equal(visto.textoDescripcionDelOcho.includes('00:00'), false, 'pintó un 00:00 que nadie contó')
// `finance` tampoco viaja: sin costo ni horas estimadas.
assert.equal(visto.textoDescripcionDelOcho.includes('Horas estimadas'), false, 'inventó horas estimadas')
// Sin la pestaña Tareas el resumen no cuenta Tareas: ni el KPI, ni la tarjeta, ni la barra de avance
// —que decia 0% debajo del 91% de la cabecera, en la misma pantalla—.
visto.barrasDelOcho = await pagina.$$eval('[role="progressbar"]', (ns) => ns.length)
visto.avanceEnLaCabeceraDelOcho = await pagina.evaluate(() => {
  const nodo = [...document.querySelectorAll('span')].find((n) => /^\d+%$/.test(n.textContent.trim()))
  return nodo === undefined ? null : nodo.textContent.trim()
})
assert.equal(visto.textoDescripcionDelOcho.includes('abiertas'), false, 'contó tareas de una pestaña que el cliente no tiene')
assert.equal(/\d+ completadas de \d+/.test(visto.textoDescripcionDelOcho), false, 'dibujó la tarjeta de Tareas')
// Quedan DOS barras: la de la cabecera del Proyecto y la de la tarjeta Plazo. Antes eran cuatro —la
// suelta del resumen y la de la tarjeta Tareas, las dos al 0% bajo un 91%—.
assert.equal(visto.barrasDelOcho, 2, `quedaron ${visto.barrasDelOcho} barras de avance en el proyecto 8`)
assert.equal(visto.avanceEnLaCabeceraDelOcho, '91%', 'la cabecera perdió el avance del Espacio')

// Proyecto sin hitos: la tabla dice que no hay, no se rompe.
await ir('/portal/proyectos/8?tab=milestones')
await pagina.waitForLoadState('networkidle')
visto.textoHitosDelOcho = await pagina.textContent('body')
await pagina.screenshot({ path: `${SALIDA}/portal-hitos-vacio.png`, fullPage: true })
assert.equal(/Sin hitos|No hay|Todav/i.test(visto.textoHitosDelOcho), true, 'el proyecto sin hitos no dijo nada')

// ---- El panel del colaborador sigue igual ------------------------------------------------------
await entrarComo(ANA)

await ir('/proyectos/1?tab=tareas')
await pagina.waitForSelector('table')
visto.panelFilas = await pagina.$$eval('table tbody tr', (ns) => ns.length)
visto.panelCasillas = await pagina.$$eval('table input[type="checkbox"]', (ns) => ns.length)
visto.panelEncabezados = await pagina.$$eval('table thead th', (ns) => ns.map((n) => n.textContent.trim()))
await pagina.screenshot({ path: `${SALIDA}/panel-tareas.png`, fullPage: true })
assert.equal(visto.panelFilas > 0, true)
assert.equal(visto.panelCasillas > 0, true, 'el panel perdio la seleccion masiva')

visto.presentacionesDelPanel = await pagina.$$eval('[aria-label="Presentación"] button', (ns) => ns.map((n) => n.textContent.trim()))
assert.deepEqual(visto.presentacionesDelPanel, ['Tabla', 'Tablero', 'Calendario'], 'el panel perdio una lectura')

await ir('/proyectos/1?tab=tareas&vista=tablero')
await pagina.waitForSelector('article')
visto.panelArrastrables = await pagina.$$eval('article[draggable="true"]', (ns) => ns.length)
visto.panelBotonesDelTablero = await pagina.$$eval('article button', (ns) => ns.map((n) => n.textContent.trim()))
await pagina.screenshot({ path: `${SALIDA}/panel-tareas-tablero.png`, fullPage: true })
assert.equal(visto.panelArrastrables > 0, true, 'el panel perdio el arrastre del tablero')
assert.equal(visto.panelBotonesDelTablero.includes('Mover a…'), true, 'el panel perdio "Mover a…"')

await ir('/proyectos/1?tab=tareas&vista=calendario')
await pagina.waitForSelector('[aria-label="Vista"], [aria-label="Presentación"]')
await pagina.screenshot({ path: `${SALIDA}/panel-tareas-calendario.png`, fullPage: true })

await ir('/proyectos/1?tab=calendario')
await pagina.waitForSelector('[aria-label="Vista del calendario"]')
await pagina.screenshot({ path: `${SALIDA}/panel-calendario.png`, fullPage: true })

// ---- Y las seis pestañas que ahora comparte conservan lo suyo ---------------------------------
await ir('/proyectos/1?tab=descripcion')
await pagina.waitForFunction(() => !document.body.textContent.includes('Cargando los indicadores'))
visto.panelDatosDescripcion = await pagina.$$eval('dl dt', (ns) => ns.map((n) => n.textContent.trim()))
visto.panelTextoDescripcion = await pagina.textContent('body')
await pagina.screenshot({ path: `${SALIDA}/panel-descripcion.png`, fullPage: true })
for (const fila of ['Tipo de facturación', 'Fecha de creación', 'Costo total']) {
  assert.equal(visto.panelDatosDescripcion.includes(fila), true, `el panel perdió la fila "${fila}"`)
}
assert.equal(visto.panelTextoDescripcion.includes('Gastos'), true, 'el panel perdió el bloque de Gastos')
assert.equal(visto.panelTextoDescripcion.includes('Horas registradas'), true, 'el panel perdió el gráfico de horas')
// El contrato del equipo SI manda `tasks`: el KPI, la tarjeta y la barra siguen donde estaban.
assert.equal(visto.panelTextoDescripcion.includes('abiertas'), true, 'el panel perdió el KPI de Procesos abiertas')
assert.equal(/\d+ completadas de \d+/.test(visto.panelTextoDescripcion), true, 'el panel perdió la tarjeta de Procesos')

// La ficha de una Tarea del panel conserva su lista de control escribible: las casillas son el
// control de verdad, y lo que se cambió es la variante de solo lectura del cliente.
await ir('/proyectos/1?tab=tareas&tarea=509')
await pagina.waitForSelector('[role="dialog"]')
await pagina.waitForFunction(() => !document.body.textContent.includes('Cargando la tarea'))
visto.panelCasillasDeLaFicha = await pagina.$$eval('[role="dialog"] input[type="checkbox"]', (ns) => ns.length)
await pagina.screenshot({ path: `${SALIDA}/panel-ficha-tarea.png`, fullPage: true })
assert.equal(visto.panelCasillasDeLaFicha > 0, true, 'el panel perdió las casillas de su lista de control')

await ir('/proyectos/1?tab=hitos')
await pagina.waitForSelector('[aria-label="Vista de hitos"]')
visto.panelVistaDeHitos = await pagina.$$eval('[aria-label="Vista de hitos"] button', (ns) => ns.map((n) => n.textContent.trim()))
visto.panelBotonesDeHitos = await pagina.$$eval('button', (ns) => ns.map((n) => n.textContent.trim()).filter(Boolean))
await pagina.screenshot({ path: `${SALIDA}/panel-hitos.png`, fullPage: true })
assert.deepEqual(visto.panelVistaDeHitos, ['Tabla', 'Tablero'], 'el panel perdió el kanban de Hitos')
assert.equal(visto.panelBotonesDeHitos.some((b) => b.startsWith('Nuevo hito')), true, 'el panel perdió el alta de Hito')

// La tabla de Hitos del panel conserva su columna Descripción: el campo es del equipo, no lleva
// `omitirSiVacia`, y el hito de "Cierre" la tiene vacía sin que la columna desaparezca.
await ir('/proyectos/1?tab=hitos&vistaHitos=tabla')
await pagina.waitForSelector('table')
visto.panelEncabezadosDeHitos = await pagina.$$eval('table thead th', (ns) => ns.map((n) => n.textContent.trim()))
await pagina.screenshot({ path: `${SALIDA}/panel-hitos-tabla.png`, fullPage: true })
assert.equal(visto.panelEncabezadosDeHitos.includes('Descripción'), true, 'el panel perdió la columna Descripción')

await ir('/proyectos/1?tab=tiempos')
await pagina.waitForSelector('table')
visto.panelEncabezadosDeTiempos = await pagina.$$eval('table thead th', (ns) => ns.map((n) => n.textContent.trim()).filter(Boolean))
visto.panelBotonesDeTiempos = await pagina.$$eval('table button', (ns) => ns.map((n) => n.textContent.trim()))
await pagina.screenshot({ path: `${SALIDA}/panel-tiempos.png`, fullPage: true })
for (const columna of ['Etiquetas', 'Hora (decimal)']) {
  assert.equal(visto.panelEncabezadosDeTiempos.includes(columna), true, `el panel perdió la columna "${columna}"`)
}
assert.equal(visto.panelBotonesDeTiempos.includes('Editar'), true, 'el panel perdió las acciones por fila de horas')

await ir('/proyectos/1?tab=gantt')
await pagina.waitForFunction(() => !document.body.textContent.includes('Cargando el Gantt'))
visto.panelAgrupacionesDelGantt = await pagina.$$eval('[aria-label="Agrupar por"] button', (ns) => ns.map((n) => n.textContent.trim()))
await pagina.screenshot({ path: `${SALIDA}/panel-gantt.png`, fullPage: true })
assert.deepEqual(visto.panelAgrupacionesDelGantt, ['Hitos', 'Miembros', 'Estado'], 'el panel perdió las agrupaciones del Gantt')

await ir('/proyectos/1?tab=actividad')
await pagina.waitForFunction(() => !document.body.textContent.includes('Cargando la actividad'))
visto.panelInterruptoresDeActividad = await pagina.$$eval('input[type="checkbox"]', (ns) => ns.length)
await pagina.screenshot({ path: `${SALIDA}/panel-actividad.png`, fullPage: true })
assert.equal(visto.panelInterruptoresDeActividad > 0, true, 'el panel perdió el interruptor de visibilidad')

// ---- El Meeting Paper del colaborador conserva todo ------------------------------------------
await ir('/proyectos/1?tab=actas')
await pagina.waitForSelector('table')
visto.panelFilasDeActas = await pagina.$$eval('table tbody tr', (ns) => ns.length)
visto.panelBotonesDeActas = await pagina.$$eval('button', (ns) => ns.map((n) => n.textContent.trim()).filter(Boolean))
await pagina.screenshot({ path: `${SALIDA}/panel-actas-lista.png`, fullPage: true })
assert.equal(visto.panelFilasDeActas, 2, 'el panel perdió las actas')
assert.equal(
  visto.panelBotonesDeActas.some((b) => b.includes('Nuevo Meeting Paper')),
  true,
  'el panel perdió el alta de Meeting Paper'
)

await ir('/proyectos/1?tab=actas&acta=901')
await pagina.waitForSelector('iframe')
visto.panelBotonesDelActa = await pagina.$$eval('button', (ns) => ns.map((n) => n.textContent.trim()).filter(Boolean))
visto.panelTextoDelActa = await pagina.textContent('body')
await pagina.screenshot({ path: `${SALIDA}/panel-acta-abierta.png`, fullPage: true })
// Las cuatro escrituras siguen ahi: corregir, cambiar la marca, exportar y el menu con Eliminar.
assert.equal(visto.panelBotonesDelActa.includes('Corregir'), true, 'el panel perdió Corregir')
assert.equal(visto.panelBotonesDelActa.some((b) => b.startsWith('Estilo:')), true, 'el panel perdió el selector de marca')
assert.equal(visto.panelBotonesDelActa.includes('⋯'), true, 'el panel perdió el menú con Eliminar')
// `source` si viaja del lado del equipo: la insignia esta.
assert.equal(visto.panelTextoDelActa.includes('Escrito con IA'), true, 'el panel perdió la insignia de IA')

// ---- El interruptor: apagado → encendido → apagado, mirando el portal en cada paso ------------
await ir('/proyectos/8?tab=configuracion')
await pagina.waitForSelector('#portal-actas')
visto.interruptorAlEntrar = await pagina.$eval('#portal-actas', (n) => n.checked)
visto.textoConfiguracion = await pagina.textContent('body')
await pagina.screenshot({ path: `${SALIDA}/panel-configuracion-portal.png`, fullPage: true })
assert.equal(visto.interruptorAlEntrar, false, 'el flag del Meeting Paper no nació apagado')
assert.equal(visto.textoConfiguracion.includes('Qué ve el cliente'), true, 'falta el bloque del portal')

/** Lo que la API tiene guardado, leido con la cookie del navegador. */
async function flagDelOcho () {
  return await pagina.evaluate(async () => {
    const respuesta = await fetch('/api/bff/projects/8/portal-settings')
    return (await respuesta.json()).data.wiwo_portal_actas
  })
}

await clicar('#portal-actas')
await pagina.waitForFunction(() => document.querySelector('#portal-actas').disabled === false)
visto.flagEncendido = await flagDelOcho()
await pagina.screenshot({ path: `${SALIDA}/panel-configuracion-portal-encendido.png`, fullPage: true })
assert.equal(visto.flagEncendido, true, 'el interruptor no guardó el encendido')

// Del lado del cliente: la pestaña aparece, y aparece vacia porque el 8 no tiene ninguna acta.
await entrarComo(CLIENTA)
await ir('/portal/proyectos/8')
visto.pestaniasDelOchoEncendido = await pestanias()
assert.equal(visto.pestaniasDelOchoEncendido.includes('Meeting Paper'), true, 'la pestaña no apareció')

await ir('/portal/proyectos/8?tab=actas')
await pagina.waitForLoadState('networkidle')
visto.textoActasDelOcho = await pagina.textContent('body')
await pagina.screenshot({ path: `${SALIDA}/portal-actas-vacio.png`, fullPage: true })
assert.equal(/Sin Meeting|No hay|Todav/i.test(visto.textoActasDelOcho), true, 'el proyecto sin actas no dijo nada')
assert.equal(visto.textoActasDelOcho.includes('No se pudo cargar'), false, 'el proyecto sin actas dio error')

// Y se apaga igual de verdad.
await entrarComo(ANA)
await ir('/proyectos/8?tab=configuracion')
await pagina.waitForSelector('#portal-actas')
assert.equal(await pagina.$eval('#portal-actas', (n) => n.checked), true, 'el interruptor no leyó lo guardado')
await clicar('#portal-actas')
await pagina.waitForFunction(() => document.querySelector('#portal-actas').disabled === false)
visto.flagApagado = await flagDelOcho()
assert.equal(visto.flagApagado, false, 'el interruptor no guardó el apagado')

await entrarComo(CLIENTA)
await ir('/portal/proyectos/8')
visto.pestaniasDelOchoApagado = await pestanias()
await pagina.screenshot({ path: `${SALIDA}/portal-proyecto-actas-apagado.png`, fullPage: true })
assert.equal(visto.pestaniasDelOchoApagado.includes('Meeting Paper'), false, 'la pestaña no desapareció')

await ir('/portal/proyectos/8?tab=actas')
await pagina.waitForLoadState('networkidle')
visto.textoActasApagado = await pagina.textContent('body')
// Con el flag apagado la pestaña no existe: pedirla por URL cae a la primera, no a un 403 en pantalla.
assert.equal(visto.textoActasApagado.includes('No se pudo cargar'), false, 'la pestaña apagada dejó un error a la vista')

await navegador.close()

console.log(JSON.stringify(visto, null, 2))
console.log('\nerrores de consola:', errores.length === 0 ? 'ninguno' : errores.slice(0, 10))
console.log('peticiones fallidas:', fallidas.length === 0 ? 'ninguna' : fallidas)

// Los 404 de `/api/bff/presence` y `/api/bff/filter-presets` son huecos preexistentes del mock y solo
// los pide el PANEL. Del lado del cliente no se admite ninguna: una peticion que falla ahi es una
// pestaña que pide lo que su contrato no le da.
const fallidasDelPortal = fallidas.filter((f) => f.includes('@ http://localhost') && f.split('@ ')[1].includes('/portal/'))
assert.deepEqual(fallidasDelPortal, [], 'el portal disparó peticiones que fallaron')
