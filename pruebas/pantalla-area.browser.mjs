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

const TOKEN = 'a'.repeat(64)
const VIEWPORT = { width: 1920, height: 1080 }

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
function paquete ({ personas = 0, cronometros = 0, tareas = 0, proyectos = 0, ritmo = 30 } = {}) {
  return {
    data: {
      area: { id: 7, name: 'Content Studio' },
      scenes: [
        {
          kind: 'portada',
          counts: {
            personas: 14,
            jornadas_abiertas: personas,
            cronometros_corriendo: cronometros,
            procesos_abiertos: tareas,
            procesos_atrasados: tareas,
            espacios_activos: proyectos
          }
        },
        { kind: 'trabajando', items: Array.from({ length: personas }, (_, i) => persona(i + 1)) },
        { kind: 'cronometros', items: Array.from({ length: cronometros }, (_, i) => cronometro(i + 1)) },
        { kind: 'procesos', items: Array.from({ length: tareas }, (_, i) => tarea(i + 1)), total: tareas },
        { kind: 'espacios', items: Array.from({ length: proyectos }, (_, i) => proyecto(i + 1)) }
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
  const contexto = await navegador.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })

  // Ninguna escritura sale de esta prueba, igual que en las demas del proyecto.
  await contexto.route('**/*', async (ruta) => {
    const peticion = ruta.request()

    if (!['GET', 'HEAD', 'OPTIONS'].includes(peticion.method())) {
      await ruta.abort()

      return
    }

    await ruta.continue()
  })

  await conPagina(contexto, async (pagina, errores) => {
    // === 1. Sin scroll en NINGUNA escena, con la pantalla llena ===============================
    //
    // La asercion de mayor valor del archivo: en un televisor nadie hace scroll, asi que lo que no
    // entra desaparece para siempre sin que nadie se entere.
    await sondeoFijo(pagina, paquete({ personas: 40, cronometros: 30, tareas: 60, proyectos: 20 }))
    await abrir(pagina, '?escena=5')

    const escenasVistas = new Set()

    for (let vuelta = 0; vuelta < 14; vuelta++) {
      const medidas = await pagina.evaluate(() => {
        const main = document.querySelector('main')
        const cuerpo = main?.querySelector('section')
        const marco = cuerpo?.getBoundingClientRect()

        // No alcanza con mirar `scrollHeight`: el `overflow: hidden` de la pantalla impide el scroll,
        // asi que un contenido que no entra NO produce barra — simplemente se corta, y la pared se ve
        // perfecta mientras esconde la mitad de la lista. Hay que medir cada ficha contra el marco.
        let recortada = 0
        let ejemplo = ''

        // Solo los hijos directos de la lista principal: los avatares de una Tarea tambien son
        // `li`, y contarlos mediria la ficha contra si misma.
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

      escenasVistas.add(medidas.escena)
      assert.equal(
        medidas.recortada,
        0,
        `La escena "${medidas.escena}" corta ${medidas.recortada} ficha(s), p.ej. "${medidas.ejemplo}": la rejilla dice que entran mas de las que entran.`
      )
      assert.ok(medidas.altoDeMas <= 1, `La escena "${medidas.escena}" desborda a lo alto en ${medidas.altoDeMas}px.`)
      assert.ok(medidas.anchoDeMas <= 1, `La escena "${medidas.escena}" desborda a lo ancho en ${medidas.anchoDeMas}px.`)

      await pagina.waitForTimeout(1200)
    }

    assert.ok(escenasVistas.size >= 3, `La rotacion tiene que pasar por varias escenas; vio ${[...escenasVistas].join(', ')}.`)

    // === 2. La tipografia no se achico para que entrara =======================================
    const minimo = await pagina.evaluate((piso) => {
      let menor = Infinity

      for (const nodo of document.querySelectorAll('main *')) {
        if (nodo.textContent?.trim() === '' || nodo.children.length > 0) continue

        const tamano = Number.parseFloat(getComputedStyle(nodo).fontSize)

        if (Number.isFinite(tamano) && tamano < menor) menor = tamano
      }

      return menor === Infinity ? piso : menor
    }, PISO_TIPOGRAFICO)

    assert.ok(minimo >= PISO_TIPOGRAFICO, `Hay texto de ${minimo}px: no se lee a cuatro metros.`)

    assert.deepEqual(errores, [], `Errores de React o de pagina: ${errores.join(' | ')}`)
  })

  await conPagina(contexto, async (pagina, errores) => {
    // === 3. Un sondeo a mitad de escena NO reinicia la rotacion ===============================
    //
    // Es la regresion que este archivo existe para cazar, y la unica que no se puede deducir mirando
    // el DOM: `data-escena-desde` es el instante en que arranco la escena que se esta viendo.
    let respuesta = paquete({ personas: 3, cronometros: 3 })

    await pagina.route('**/api/pantalla/**', async (ruta) => {
      await ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(respuesta) })
    })

    await abrir(pagina, '?escena=30&refresco=15')

    const antes = await pagina.evaluate(() => ({ ...document.querySelector('main')?.dataset }))

    // Datos distintos, mismas escenas: es exactamente lo que devuelve el sondeo siguiente.
    respuesta = paquete({ personas: 3, cronometros: 3 })
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
        body: JSON.stringify(paquete({ cronometros: 3, ritmo: 5 }))
      })
    })

    await abrir(pagina, '?escena=120&solo=cronometros&refresco=15')

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

    const texto = await pagina.locator('main').innerText()

    assert.ok(texto.includes('Content Studio'), 'Un area dormida muestra al menos su nombre.');
    assert.equal(
      await pagina.locator('main').getAttribute('data-escena'),
      'portada',
      'Sin nada que mostrar queda la portada.'
    )
  })

  await conPagina(contexto, async (pagina) => {
    // === 6. Un token que no sirve, sin filtrar nada ===========================================
    await pagina.goto(new URL('/pantalla/noexiste', destino).href)

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
  await pagina.goto(new URL(`/pantalla/${TOKEN}${query}`, destino).href)

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
