import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { ESPACIOS } from '../mock/datos.js'

/**
 * Recorre la pestaña Meeting Paper contra Next y la API mock locales.
 *
 * Requiere `pnpm mock` y `pnpm dev` levantados. `ACTA_TEST_URL` cambia el origen,
 * `ACTA_TEST_EMAIL`/`ACTA_TEST_PASSWORD` la sesión.
 *
 * Dos cosas son específicas de este entorno y no adornos:
 *   - Los clics van por `evaluate` y no con `locator.click()`, que acá se cuelga.
 *   - El micrófono se inyecta con los flags de dispositivo falso de Chromium; sin eso `getUserMedia`
 *     abre un diálogo del sistema que ninguna prueba puede contestar.
 */
const destino = new URL(process.env.ACTA_TEST_URL ?? 'http://localhost:3010')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo admite un servidor local.')

const navegador = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
})

/** PNG de 1x1: lo mínimo que un navegador pinta, para probar las miniaturas de los adjuntos. */
const PNG_MINIMO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

/** Clic por `evaluate`: `locator.click()` se cuelga en este entorno. */
async function clicPorTexto (pagina, texto) {
  const encontrado = await pagina.evaluate((buscado) => {
    const nodos = [...document.querySelectorAll('button, a, [role="radio"]')]
    const objetivo = nodos.find((n) => (n.textContent ?? '').trim().includes(buscado))
    if (objetivo === undefined) return false
    objetivo.click()

    return true
  }, texto)

  assert.ok(encontrado, `No se encontró nada que decir "${texto}"`)
}

try {
  const contexto = await navegador.newContext({
    viewport: { width: 1440, height: 1100 },
    permissions: ['microphone']
  })

  const respuesta = await contexto.request.post(new URL('/api/sesion', destino).href, {
    data: {
      email: process.env.ACTA_TEST_EMAIL ?? 'ana@wiwo.me',
      password: process.env.ACTA_TEST_PASSWORD ?? 'mock1234'
    }
  })
  assert.equal(respuesta.status(), 200, 'No se pudo iniciar sesión en el mock')

  const pagina = await contexto.newPage()
  const espacio = ESPACIOS[0]

  // --- La pestaña existe, se llama Meeting Paper, y las Notas volvieron a su nombre.
  await pagina.goto(new URL(`/espacios/${espacio.id}?tab=actas`, destino).href, { waitUntil: 'networkidle' })

  const pestanas = await pagina.evaluate(() =>
    [...document.querySelectorAll('[role="tab"]')].map((t) => (t.textContent ?? '').trim())
  )
  assert.ok(pestanas.includes('Meeting Paper'), `Falta la pestaña: ${pestanas.join(', ')}`)
  assert.ok(pestanas.includes('Notas'), `Las Notas no volvieron a su nombre: ${pestanas.join(', ')}`)

  // --- Generar un acta, viendo el texto aparecer.
  await clicPorTexto(pagina, 'Nuevo Meeting Paper')
  await pagina.waitForFunction(() => document.body.textContent?.includes('Apuntes de la reunión'), { timeout: 10000 })

  await pagina.evaluate(() => {
    const area = document.querySelector('textarea')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(area, 'Reunión con Acme. Se acordó entregar el sitio el 30 de septiembre.')
    area?.dispatchEvent(new Event('input', { bubbles: true }))
  })

  await clicPorTexto(pagina, 'Escribir el Meeting Paper')

  // Mientras se genera, lo que se ve es TEXTO PLANO: pintar HTML a medias rompería el documento.
  await pagina.waitForFunction(() => document.body.textContent?.includes('Escribiendo el Meeting Paper'), { timeout: 10000 })
  const durante = await pagina.evaluate(() => document.body.innerHTML)
  assert.ok(!durante.includes('&lt;h1&gt;'), 'El avance no debe mostrar etiquetas escapadas')

  // Al terminar, el acta ya está guardada y se abre.
  await pagina.waitForFunction(() => document.body.textContent?.includes('Volver a los Meeting Papers'), { timeout: 30000 })
  assert.match(pagina.url(), /acta=\d+/, 'El acta abierta tiene que quedar en la URL')

  // --- El acta se pinta dentro del iframe aislado, nunca en la página.
  //
  // El `sandbox` lleva los dos permisos que "Imprimir" necesita y NINGUNO más. Con el `sandbox`
  // vacío que tenía antes, el padre ni siquiera podía leer `contentWindow.print`: Chromium
  // contestaba `SecurityError` por el origen opaco y el botón no imprimía nada.
  //
  // Lo que esta prueba cuida de verdad es la ausencia de `allow-scripts`. Es el permiso que, junto a
  // `allow-same-origin`, le daría a un acta escrita por un modelo la sesión de quien la lee; sin él
  // el documento no ejecuta ni un `<script>` ni un `onerror`, así que el origen no le sirve a nadie.
  const marco = await pagina.evaluate(() => {
    const iframe = document.querySelector('iframe')
    if (iframe === null) return null

    let alcanzaPrint
    try {
      alcanzaPrint = typeof iframe.contentWindow.print === 'function'
    } catch (fallo) {
      alcanzaPrint = `${fallo.name}: ${fallo.message}`
    }

    return {
      sandbox: iframe.getAttribute('sandbox'),
      tieneSrcDoc: iframe.hasAttribute('srcdoc'),
      alcanzaPrint
    }
  })
  assert.notEqual(marco, null, 'El visor tiene que ser un iframe')
  assert.equal(marco.sandbox, 'allow-same-origin allow-modals', 'El visor perdió o ensanchó su sandbox')
  assert.doesNotMatch(marco.sandbox, /allow-scripts/, 'con `allow-scripts` el acta corre código con la sesión de quien la lee')
  assert.equal(marco.alcanzaPrint, true, '"Imprimir" no puede llamar a print() sobre el visor')
  assert.ok(marco.tieneSrcDoc)

  const html = await pagina.frameLocator('iframe').locator('body').innerHTML()
  assert.ok(html.includes('Meeting Paper'), 'El acta no llegó al iframe')

  // --- El documento se ve como un documento, y con la tipografía de la marca.
  //
  // La fuente entra al iframe solo gracias a la cabecera CORS que `next.config.ts` pone sobre
  // `/fonts/`: el iframe tiene origen opaco, y sin esa cabecera el navegador descarta la fuente EN
  // SILENCIO y el acta cae a la del sistema. Es exactamente la clase de cosa que se rompe en un
  // refactor y nadie nota hasta que alguien imprime un acta.
  const tipografia = await pagina.frameLocator('iframe').locator('h1').first().evaluate((nodo) => ({
    familia: getComputedStyle(nodo).fontFamily,
    tamano: getComputedStyle(nodo).fontSize,
    cargada: [...document.fonts].some((f) => f.family === 'Plus Jakarta Sans' && f.status === 'loaded')
  }))
  assert.ok(tipografia.familia.includes('Plus Jakarta Sans'), 'El documento no declara la tipografía de marca')
  assert.ok(tipografia.cargada, 'La fuente no cargó dentro del iframe: revisa los headers de /fonts/ en next.config.ts')
  assert.equal(tipografia.tamano, '32px', 'El título del acta perdió su jerarquía')

  // --- El editor se carga recién al corregir: es el chunk de 415 KB que no debe pagar quien solo lee.
  await clicPorTexto(pagina, 'Corregir')
  await pagina.waitForFunction(() => document.querySelector('.ProseMirror') !== null, { timeout: 20000 })

  // --- Volver al listado y ver el acta recién creada.
  await clicPorTexto(pagina, 'Descartar cambios')
  await clicPorTexto(pagina, 'Volver a los Meeting Papers')
  await pagina.waitForFunction(() => document.querySelectorAll('table tbody tr').length > 0, { timeout: 15000 })

  const filas = await pagina.evaluate(() =>
    [...document.querySelectorAll('table tbody tr')].map((f) => (f.textContent ?? '').trim())
  )
  assert.ok(filas.length >= 1, 'El acta generada tiene que aparecer en el listado')

  // --- La grabación suelta el micrófono al cambiar de pestaña.
  //
  // Es el bug portado de MeetingMatico: allá las pistas solo se detienen en `onstop`, así que
  // desmontar el componente grabando deja la luz del micrófono encendida hasta cerrar el navegador.
  // Acá desmontar es cambiar de pestaña, o sea que pasa todo el tiempo.
  await pagina.goto(new URL(`/espacios/${espacio.id}?tab=actas&acta=nuevo`, destino).href, { waitUntil: 'networkidle' })

  // Se envuelve `getUserMedia` para quedarse con las pistas y poder mirar su estado después.
  await pagina.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    window.__pistas = []
    navigator.mediaDevices.getUserMedia = async (opciones) => {
      const flujo = await original(opciones)
      window.__pistas.push(...flujo.getTracks())

      return flujo
    }
  })

  await clicPorTexto(pagina, 'Grabar')
  await pagina.evaluate(() => { document.querySelector('[data-prueba=grabar]')?.click() })
  await pagina.waitForFunction(() => window.__pistas?.length > 0, { timeout: 15000 })
  await pagina.waitForFunction(() => document.body.textContent?.includes('Detener'), { timeout: 10000 })

  const grabando = await pagina.evaluate(() => window.__pistas.map((p) => p.readyState))
  assert.deepEqual(grabando, ['live'], 'El micrófono tiene que estar tomado mientras se graba')

  // Cambiar de pestaña desmonta la grabadora.
  await pagina.evaluate(() => {
    const tareas = [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.trim() === 'Tareas')
    tareas?.click()
  })
  await pagina.waitForFunction(
    () => window.__pistas.every((p) => p.readyState === 'ended'),
    { timeout: 10000 }
  )

  const despues = await pagina.evaluate(() => window.__pistas.map((p) => p.readyState))
  assert.deepEqual(despues, ['ended'], 'El micrófono quedó tomado después de cambiar de pestaña')

  // === VARIOS ARCHIVOS, Y QUE QUEDEN GUARDADOS ===
  //
  // Antes el `<input>` no tenía `multiple` y el archivo elegido no se guardaba en ninguna parte: era
  // la fuente de entrada del modelo y moría con la petición. Lo que se recorre acá es lo que cambió:
  // que se puedan elegir varios, que el error de uno malo se entienda y no rompa nada, y que los
  // buenos aparezcan listados en la ficha del acta con su nombre, su Proyecto y su descarga.
  await pagina.goto(new URL(`/espacios/${espacio.id}?tab=actas&acta=nuevo`, destino).href, { waitUntil: 'networkidle' })
  await clicPorTexto(pagina, 'Foto')
  // `[multiple]` acota al campo del asistente: la pantalla monta otro `input[type=file]` oculto.
  await pagina.waitForFunction(() => document.querySelector('input[type=file][multiple]') !== null, { timeout: 10000 })

  const campoArchivos = pagina.locator('input[type=file][multiple]')
  assert.equal(
    await campoArchivos.evaluate((nodo) => nodo.multiple),
    true,
    'El selector tiene que aceptar varios archivos'
  )

  // Un MIME que no se acepta: error claro, y la pantalla sigue en pie.
  await campoArchivos.setInputFiles([
    { name: 'presupuesto.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') }
  ])
  await pagina.waitForFunction(
    () => document.body.textContent?.includes('Solo se aceptan archivos de audio o de imagen'),
    { timeout: 10000 }
  )
  assert.ok(
    await pagina.evaluate(() => document.body.textContent?.includes('Escribir el Meeting Paper')),
    'Un archivo rechazado no puede dejar el formulario inutilizable'
  )

  // Uno bueno y uno pasado de tamaño: se rechaza la selección entera y el mensaje dice CUÁL sobra.
  await campoArchivos.setInputFiles([
    { name: 'pizarra.png', mimeType: 'image/png', buffer: PNG_MINIMO },
    { name: 'enorme.png', mimeType: 'image/png', buffer: Buffer.alloc(26 * 1024 * 1024) }
  ])
  await pagina.waitForFunction(
    () => document.body.textContent?.includes('enorme.png') && document.body.textContent?.includes('25,0 MB'),
    { timeout: 15000 }
  )

  // Ahora tres buenos. El primero es el que lee el asistente y la pantalla lo dice.
  await campoArchivos.setInputFiles([
    { name: 'pizarra.png', mimeType: 'image/png', buffer: PNG_MINIMO },
    { name: 'cuaderno.jpg', mimeType: 'image/jpeg', buffer: PNG_MINIMO },
    { name: 'iphone.heic', mimeType: 'image/heic', buffer: Buffer.from('ftypheic') }
  ])
  await pagina.waitForFunction(
    () => document.body.textContent?.includes('3 archivos') && document.body.textContent?.includes('Este es el que se lee'),
    { timeout: 10000 }
  )

  await clicPorTexto(pagina, 'Escribir el Meeting Paper')
  await pagina.waitForFunction(() => document.body.textContent?.includes('Archivos de la reunión'), { timeout: 30000 })

  const tarjetas = await pagina.evaluate(() => {
    const seccion = [...document.querySelectorAll('section')]
      .find((s) => s.querySelector('h3')?.textContent?.includes('Archivos de la reunión'))

    return [...(seccion?.querySelectorAll('figure') ?? [])].map((figura) => {
      const imagen = figura.querySelector('img')
      const enlace = figura.querySelector('a[download]')
      const caja = figura.getBoundingClientRect()

      return {
        texto: (figura.textContent ?? '').trim(),
        conMiniatura: imagen !== null,
        // Lo que el reclamo pedía: el título y el botón DEBAJO de la imagen, no encima ni al lado.
        tituloBajoLaImagen: imagen === null
          ? null
          : figura.querySelector('figcaption').getBoundingClientRect().top >= imagen.getBoundingClientRect().bottom,
        descarga: enlace?.getAttribute('href') ?? null,
        // Nada puede desbordar su tarjeta: un nombre de archivo sin espacios es el caso que lo hacía.
        desborda: [...figura.querySelectorAll('*')].some((n) => n.getBoundingClientRect().right > caja.right + 1)
      }
    })
  })

  assert.equal(tarjetas.length, 3, `La ficha tiene que listar los tres archivos, listó ${tarjetas.length}`)
  assert.ok(tarjetas.every((t) => t.descarga?.startsWith('/api/bff/files/acta/')), 'La descarga tiene que ir por el BFF, no por /api/v1')
  assert.ok(tarjetas.every((t) => !t.desborda), 'Un adjunto desborda su tarjeta')
  assert.ok(tarjetas.every((t) => t.texto.includes(espacio.name)), 'Falta el nombre del Proyecto junto a la foto')
  assert.ok(tarjetas.every((t) => t.tituloBajoLaImagen !== false), 'El título quedó por encima o al lado de la imagen')

  assert.ok(tarjetas[0].conMiniatura && tarjetas[1].conMiniatura, 'El .png y el .jpg tienen que verse como miniatura')
  // El `.heic` es el caso que obliga a distinguir "es una imagen" de "el navegador la pinta": se
  // acepta al subir porque es lo que sale de un iPhone, y una miniatura rota se lee como corrupto.
  assert.equal(tarjetas[2].conMiniatura, false, 'El .heic no se puede pintar: ningún navegador lo dibuja')
  assert.ok(tarjetas[2].texto.includes('iphone.heic'), 'El .heic tiene que listarse igual, con su nombre y su descarga')

  // La miniatura carga de verdad: un `<img>` con `naturalWidth` 0 es un icono roto.
  const cargaron = await pagina.evaluate(async () => {
    const imagenes = [...document.querySelectorAll('figure img')]
    await Promise.all(imagenes.map((i) => i.complete ? null : new Promise((listo) => { i.onload = listo; i.onerror = listo })))

    return imagenes.map((i) => i.naturalWidth > 0)
  })
  assert.ok(cargaron.length > 0 && cargaron.every(Boolean), 'Alguna miniatura no cargó')

  // A 400 px las tarjetas se apilan en una columna. Lo que se mira acá es que nada se salga: un
  // nombre de archivo largo y sin espacios es exactamente lo que empuja una tarjeta fuera de la
  // pantalla y deja la página con desplazamiento horizontal.
  await pagina.setViewportSize({ width: 400, height: 900 })
  await pagina.waitForTimeout(400)

  const enMovil = await pagina.evaluate(() => {
    const seccion = [...document.querySelectorAll('section')]
      .find((s) => s.querySelector('h3')?.textContent?.includes('Archivos de la reunión'))
    const figuras = [...(seccion?.querySelectorAll('figure') ?? [])]

    return {
      documentoDesborda: document.documentElement.scrollWidth > window.innerWidth,
      // Una sola columna: todas empiezan en la misma x.
      unaColumna: new Set(figuras.map((f) => Math.round(f.getBoundingClientRect().left))).size === 1,
      tarjetaDesborda: figuras.some((f) => {
        const caja = f.getBoundingClientRect()

        return [...f.querySelectorAll('*')].some((n) => n.getBoundingClientRect().right > caja.right + 1)
      })
    }
  })
  assert.equal(enMovil.documentoDesborda, false, 'La ficha del acta desplaza horizontalmente a 400 px')
  assert.equal(enMovil.unaColumna, true, 'A 400 px los adjuntos tienen que apilarse en una columna')
  assert.equal(enMovil.tarjetaDesborda, false, 'Un nombre largo se sale de su tarjeta a 400 px')

  await pagina.setViewportSize({ width: 1440, height: 1100 })

  console.log('Meeting Paper: pestaña, generación en streaming, visor aislado, editor diferido y listado OK')
  console.log(`  ${tarjetas.length} adjuntos listados, con su título y su descarga bajo la imagen`)
  console.log('  la ficha no desplaza horizontalmente a 400 px')
  console.log('  el visor deja imprimir sin dejar correr scripts')
  console.log('  el micrófono se suelta al cambiar de pestaña')
  console.log(`  ${filas.length} acta(s) en la lista`)
} finally {
  await navegador.close()
}
