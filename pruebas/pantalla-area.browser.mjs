import assert from 'node:assert/strict'
import { chromium } from 'playwright'

/**
 * Verifica la pantalla de area en un servidor local, con el sondeo stubbeado.
 *
 * Configuracion: PANTALLA_TEST_URL (por defecto http://localhost:3121) y
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE. **No hace falta sesion**: la ruta es publica, asi que se cae toda la
 * maquinaria de `storageState` que arrastran las demas pruebas de navegador.
 *
 * Levantar el servidor con `pnpm build && pnpm start`, NUNCA con `pnpm dev`: en dev la pagina no
 * hidrata, y esta pantalla es toda hidratacion — sin ella no rota, no cuenta y no reconecta.
 *
 * El sondeo pega a `/api/pantalla/<token>`, que es una peticion del navegador, asi que se intercepta
 * con `page.route` y se contesta con fixtures. Eso permite verificar la rotacion, la degradacion y
 * los vacios sin depender de que haya un area con gente trabajando del otro lado.
 */

const destino = new URL(process.env.PANTALLA_TEST_URL ?? 'http://localhost:3121')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo se permite un servidor local de prueba.')
assert.ok(['http:', 'https:'].includes(destino.protocol), 'La URL debe usar HTTP o HTTPS.')

const CODIGO = 'AB3K9'
const TUMBADO = { width: 1920, height: 1080 }
const DE_PIE = { width: 1080, height: 1920 }

/** Tamaño de letra minimo aceptable a 1080p: ver la escala de `MarcoDePantalla`. */
const PISO_TIPOGRAFICO = 28

function persona (id) {
  return {
    staff_id: id,
    name: `Persona ${id} Apellido`,
    avatar: null,
    cargo: 'Cargo de prueba',
    jornada_started_at: new Date(Date.now() - 3600_000).toISOString(),
    last_seen_at: new Date().toISOString()
  }
}

function cronometro (id) {
  return {
    staff_id: id,
    name: `Persona ${id} Apellido`,
    avatar: null,
    started_at: new Date(Date.now() - 900_000).toISOString(),
    task: { id: 100 + id, name: `Tarea larguisima numero ${id} para probar el recorte de una linea` },
    project: { id: 1, name: 'Proyecto de prueba' }
  }
}

function tarea (id) {
  return {
    id,
    name: `Tarea ${id} con un nombre suficientemente largo como para necesitar recorte`,
    status: { id: 4, name: 'En progreso', color: '#eab308' },
    priority: { id: 3, name: 'Alta', color: '#ff6f00' },
    due_date: '2026-09-10',
    overdue: true,
    progress: { checklist_total: 4, checklist_done: 1, percent: 25 },
    project: { id: 1, name: 'Proyecto de prueba' },
    assignees: [{ staff_id: 1, name: 'Persona 1 Apellido', avatar: null }]
  }
}

function proyecto (id) {
  return {
    id,
    name: `Proyecto ${id}`,
    deadline: '2026-10-30',
    progress: 63,
    procesos_abiertos: 7,
    procesos_atrasados: 1
  }
}

/** El paquete que devuelve la API, con el relleno que pida cada caso. */
function paquete ({ personas = 0, cronometros = 0, tareas = 0, proyectos = 0, ritmo = 30, dura = 20 } = {}) {
  return {
    data: {
      area: { id: 7, name: 'Content Studio' },
      scenes: [
        {
          kind: 'portada',
          seconds: dura,
          counts: {
            personas: 14,
            jornadas_abiertas: personas,
            cronometros_corriendo: cronometros,
            procesos_abiertos: tareas,
            procesos_atrasados: tareas,
            espacios_activos: proyectos
          }
        },
        { kind: 'trabajando', seconds: dura, items: Array.from({ length: personas }, (_, i) => persona(i + 1)) },
        { kind: 'cronometros', seconds: dura, items: Array.from({ length: cronometros }, (_, i) => cronometro(i + 1)) },
        { kind: 'procesos', seconds: dura, items: Array.from({ length: tareas }, (_, i) => tarea(i + 1)), total: tareas },
        { kind: 'espacios', seconds: dura, items: Array.from({ length: proyectos }, (_, i) => proyecto(i + 1)) }
      ]
    },
    meta: {
      server_time: new Date().toISOString(),
      timezone: 'America/Santiago',
      poll_after_seconds: ritmo,
      scene_seconds: 5
    }
  }
}

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })

try {
  const contexto = await navegador.newContext({ viewport: TUMBADO, deviceScaleFactor: 1 })

  // Ninguna escritura sale de esta prueba, igual que en las demas del proyecto.
  await contexto.route('**/*', async (ruta) => {
    const peticion = ruta.request()

    if (!['GET', 'HEAD', 'OPTIONS'].includes(peticion.method())) {
      await ruta.abort()

      return
    }

    await ruta.continue()
  })

  // === 1 y 2. Nada se corta, en NINGUNA escena y en las DOS orientaciones ====================
  //
  // Las aserciones de mayor valor del archivo. En un televisor nadie hace scroll, así que lo que no
  // entra no produce barra: `overflow: hidden` simplemente lo corta, y la pared se ve perfecta
  // mientras esconde media lista. Hay que medir cada ficha contra su marco.
  for (const [nombre, medidas] of [['tumbado', TUMBADO], ['de pie', DE_PIE]]) {
    await conPagina(contexto, async (pagina, errores) => {
      await pagina.setViewportSize(medidas)
      await sondeoFijo(pagina, paquete({ personas: 40, cronometros: 30, tareas: 60, proyectos: 20 }))
      // `?escena=2` acelera la vuelta: con este fixture el guion son trece escenas —tres páginas de
      // cada lista— y a veinte segundos cada una, recorrerlas serían más de cuatro minutos.
      await abrir(pagina, '?escena=2')

      const esperada = medidas.height > medidas.width ? 'vertical' : 'horizontal'
      assert.equal(
        await pagina.locator('main').getAttribute('data-orientacion'),
        esperada,
        `Con ${medidas.width}x${medidas.height} la pantalla tiene que reconocerse ${esperada}.`
      )

      const escenasVistas = new Set()
      const clasesVistas = () => new Set([...escenasVistas].map((id) => id.split('#')[0]))

      // Se mide en CADA cambio de escena en vez de muestrear con un reloj: con un intervalo fijo,
      // una escena corta se puede saltar entera y la prueba diría que todo entra sin haberla mirado.
      for (let vuelta = 0; vuelta < 20 && clasesVistas().size < 5; vuelta++) {
        const m = await pagina.evaluate(() => {
          const main = document.querySelector('main')
          const cuerpo = main?.querySelector('section')
          const marco = cuerpo?.getBoundingClientRect()

          let recortada = 0
          let ejemplo = ''

          // Solo los hijos directos de la lista principal: los avatares de una Tarea también son
          // `li`, y contarlos mediría la ficha contra sí misma.
          for (const ficha of cuerpo?.querySelector('ul')?.children ?? []) {
            const caja = ficha.getBoundingClientRect()

            if (marco !== undefined && (caja.bottom > marco.bottom + 1 || caja.top < marco.top - 1)) {
              recortada++
              ejemplo = ficha.textContent?.slice(0, 40) ?? ''
            }
          }

          return {
            escena: main?.dataset.escena ?? '',
            recortada,
            ejemplo,
            altoDeMas: document.documentElement.scrollHeight - window.innerHeight,
            anchoDeMas: document.body.scrollWidth - window.innerWidth
          }
        })

        escenasVistas.add(m.escena)
        assert.equal(
          m.recortada,
          0,
          `${nombre}: la escena "${m.escena}" corta ${m.recortada} ficha(s), p.ej. "${m.ejemplo}": la rejilla dice que entran más de las que entran.`
        )
        assert.ok(m.altoDeMas <= 1, `${nombre}: la escena "${m.escena}" desborda a lo alto en ${m.altoDeMas}px.`)
        assert.ok(m.anchoDeMas <= 1, `${nombre}: la escena "${m.escena}" desborda a lo ancho en ${m.anchoDeMas}px.`)

        const actual = m.escena
        await pagina.waitForFunction(
          (previa) => (document.querySelector('main')?.dataset.escena ?? '') !== previa,
          actual,
          { timeout: 10_000 }
        )
      }

      // Las cinco CLASES, no cinco escenas: con el paginado, tres páginas de la misma lista dirían
      // "cinco" sin haber mirado nunca una Tarea.
      assert.equal(
        clasesVistas().size,
        5,
        `${nombre}: la rotación tiene que recorrer el guion entero; vio ${[...escenasVistas].join(', ')}.`
      )

      // La tipografía no se achicó para que entrara.
      const minimo = await pagina.evaluate((piso) => {
        let menor = Infinity

        for (const nodo of document.querySelectorAll('main *')) {
          if (nodo.textContent?.trim() === '' || nodo.children.length > 0) continue

          const tamano = Number.parseFloat(getComputedStyle(nodo).fontSize)

          if (Number.isFinite(tamano) && tamano < menor) menor = tamano
        }

        return menor === Infinity ? piso : menor
      }, PISO_TIPOGRAFICO)

      assert.ok(minimo >= PISO_TIPOGRAFICO, `${nombre}: hay texto de ${minimo}px: no se lee a cuatro metros.`)
      assert.deepEqual(errores, [], `${nombre}: errores de React o de página: ${errores.join(' | ')}`)
    })
  }

  await conPagina(contexto, async (pagina) => {
    // === 2b. Girar el televisor reacomoda la pantalla sola =====================================
    //
    // Nadie declara la orientación en el panel: si alguien gira el aparato, la página se entera.
    await sondeoFijo(pagina, paquete({ personas: 20, dura: 60 }))
    await abrir(pagina, '')

    assert.equal(await pagina.locator('main').getAttribute('data-orientacion'), 'horizontal')

    await pagina.setViewportSize(DE_PIE)
    await pagina.waitForFunction(
      () => document.querySelector('main')?.dataset.orientacion === 'vertical',
      null,
      { timeout: 5000 }
    )

    await pagina.setViewportSize(TUMBADO)
  })

  await conPagina(contexto, async (pagina, errores) => {
    // === 3. Un sondeo a mitad de escena NO reinicia la rotacion ===============================
    //
    // Es la regresion que este archivo existe para cazar, y la unica que no se puede deducir mirando
    // el DOM: `data-escena-desde` es el instante en que arranco la escena que se esta viendo.
    let respuesta = paquete({ personas: 3, cronometros: 3, dura: 60 })
    let sondeos = 0

    await pagina.route('**/api/pantalla/**', async (ruta) => {
      sondeos++
      await ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(respuesta) })
    })

    // `?escena=120` fija el ritmo para las dos pintadas: la del servidor —que trae los datos del
    // mock, no los del stub— y la del cliente. Sin eso, la escena inicial dura lo que diga el mock y
    // la prueba mediría un cambio de escena legítimo creyendo que fue el sondeo.
    await abrir(pagina, '?escena=120&refresco=15')

    // Y se espera al primer sondeo: hasta que reemplaza los datos del servidor, el guion todavía
    // puede cambiar, y un cambio de guion sí mueve la escena, con razón.
    await pagina.waitForTimeout(1500)
    assert.ok(sondeos > 0, 'El cliente tiene que haber sondeado al montar.')

    const antes = await pagina.evaluate(() => ({ ...document.querySelector('main')?.dataset }))

    // Datos distintos, mismas escenas: es exactamente lo que devuelve el sondeo siguiente.
    respuesta = paquete({ personas: 3, cronometros: 3, dura: 60 })
    await pagina.waitForTimeout(17_000)

    const despues = await pagina.evaluate(() => ({ ...document.querySelector('main')?.dataset }))

    assert.equal(despues.escena, antes.escena, 'Un sondeo no puede cambiar de escena.')
    assert.equal(
      despues.escenaDesde,
      antes.escenaDesde,
      'Un sondeo a mitad de escena reinicio la rotacion: el guion esta acoplado a los datos.'
    )

    assert.deepEqual(errores, [], `Errores de React o de pagina: ${errores.join(' | ')}`)
  })

  await conPagina(contexto, async (pagina) => {
    // === 4. Con la API caida, la pantalla conserva lo que tenia y lo dice =====================
    let caida = false

    await pagina.route('**/api/pantalla/**', async (ruta) => {
      if (caida) {
        await ruta.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"code":"boom"}}' })

        return
      }

      // `ritmo: 5` para que la frescura llegue a "viejo" —tres intervalos— sin esperar minutos. El
      // umbral es relativo al intervalo justamente para que valga igual a treinta segundos que a
      // cinco minutos fuera de horario.
      await ruta.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(paquete({ cronometros: 3, ritmo: 5, dura: 120 }))
      })
    })

    await abrir(pagina, '?solo=cronometros&refresco=15')

    // El ritmo lo manda el `meta`, no el `?refresco=`: ver el comentario de `intervaloMs`.

    const antes = await pagina.locator('main').innerText()

    caida = true
    // Tres intervalos de cinco segundos, mas margen para que el sondeo falle un par de veces.
    await pagina.waitForTimeout(25_000)

    const texto = await pagina.locator('main').innerText()

    assert.ok(texto.includes('Persona 1'), 'El contenido anterior tiene que seguir en pantalla.')
    assert.equal(
      await pagina.locator('main').getAttribute('data-frescura'),
      'viejo',
      'Con los datos rancios la pantalla lo tiene que decir.'
    )

    // El cronometro deja de contar: un numero que sigue trepando con la conexion muerta es mentira.
    //
    // Se comparan SOLO los contadores y no el texto entero: el aviso de frescura aparece en el medio,
    // y compararlo todo haria fallar la asercion por la unica cosa que si tiene que cambiar.
    const uno = await contadores(pagina)
    await pagina.waitForTimeout(3000)
    const otro = await contadores(pagina)

    assert.ok(uno.length > 0, 'Tiene que haber al menos un cronometro en pantalla.')
    assert.deepEqual(uno, otro, 'Con los datos viejos los contadores tienen que quedarse congelados.')
    assert.ok(antes !== '', 'La pantalla tenia contenido antes de la caida.')
  })

  await conPagina(contexto, async (pagina) => {
    // === 5. Un area sin nada no muestra una pantalla en blanco ===============================
    await sondeoFijo(pagina, paquete())
    await abrir(pagina, '')

    // El servidor trae el área con contenido —el mock tiene gente—, así que hay que esperar a que el
    // primer sondeo, que es el stubbeado, la deje vacía. Eso además prueba el camino real: un área
    // que se queda sin nada a las 18:05 no puede quedarse en blanco.
    await pagina.waitForFunction(
      () => document.querySelector('main')?.dataset.escena === 'portada',
      null,
      { timeout: 20_000 }
    )

    const texto = await pagina.locator('main').innerText()

    assert.ok(texto.includes('Content Studio'), 'Un área dormida muestra al menos su nombre.')
  })

  await conPagina(contexto, async (pagina, errores) => {
    // === 5b. Proyectada desde otro aparato =====================================================
    //
    // Castear una pestaña la deja oculta para el navegador en cuanto quien la lanzó cambia de
    // pestaña, aunque el receptor la siga mostrando. Ahí el navegador estrangula los temporizadores
    // a uno por minuto y la pared se congela — pero en el computador se ve perfecta, que es lo que
    // hace al fallo tan difícil de creer.
    //
    // Por eso el reloj vive en un worker dedicado, que no sufre ese freno.
    const workers = []
    pagina.on('worker', (w) => workers.push(w.url()))

    await sondeoFijo(pagina, paquete({ personas: 6, cronometros: 4, tareas: 12 }))
    await abrir(pagina, '?escena=3')

    assert.ok(workers.length > 0, 'El latido tiene que correr en un worker, no en el hilo principal.')

    // Y la página tiene que seguir viva cuando se declara oculta: lo que se comprueba acá es que
    // ningún `visibilitychange` apague la rotación. El estrangulamiento de verdad lo aplica el
    // navegador en un escritorio real, y no se puede reproducir en modo headless — la garantía de
    // eso es estructural, y es el worker.
    await pagina.evaluate(() => {
      Object.defineProperty(document, 'hidden', { get: () => true, configurable: true })
      Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    const vistas = new Set()

    for (let i = 0; i < 8; i++) {
      vistas.add(await pagina.evaluate(() => document.querySelector('main')?.dataset.escena ?? ''))
      await pagina.waitForTimeout(1600)
    }

    assert.ok(
      vistas.size >= 3,
      `Declarada oculta, la pantalla dejó de rotar: solo vio ${[...vistas].join(', ')}.`
    )
    assert.deepEqual(errores, [], `Errores de React o de página: ${errores.join(' | ')}`)
  })

  await conPagina(contexto, async (pagina) => {
    // === 5c. El margen para el overscan se aplica ==============================================
    //
    // Muchos televisores recortan un 3% de la imagen que les llega por HDMI y se comen el reloj de
    // la esquina. No se puede detectar, así que se ajusta a ojo con `?margen=`.
    await sondeoFijo(pagina, paquete({ personas: 6 }))
    await abrir(pagina, '?margen=5')

    const relleno = await pagina.evaluate(() => getComputedStyle(document.querySelector('main')).padding)

    assert.ok(Number.parseFloat(relleno) > 40, `El margen no llegó al contenedor: padding = ${relleno}`)
  })

  await conPagina(contexto, async (pagina) => {
    // === 6. Un código que no sirve, sin filtrar nada ===========================================
    await pagina.goto(new URL('/pantalla/22222', destino).href)

    const texto = await pagina.locator('body').innerText()

    assert.ok(/ya no está enlazada/i.test(texto), 'Tiene que verse la pantalla de enlace inexistente.')
    assert.ok(!/\bat \w+ \(/.test(texto), 'No puede filtrarse una traza de error.')
    assert.ok(!/localhost:\d+\/api\/v1|API_BASE/.test(texto), 'No puede filtrarse la URL de la API.')
  })

  console.log('pantalla-area.browser: OK')
} finally {
  await navegador.close()
}

/** Abre la pantalla con los parametros que se le pasen y espera a que hidrate. */
async function abrir (pagina, query) {
  await pagina.goto(new URL(`/pantalla/${CODIGO}${query}`, destino).href)

  // El servidor no puede traer el paquete en una prueba: `page.route` intercepta al navegador, no al
  // render del servidor. Asi que la pantalla arranca en modo espera y lo primero que se verifica es
  // que el sondeo del cliente la saque de ahi sola, que es exactamente lo que hace en una pared
  // cuando la API vuelve.
  await pagina.waitForFunction(
    () => (document.querySelector('main')?.dataset.escena ?? '') !== '',
    null,
    { timeout: 20_000 }
  )
  // El reloj de pared se rellena en el primer tic: es la señal de que hidrato de verdad.
  await pagina.waitForFunction(() => !document.body.innerText.includes('--:--'), null, { timeout: 15_000 })
}

/** Los tiempos `H:MM:SS` que se ven en pantalla, en orden. */
async function contadores (pagina) {
  const texto = await pagina.locator('main').innerText()

  return texto.match(/\d+:\d{2}:\d{2}/g) ?? []
}

/** Contesta siempre el mismo paquete al sondeo. */
async function sondeoFijo (pagina, cuerpo) {
  await pagina.route('**/api/pantalla/**', async (ruta) => {
    await ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cuerpo) })
  })
}

/** Una pagina nueva con los oyentes de error puestos, y cerrada pase lo que pase. */
async function conPagina (contexto, caso) {
  const pagina = await contexto.newPage()
  const errores = []

  pagina.on('pageerror', (error) => errores.push(error.message))
  pagina.on('console', (mensaje) => {
    if (mensaje.type() === 'error' && /react|hydration|hydrating|unique.*key/i.test(mensaje.text())) {
      errores.push(mensaje.text())
    }
  })

  try {
    await caso(pagina, errores)
  } finally {
    await pagina.close()
  }
}
