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

  // === 1b. El tablero esta alineado y en vertical se le caen columnas ========================
  //
  // Las escenas de lista dejaron de ser fichas y son una tabla de columnas fijas. Lo que la hace
  // legible desde el pasillo es que la fila de rotulos y las quince filas de debajo caigan en el
  // MISMO reparto de columnas; si alguien toca una de las dos plantillas de `pantalla.css` y no la
  // otra, la pantalla sigue viendose bien de lejos y deja de decir la verdad: la fecha queda bajo el
  // rotulo del estado.
  //
  // Y en vertical hay 92vmin de ancho contra 170, asi que algunas columnas se caen a proposito
  // (`portrait:hidden`). Que se caigan es correcto; que no se caiga ninguna significaria que la
  // plantilla vertical no se esta aplicando y que los nombres se estan recortando en silencio.
  for (const clase of ['procesos', 'cronometros', 'espacios']) {
    const celdas = {}

    for (const [nombre, medidas] of [['tumbado', TUMBADO], ['de pie', DE_PIE]]) {
      await conPagina(contexto, async (pagina) => {
        await pagina.setViewportSize(medidas)
        await sondeoFijo(pagina, paquete({ cronometros: 20, tareas: 20, proyectos: 20, dura: 120 }))
        await abrir(pagina, `?solo=${clase}&escena=120`)

        const m = await pagina.evaluate(() => {
          const cuerpo = document.querySelector('main section')
          const rotulos = cuerpo.querySelector('.pantalla-fila')
          const fila = cuerpo.querySelector('ul > li')
          const visibles = (elemento) => [...elemento.children]
            .filter((celda) => getComputedStyle(celda).display !== 'none').length

          return {
            rotulos: getComputedStyle(rotulos).gridTemplateColumns,
            fila: getComputedStyle(fila).gridTemplateColumns,
            celdas: visibles(fila),
            celdasDeRotulos: visibles(rotulos)
          }
        })

        assert.equal(
          m.fila,
          m.rotulos,
          `${nombre}: en "${clase}" los rotulos y las filas no comparten reparto de columnas; el tablero miente.`
        )
        assert.equal(
          m.celdasDeRotulos,
          m.celdas,
          `${nombre}: en "${clase}" hay ${m.celdasDeRotulos} rotulos para ${m.celdas} columnas de datos.`
        )

        celdas[nombre] = m.celdas
      })
    }

    assert.ok(
      celdas['de pie'] < celdas.tumbado,
      `En "${clase}" de pie se ven ${celdas['de pie']} columnas y tumbado ${celdas.tumbado}: la plantilla vertical no se esta aplicando.`
    )
  }

  // === 1c. Lo que no entra se cuenta, y lo dice arriba =======================================
  //
  // Con 200 Tareas abiertas y cuatro paginas de quince, la pared enseña sesenta y esconde el resto.
  // Que las esconda esta bien —es una pared, no un panel—; lo que no puede pasar es que no lo diga.
  // El "+N más" se mudo del pie al titulo cuando las escenas se volvieron tabla: ahi no cuesta una
  // fila de banda util, pero tiene que seguir apareciendo y tiene que seguir siendo cierto.
  await conPagina(contexto, async (pagina, errores) => {
    await pagina.setViewportSize(TUMBADO)
    await sondeoFijo(pagina, paquete({ tareas: 200, dura: 120 }))
    await abrir(pagina, '?solo=procesos&escena=5')

    // El "+N más" lo lleva la ULTIMA pagina, que es donde el corte ocurre de verdad: en la primera
    // no hay nada escondido todavia, y anunciarlo ahi seria mentir al reves. Asi que hay que esperar
    // a que la rotacion llegue a `procesos#4`, la cuarta y ultima que `TOPE_DE_PAGINAS` permite.
    await pagina.waitForFunction(
      () => document.querySelector('main')?.dataset.escena === 'procesos#4',
      null,
      { timeout: 40_000 }
    )

    const m = await pagina.evaluate(() => {
      const cuerpo = document.querySelector('main section')
      const marco = cuerpo.getBoundingClientRect()
      const filas = [...cuerpo.querySelector('ul').children]

      return {
        texto: cuerpo.innerText,
        filas: filas.length,
        recortada: filas.some((fila) => fila.getBoundingClientRect().bottom > marco.bottom + 1)
      }
    })

    // Las paginas del guion son `TOPE_DE_PAGINAS`, y cada una lleva la rejilla horizontal entera.
    const mostradas = 4 * m.filas
    assert.ok(m.filas > 10, `Una pagina de Tareas tiene que traer mas de diez filas; trajo ${m.filas}.`)
    assert.ok(!m.recortada, 'Con la lista llena, la ultima fila se sale del marco.')
    assert.ok(
      m.texto.includes(`+${200 - mostradas} más`),
      `La escena esconde ${200 - mostradas} Tareas y no lo dice; el titulo decia: ${m.texto.split('\n')[0]}`
    )
    assert.deepEqual(errores, [], `Errores de React o de pagina: ${errores.join(' | ')}`)
  })

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

    // `transicion=ninguna` clava la fase de `CeldaQueAlterna` en su dato principal. Sin eso, la
    // asercion de mas abajo busca "Persona 1" en una celda que la mitad del tiempo muestra la hora de
    // arranque, y el resultado de la prueba pasa a depender de en que segundo del ciclo se mire.
    await abrir(pagina, '?solo=cronometros&refresco=15&transicion=ninguna')

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

  // === 7. La escena `momento`: entra con el reloj y sale con el reloj ========================
  //
  // Es la unica escena que no depende de que haya datos sino de que hora es. Lo que se comprueba acá
  // es lo que no se puede ver en `node --test`: que el reloj de 22vmin y su frase caben en las dos
  // orientaciones sin desbordar, y que la escena desaparece del guion cuando la zona del negocio dice
  // que no es hora — que es lo que impide que la pared gaste una escena de cada vuelta en un reloj
  // mudo, todo el dia.
  for (const [nombre, medidas] of [['tumbado', TUMBADO], ['de pie', DE_PIE]]) {
    await conPagina(contexto, async (pagina, errores) => {
      await pagina.setViewportSize(medidas)
      await sondeoFijo(pagina, paqueteConEscenasNuevas(zonaDondeSonLas(13), [], { personas: 4 }))
      // `?escena=2` fija el ritmo desde el primer render, tambien para el paquete que trajo el
      // servidor: sin el, la vuelta empieza con las duraciones reales y llegar a `momento` tarda mas
      // de lo que ninguna espera razonable aguanta.
      await abrir(pagina, '?escena=2')
      await llegarA(pagina, 'momento')

      const m = await medirEscena(pagina)

      assert.equal(m.escena, 'momento#almuerzo', `${nombre}: a las 13 locales toca el mensaje de almuerzo.`)
      assert.equal(m.recortada, 0, `${nombre}: la escena "momento" corta ${m.recortada} pieza(s).`)
      assert.ok(m.altoDeMas <= 1, `${nombre}: "momento" desborda a lo alto en ${m.altoDeMas}px.`)
      assert.ok(m.anchoDeMas <= 1, `${nombre}: "momento" desborda a lo ancho en ${m.anchoDeMas}px.`)
      assert.ok(m.menor >= PISO_TIPOGRAFICO, `${nombre}: "momento" tiene texto de ${m.menor}px.`)
      assert.match(m.texto, /almuerzo/i, `${nombre}: tiene que verse el mensaje de la franja.`)
      assert.match(m.texto, /\d{2}:\d{2}/, `${nombre}: tiene que verse el reloj grande.`)
      // El reloj de la cabecera y el de la escena son el mismo minuto: los dos se ven a la vez.
      const cabecera = await pagina.locator('header p').last().innerText()
      assert.ok(m.texto.includes(cabecera.trim()), `${nombre}: los dos relojes de la pared no coinciden.`)
      assert.deepEqual(errores, [], `${nombre}: errores de React: ${errores.join(' | ')}`)
    })
  }

  await conPagina(contexto, async (pagina) => {
    // Fuera de franja la escena no existe: se recorre el guion entero y `momento` no aparece.
    await sondeoFijo(pagina, paqueteConEscenasNuevas(zonaDondeSonLas(16), [], { personas: 4, cronometros: 3 }))
    await abrir(pagina, '?escena=2')

    // El paquete que trajo el SERVIDOR viene del mock y con la zona del negocio, no con la de esta
    // prueba. Hay que esperar a que el primer sondeo del cliente la reemplace: si no, durante unos
    // milisegundos la pantalla decide la franja con la zona equivocada, y esta comprobación se
    // volvería intermitente según la hora a la que alguien la corra.
    await pagina.waitForFunction(
      () => /(^|[^\d])16:\d{2}/.test(document.querySelector('header')?.innerText ?? ''),
      null,
      { timeout: 15_000 }
    )

    const vistas = new Set()

    for (let vuelta = 0; vuelta < 10; vuelta++) {
      const actual = await pagina.locator('main').getAttribute('data-escena')
      vistas.add((actual ?? '').split('#')[0])

      await pagina.waitForFunction(
        (previa) => (document.querySelector('main')?.dataset.escena ?? '') !== previa,
        actual,
        { timeout: 10_000 }
      )
    }

    assert.ok(!vistas.has('momento'), `A las 16 locales "momento" no puede estar en el guion; vio ${[...vistas].join(', ')}.`)
    assert.ok(vistas.has('portada'), 'La vuelta tiene que seguir corriendo con el resto de escenas.')
  })

  // === 8. La escena `anuncios`: un aviso por pantalla ========================================
  //
  // Cada anuncio es un slide propio y lo escribio una persona, asi que el texto llega con el largo que
  // llegue y la imagen con la proporcion que tenga. Lo que se mide es que ninguno de los tres formatos
  // desborde en ninguna de las dos orientaciones, y que la letra no se haya achicado por debajo del
  // piso para conseguirlo.
  for (const [nombre, medidas] of [['tumbado', TUMBADO], ['de pie', DE_PIE]]) {
    await conPagina(contexto, async (pagina, errores) => {
      await pagina.setViewportSize(medidas)
      await sondeoFijo(pagina, paqueteConEscenasNuevas(
        zonaDondeSonLas(16),
        [
          anuncio(1, 'imagen_con_texto'),
          anuncio(2, 'texto', { texto: 'El lunes no se trabaja: es feriado. ' .repeat(30) }),
          anuncio(3, 'imagen')
        ],
      ))
      await abrir(pagina, '?solo=anuncios&escena=2')

      const vistos = new Set()

      for (let vuelta = 0; vuelta < 8 && vistos.size < 3; vuelta++) {
        const m = await medirEscena(pagina)

        vistos.add(m.escena)
        assert.equal(m.recortada, 0, `${nombre}: el anuncio "${m.escena}" corta ${m.recortada} pieza(s).`)
        assert.ok(m.altoDeMas <= 1, `${nombre}: "${m.escena}" desborda a lo alto en ${m.altoDeMas}px.`)
        assert.ok(m.anchoDeMas <= 1, `${nombre}: "${m.escena}" desborda a lo ancho en ${m.anchoDeMas}px.`)
        assert.ok(m.menor >= PISO_TIPOGRAFICO, `${nombre}: "${m.escena}" tiene texto de ${m.menor}px: no se lee a cuatro metros.`)

        await pagina.waitForFunction(
          (previa) => (document.querySelector('main')?.dataset.escena ?? '') !== previa,
          m.escena,
          { timeout: 10_000 }
        )
      }

      assert.deepEqual(
        [...vistos].sort(),
        ['anuncios#1', 'anuncios#2', 'anuncios#3'],
        `${nombre}: cada anuncio tiene que ser un slide propio; vio ${[...vistos].join(', ')}.`
      )
      assert.deepEqual(errores, [], `${nombre}: errores de React: ${errores.join(' | ')}`)
    })
  }

  await conPagina(contexto, async (pagina) => {
    // La imagen no carga —el televisor se quedo sin red a mitad de ciclo— y el slide NO puede quedarse
    // en blanco veinte segundos. Debajo hay siempre una capa con lo que se pueda decir sin ella.
    await sondeoFijo(pagina, paqueteConEscenasNuevas(
      zonaDondeSonLas(16),
      [
        anuncio(1, 'imagen_con_texto', { imagen: '/esta-imagen-no-existe-nunca.png' }),
        anuncio(2, 'imagen', { imagen: '/esta-imagen-tampoco.png' })
      ]
    ))
    await abrir(pagina, '?solo=anuncios&escena=2')

    for (const esperado of [/Anuncio 1/, /No pudimos cargar la imagen/]) {
      const visto = await pagina.waitForFunction(
        (patron) => {
          const texto = document.querySelector('main section')?.innerText ?? ''

          return new RegExp(patron).test(texto) ? texto : false
        },
        esperado.source,
        { timeout: 20_000 }
      )

      assert.ok(await visto.jsonValue(), `Con la imagen caída tiene que verse el respaldo (${esperado}).`)
    }
  })

  await conPagina(contexto, async (pagina) => {
    // === 9. La pantalla global: la misma pared sin area que nombrar =============================
    //
    // Llega con `data.area.id` en `null` y el nombre de la compañia. Todo se dibuja igual; lo unico
    // que cambia es que ningun rotulo puede decir "del área", porque ahi no hay ninguna.
    const global = paqueteConEscenasNuevas(zonaDondeSonLas(16), [], { tareas: 8 })
    global.data.area = { id: null, name: 'WiWO' }

    await sondeoFijo(pagina, global)
    await abrir(pagina, '?solo=procesos&escena=2')

    const texto = await pagina.locator('main').innerText()

    assert.match(texto, /de la compañía/i, 'La pantalla global tiene que nombrarse como la compañía.')
    assert.ok(!/del área/i.test(texto), 'La pantalla global no puede decir "del área": no hay ninguna.')
    assert.match(await pagina.locator('header h1').innerText(), /WiWO/i, 'La cabecera lleva el nombre de la compañía.')
  })

  console.log('pantalla-area.browser: OK')
} finally {
  await navegador.close()
}


/**
 * Una zona IANA en la que AHORA MISMO es esa hora en punto.
 *
 * === POR QUE ESTO Y NO UN RELOJ FALSO ===
 *
 * La escena `momento` solo existe tres veces al dia. Para verla en el navegador hay dos caminos:
 * falsear el reloj, o mover la zona. Falsearlo no sirve: el instante que usa la pantalla lo emite el
 * worker del latido con su propio `Date.now()`, y ni `page.clock` ni un `addInitScript` llegan a un
 * worker dedicado. La zona, en cambio, viaja en `meta.timezone` del paquete — que esta prueba ya
 * controla— y es exactamente la pieza que decide el mensaje.
 *
 * Se eligen zonas `Etc/GMT±N`, que son desfases fijos y enteros respecto de UTC: cualquiera que sea la
 * hora real, hay una en la que son las 13 en punto, y como el desfase no lleva minutos, el minuto
 * local es el mismo minuto real. Por eso las comprobaciones de navegador usan la franja de almuerzo,
 * que dura una hora entera: las de las 09:00 y las 18:00 duran media y solo valdrian la mitad de las
 * veces que se corra esta prueba. Sus bordes se prueban en `pruebas/momento-del-dia.test.js`, que es
 * donde corresponde — la funcion es pura y ahi la hora se pasa como argumento.
 */
function zonaDondeSonLas (hora) {
  for (let desfase = -12; desfase <= 14; desfase++) {
    // `Etc/GMT+5` es UTC-5: el signo va al reves, es asi en la base de datos de husos desde siempre.
    const zona = `Etc/GMT${desfase <= 0 ? '+' : '-'}${Math.abs(desfase)}`
    const local = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', hourCycle: 'h23' }).format(new Date())
    )

    if (local === hora) return zona
  }

  throw new Error(`No hay ninguna zona Etc/GMT en la que sean las ${hora}.`)
}

/** Un anuncio del formato que se pida. La imagen la sirve el propio servidor de prueba. */
function anuncio (id, tipo, { imagen = '/plantillas/guia-imagen-entidad.png', texto } = {}) {
  const largo = texto ?? 'Viernes 26 a las 18:00 en la terraza. Avisa si vas con acompañante, que hay que contar las sillas.'

  return {
    id,
    tipo,
    titulo: tipo === 'imagen' ? null : `Anuncio ${id} con un título razonablemente largo`,
    texto: tipo === 'imagen' ? null : largo,
    image_url: tipo === 'texto' ? null : imagen
  }
}

/**
 * El mismo paquete, con las dos escenas que se resuelven en el televisor.
 *
 * @param zona     la zona que viaja en `meta`: decide si `momento` entra al guion y con que mensaje
 * @param anuncios los anuncios vigentes; `[]` deja la escena fuera del guion
 */
function paqueteConEscenasNuevas (zona, anuncios, opciones = {}) {
  const base = paquete(opciones)

  base.data.scenes.push({ kind: 'momento', seconds: opciones.dura ?? 20 })
  base.data.scenes.push({ kind: 'anuncios', seconds: opciones.dura ?? 20, items: anuncios })
  base.meta.timezone = zona

  return base
}

/** Mide lo que se sale del marco de la escena y cual es el texto mas chico que hay en pantalla. */
async function medirEscena (pagina) {
  return await pagina.evaluate(() => {
    const main = document.querySelector('main')
    const cuerpo = main?.querySelector('section')
    const marco = cuerpo?.getBoundingClientRect()

    let recortada = 0

    for (const hijo of cuerpo?.querySelectorAll('p, img, h2') ?? []) {
      const caja = hijo.getBoundingClientRect()

      if (caja.width === 0 && caja.height === 0) continue

      if (marco !== undefined && (caja.bottom > marco.bottom + 1 || caja.top < marco.top - 1 ||
        caja.right > marco.right + 1 || caja.left < marco.left - 1)) {
        recortada++
      }
    }

    let menor = Infinity
    for (const nodo of document.querySelectorAll('main *')) {
      if (nodo.textContent?.trim() === '' || nodo.children.length > 0) continue

      const tamano = Number.parseFloat(getComputedStyle(nodo).fontSize)

      if (Number.isFinite(tamano) && tamano < menor) menor = tamano
    }

    return {
      escena: main?.dataset.escena ?? '',
      recortada,
      menor,
      texto: cuerpo?.innerText ?? '',
      altoDeMas: document.documentElement.scrollHeight - window.innerHeight,
      anchoDeMas: document.body.scrollWidth - window.innerWidth
    }
  })
}

/** Lleva la rotacion hasta la escena cuyo id empiece por `clase`, o falla diciendo que no llego. */
async function llegarA (pagina, clase) {
  await pagina.waitForFunction(
    (buscada) => (document.querySelector('main')?.dataset.escena ?? '').split('#')[0] === buscada,
    clase,
    { timeout: 30_000 }
  )
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
