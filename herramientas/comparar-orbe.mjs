/*
 * Vara objetiva para decidir si nuestro Thinking Orb se parece al de neo.wiwo.me.
 *
 * El problema que resuelve: la comparacion se venia haciendo a ojo y fallaba. Un orbe "pastel" y uno
 * "campo de luz" se describen igual en palabras ("un circulo con degradado verde y azul") pero se
 * separan solos en cuatro numeros: saturacion, luminosidad, varianza por canal y proporcion.
 *
 * La referencia NO esta hardcodeada: se mide neo.wiwo.me en vivo en cada corrida y los umbrales son
 * relativos a lo que Neo de ese dia. Asi la vara no se pudre cuando Neo cambie.
 *
 * Uso:
 *   pnpm dev -p 3500            # en otra terminal
 *   node herramientas/comparar-orbe.mjs
 *
 * Salida: metricas y veredicto por consola, y `comparacion.png` con las capturas lado a lado.
 */
import { writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const URL_NEO = process.env.ORBE_URL_NEO ?? 'https://neo.wiwo.me/'
const URL_LOCAL = process.env.ORBE_URL_LOCAL ?? 'http://localhost:3500/taller'
/*
 * Se ancla en el escenario pero se mide el orbe que vive adentro. El `.thinking-orb-stage` de Neo es
 * un marco de 473x590 con el fondo del showcase pegado atras: medir eso seria medir el fondo, no el
 * orbe. El `.wiwo-thinking-orb` es la elipse real, la que tiene la proporcion ~1.13 y el blend.
 *
 * Los dos nombres de escenario conviven a proposito: `.thinking-orb-stage` es el de neo.wiwo.me y
 * `.orbe-escenario` el del componente de este proyecto. Asi el mismo selector sirve para los dos
 * lados de la comparacion sin ramificar el resto del script.
 */
const SELECTOR_ESCENARIO = '.thinking-orb-stage, .orbe-escenario'
const SELECTOR_ORBE = '.thinking-orb-stage .wiwo-thinking-orb, .orbe-escenario .wiwo-thinking-orb'
const ARCHIVO_SALIDA = process.env.ORBE_SALIDA ?? 'comparacion.png'

/* Margenes de red generosos: neo.wiwo.me es una pagina con animaciones y fuentes remotas. */
const MS_CARGA = 90_000
const MS_SONDEO_LOCAL = 3_000
/* El orbe anima. Sin esta espera se captura el primer cuadro, que todavia no tiene el campo de luz. */
const MS_ASENTADO = 1_500

/*
 * Umbrales. Todos son distancias contra Neo medido en la misma corrida, no valores absolutos.
 *
 * - COLOR: 60 sobre una distancia euclidiana en RGB (max ~441). Por debajo de eso, dos colores se
 *   leen como "el mismo color con otra iluminacion"; por encima, como colores distintos.
 * - SATURACION / LUMINOSIDAD: 0.15 y 0.12 en escala 0..1. Son las dos metricas que delatan el lavado:
 *   un pastel baja la saturacion y sube la luminosidad al mismo tiempo. La luminosidad se tolera
 *   menos porque un fondo claro detras del orbe ya la empuja hacia arriba sin que el orbe cambie.
 * - VARIANZA: el nuestro tiene que alcanzar al menos el 65% de la desviacion estandar de Neo. Es la
 *   metrica que separa un campo de luz (mucha varianza: nucleos, halos, causticas) de un degradado
 *   radial plano (poca). No hay tope superior: pasarse de intenso no es el modo de falla que tenemos.
 * - PROPORCION: 0.05 sobre ancho/alto. El de Neo es una elipse de ~1.144; si el nuestro da ~1.0 es un
 *   circulo y esta mal por construccion, no por color.
 */
const UMBRALES = {
  distanciaColor: 60,
  deltaSaturacion: 0.15,
  deltaLuminosidad: 0.12,
  fraccionVarianza: 0.65,
  deltaProporcion: 0.05
}

/**
 * Espera a que el servidor local responda, y aborta con instrucciones si no esta levantado.
 *
 * Se sondea antes de abrir el navegador para no gastar 30 segundos de arranque de Chromium ni tirar
 * un stack trace de Playwright cuando la causa real es que nadie corrio `pnpm dev`.
 *
 * @param {string} url URL a sondear.
 * @throws {Error} Si el servidor no responde.
 */
async function exigirServidorLocal (url) {
  const origen = new URL(url).origin
  try {
    await fetch(origen, { signal: AbortSignal.timeout(MS_SONDEO_LOCAL) })
  } catch {
    throw new Error(
      `No hay nada escuchando en ${origen}.\n` +
      '  Levantalo en otra terminal con:  pnpm dev -p 3500\n' +
      '  y volve a correr:                node herramientas/comparar-orbe.mjs'
    )
  }
}

/**
 * Abre una URL y captura el orbe: su PNG, su caja real y su proporcion.
 *
 * La proporcion se toma del `getBoundingClientRect` y no del PNG porque despues las capturas se
 * normalizan a un mismo tamaño para comparar color, y ahi la proporcion original se pierde.
 *
 * Cuando hay varios orbes en la pagina (el taller muestra una docena) se elige el de mayor area:
 * es el que tiene mas pixeles reales y por lo tanto la medicion menos ruidosa.
 *
 * @param {import('playwright').Browser} navegador Navegador ya lanzado.
 * @param {string} url Pagina a abrir.
 * @param {'light'|'dark'} tema Esquema de color a forzar.
 * @returns {Promise<{ png: Buffer, ancho: number, alto: number, proporcion: number }>}
 * @throws {Error} Si la pagina no contiene el selector del orbe.
 */
async function capturarOrbe (navegador, url, tema) {
  const contexto = await navegador.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: tema,
    deviceScaleFactor: 1
  })
  const pagina = await contexto.newPage()
  try {
    await pagina.goto(url, { waitUntil: 'networkidle', timeout: MS_CARGA })
    /* `colorScheme` solo mueve la media query; el tema del proyecto lo decide `data-theme`. */
    await pagina.evaluate((valor) => { document.documentElement.dataset.theme = valor }, tema)

    const cajas = await pagina.$$eval(SELECTOR_ORBE, (elementos) =>
      elementos.map((el, indice) => {
        const r = el.getBoundingClientRect()
        return { indice, ancho: r.width, alto: r.height }
      })
    )
    if (cajas.length === 0) {
      const escenarios = await pagina.locator(SELECTOR_ESCENARIO).count()
      throw new Error(
        `No existe ningun \`${SELECTOR_ORBE}\` en ${url}.\n` +
        `  Escenarios \`${SELECTOR_ESCENARIO}\` encontrados: ${escenarios}.\n` +
        '  Si el escenario esta pero el orbe no, cambio el nombre de la clase del orbe.'
      )
    }

    const mayor = cajas.reduce((a, b) => (a.ancho * a.alto >= b.ancho * b.alto ? a : b))
    const elemento = pagina.locator(SELECTOR_ORBE).nth(mayor.indice)

    /*
     * Scroll a mano y recorte por caja, en vez de `scrollIntoViewIfNeeded` + `elemento.screenshot()`:
     * esas dos APIs esperan a que el elemento quede quieto, y el orbe nunca queda quieto — su
     * `border-radius` muta en cada cuadro. Con espera de estabilidad la captura se cuelga siempre.
     */
    await elemento.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await pagina.waitForTimeout(MS_ASENTADO)

    const caja = await elemento.boundingBox()
    if (caja === null) throw new Error(`El orbe de ${url} no es visible: no tiene caja para capturar.`)
    const recorte = {
      x: Math.round(caja.x),
      y: Math.round(caja.y),
      width: Math.round(caja.width),
      height: Math.round(caja.height)
    }

    return {
      png: await pagina.screenshot({ clip: recorte }),
      ancho: recorte.width,
      alto: recorte.height,
      proporcion: +(recorte.width / recorte.height).toFixed(3)
    }
  } finally {
    await contexto.close()
  }
}

/**
 * Extrae las metricas de pixel de una captura, normalizandola a un tamaño comun.
 *
 * Los pixeles se leen con un `<canvas>` en una pagina en blanco a proposito: agregar `sharp` o `jimp`
 * seria una dependencia nativa entera para hacer lo que el navegador que ya tenemos abierto hace
 * gratis. El escalado a un tamaño unico es lo que permite comparar dos orbes de distinto tamaño sin
 * que el mas grande pese mas en los promedios.
 *
 * @param {import('playwright').Page} lienzo Pagina en blanco reutilizable.
 * @param {Buffer} png Captura del orbe.
 * @param {{ ancho: number, alto: number }} destino Tamaño al que normalizar.
 * @returns {Promise<{ rgb: number[], saturacion: number, luminosidad: number, desvio: number[] }>}
 */
async function medirPixeles (lienzo, png, destino) {
  const uri = `data:image/png;base64,${png.toString('base64')}`
  return lienzo.evaluate(async ({ uri, destino }) => {
    const imagen = new Image()
    imagen.src = uri
    await imagen.decode()

    const canvas = document.createElement('canvas')
    canvas.width = destino.ancho
    canvas.height = destino.alto
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(imagen, 0, 0, destino.ancho, destino.alto)
    const datos = ctx.getImageData(0, 0, destino.ancho, destino.alto).data

    const suma = [0, 0, 0]
    const sumaCuadrados = [0, 0, 0]
    let sumaSaturacion = 0
    let sumaLuminosidad = 0
    const total = datos.length / 4

    for (let i = 0; i < datos.length; i += 4) {
      const canales = [datos[i], datos[i + 1], datos[i + 2]]
      for (let c = 0; c < 3; c += 1) {
        suma[c] += canales[c]
        sumaCuadrados[c] += canales[c] * canales[c]
      }
      /* HSL a mano y no una funcion importada: este bloque corre dentro del navegador y no
       * ve el modulo. Solo se necesitan S y L: el tono promedio de dos orbes distintos coincide. */
      const max = Math.max(...canales) / 255
      const min = Math.min(...canales) / 255
      const luminosidad = (max + min) / 2
      const cromatico = max - min
      sumaLuminosidad += luminosidad
      sumaSaturacion += cromatico === 0 ? 0 : cromatico / (1 - Math.abs(2 * luminosidad - 1))
    }

    const rgb = suma.map((s) => s / total)
    const desvio = sumaCuadrados.map((sc, c) => Math.sqrt(Math.max(0, sc / total - rgb[c] ** 2)))
    return {
      rgb: rgb.map((v) => +v.toFixed(1)),
      desvio: desvio.map((v) => +v.toFixed(1)),
      saturacion: +(sumaSaturacion / total).toFixed(3),
      luminosidad: +(sumaLuminosidad / total).toFixed(3)
    }
  }, { uri, destino })
}

/**
 * Distancia euclidiana entre dos colores RGB.
 *
 * @param {number[]} a Color de referencia.
 * @param {number[]} b Color medido.
 * @returns {number} Distancia 0..441.
 */
function distanciaRgb (a, b) {
  return Math.sqrt(a.reduce((acc, v, i) => acc + (v - b[i]) ** 2, 0))
}

/**
 * Promedio simple de un vector, para colapsar la desviacion de los tres canales en un solo numero.
 *
 * @param {number[]} valores Valores a promediar.
 * @returns {number} Promedio.
 */
function promedio (valores) {
  return valores.reduce((a, b) => a + b, 0) / valores.length
}

/**
 * Arma la tabla de veredictos de una captura nuestra contra la referencia de Neo.
 *
 * Devuelve datos y no texto para que la impresion quede en un solo lugar y el mismo calculo se pueda
 * reusar despues (por ejemplo desde una prueba) sin parsear consola.
 *
 * @param {object} neo Metricas y proporcion de la referencia.
 * @param {object} nuestro Metricas y proporcion de nuestro orbe.
 * @returns {{ metrica: string, valor: string, referencia: string, ok: boolean, umbral: string, porque: string }[]}
 */
function evaluar (neo, nuestro) {
  const dColor = distanciaRgb(neo.rgb, nuestro.rgb)
  const dSat = nuestro.saturacion - neo.saturacion
  const dLum = nuestro.luminosidad - neo.luminosidad
  const varNeo = promedio(neo.desvio)
  const varNuestra = promedio(nuestro.desvio)
  const fraccion = varNeo === 0 ? 1 : varNuestra / varNeo
  const dProp = nuestro.proporcion - neo.proporcion

  return [
    {
      metrica: 'color promedio',
      valor: `rgb(${nuestro.rgb.join(', ')})`,
      referencia: `rgb(${neo.rgb.join(', ')})  dist ${dColor.toFixed(1)}`,
      ok: dColor <= UMBRALES.distanciaColor,
      umbral: `dist <= ${UMBRALES.distanciaColor}`,
      porque: 'el color medio del campo de luz; si se aleja, la mezcla de verde y azul no es la misma'
    },
    {
      metrica: 'saturacion',
      valor: nuestro.saturacion.toFixed(3),
      referencia: `${neo.saturacion.toFixed(3)}  delta ${dSat >= 0 ? '+' : ''}${dSat.toFixed(3)}`,
      ok: Math.abs(dSat) <= UMBRALES.deltaSaturacion,
      umbral: `|delta| <= ${UMBRALES.deltaSaturacion}`,
      porque: 'saturacion baja = pastel lavado; es la mitad del sintoma que se rechazo a ojo'
    },
    {
      metrica: 'luminosidad',
      valor: nuestro.luminosidad.toFixed(3),
      referencia: `${neo.luminosidad.toFixed(3)}  delta ${dLum >= 0 ? '+' : ''}${dLum.toFixed(3)}`,
      ok: Math.abs(dLum) <= UMBRALES.deltaLuminosidad,
      umbral: `|delta| <= ${UMBRALES.deltaLuminosidad}`,
      porque: 'luminosidad alta = el orbe se disuelve en la superficie clara en vez de emitir luz'
    },
    {
      metrica: 'desvio estandar',
      valor: `${varNuestra.toFixed(1)} (${nuestro.desvio.join('/')})`,
      referencia: `${varNeo.toFixed(1)} (${neo.desvio.join('/')})  ${(fraccion * 100).toFixed(0)}% de Neo`,
      ok: fraccion >= UMBRALES.fraccionVarianza,
      umbral: `>= ${(UMBRALES.fraccionVarianza * 100).toFixed(0)}% del desvio de Neo`,
      porque: 'un campo de luz tiene nucleos y halos (mucha varianza); un degradado plano no'
    },
    {
      metrica: 'proporcion',
      valor: nuestro.proporcion.toFixed(3),
      referencia: `${neo.proporcion.toFixed(3)}  delta ${dProp >= 0 ? '+' : ''}${dProp.toFixed(3)}`,
      ok: Math.abs(dProp) <= UMBRALES.deltaProporcion,
      umbral: `|delta| <= ${UMBRALES.deltaProporcion}`,
      porque: 'Neo es una elipse ancha; si da ~1.000 nuestro orbe es un circulo y esta mal de forma'
    }
  ]
}

/**
 * Imprime el bloque de una comparacion: cabecera, tabla de metricas y resumen.
 *
 * @param {string} titulo Nombre de la variante comparada.
 * @param {object} neo Metricas de referencia.
 * @param {object} nuestro Metricas medidas.
 * @returns {boolean} `true` si todas las metricas dieron OK.
 */
function informar (titulo, neo, nuestro) {
  const filas = evaluar(neo, nuestro)
  console.log(`\n── ${titulo} ${'─'.repeat(Math.max(0, 62 - titulo.length))}`)
  console.log(`   tamaño: ${nuestro.ancho}x${nuestro.alto} px   (Neo: ${neo.ancho}x${neo.alto} px)`)
  for (const f of filas) {
    console.log(`   ${f.ok ? 'OK   ' : 'FALLA'} ${f.metrica.padEnd(17)} ${f.valor.padEnd(26)} vs ${f.referencia}`)
    console.log(`         umbral ${f.umbral} — ${f.porque}`)
  }
  const fallas = filas.filter((f) => !f.ok)
  console.log(`   → ${fallas.length === 0 ? 'PASA' : `FALLA en: ${fallas.map((f) => f.metrica).join(', ')}`}`)
  return fallas.length === 0
}

/**
 * Compone el PNG lado a lado con una etiqueta sobre cada captura.
 *
 * Se arma como HTML y se saca una captura de esa pagina en vez de componer buffers a mano: es la
 * forma de no meter una libreria de imagenes solo para pegar tres rectangulos y tres textos.
 *
 * @param {import('playwright').Page} lienzo Pagina en blanco reutilizable.
 * Los tres paneles se escalan al tamaño de la referencia por la misma razon que las metricas: un orbe
 * de 145 px al lado de uno de 456 px no se puede comparar a ojo, que es justo el problema original.
 *
 * @param {{ etiqueta: string, png: Buffer }[]} paneles Capturas a mostrar en orden.
 * @param {{ ancho: number, alto: number }} tamano Tamaño comun al que escalar cada panel.
 * @param {string} destino Ruta del archivo a escribir.
 */
async function componerComparacion (lienzo, paneles, tamano, destino) {
  const html = paneles.map((p) => `
    <figure>
      <figcaption>${p.etiqueta}</figcaption>
      <img src="data:image/png;base64,${p.png.toString('base64')}" alt="${p.etiqueta}"
           width="${tamano.ancho}" height="${tamano.alto}">
    </figure>`).join('')

  await lienzo.setContent(`
    <style>
      body { margin: 0; display: flex; gap: 16px; padding: 16px; background: #6b6b73;
             font: 13px ui-sans-serif, system-ui, sans-serif; align-items: flex-start; }
      figure { margin: 0; }
      figcaption { color: #fff; padding: 6px 2px; letter-spacing: .04em; }
      img { display: block; }
    </style>${html}`)
  await writeFile(destino, await lienzo.screenshot({ fullPage: true }))
  console.log(`\nComparacion visual escrita en ${destino}`)
}

/**
 * Orquesta la corrida: mide Neo, mide nuestro orbe en los dos temas, informa y compone la imagen.
 *
 * @returns {Promise<boolean>} `true` si las dos variantes pasan todas las metricas.
 */
async function comparar () {
  await exigirServidorLocal(URL_LOCAL)

  const navegador = await chromium.launch()
  try {
    console.log(`Midiendo referencia: ${URL_NEO}`)
    const capturaNeo = await capturarOrbe(navegador, URL_NEO, 'light')
    console.log(`Midiendo nuestro orbe: ${URL_LOCAL}`)
    const capturaClaro = await capturarOrbe(navegador, URL_LOCAL, 'light')
    const capturaOscuro = await capturarOrbe(navegador, URL_LOCAL, 'dark')

    /* Todo se normaliza al tamaño de Neo: es la referencia, y asi los promedios pesan igual. */
    const destino = { ancho: capturaNeo.ancho, alto: capturaNeo.alto }
    const contexto = await navegador.newContext({ viewport: { width: destino.ancho, height: destino.alto } })
    const lienzo = await contexto.newPage()

    const neo = { ...capturaNeo, ...(await medirPixeles(lienzo, capturaNeo.png, destino)) }
    const claro = { ...capturaClaro, ...(await medirPixeles(lienzo, capturaClaro.png, destino)) }
    const oscuro = { ...capturaOscuro, ...(await medirPixeles(lienzo, capturaOscuro.png, destino)) }

    console.log(`\nReferencia neo.wiwo.me: ${neo.ancho}x${neo.alto} px, proporcion ${neo.proporcion}`)
    const pasaClaro = informar('ops-v2 · tema claro', neo, claro)
    const pasaOscuro = informar('ops-v2 · tema oscuro', neo, oscuro)

    await componerComparacion(lienzo, [
      { etiqueta: 'neo.wiwo.me', png: capturaNeo.png },
      { etiqueta: 'ops-v2 (claro)', png: capturaClaro.png },
      { etiqueta: 'ops-v2 (oscuro)', png: capturaOscuro.png }
    ], destino, ARCHIVO_SALIDA)

    await contexto.close()
    return pasaClaro && pasaOscuro
  } finally {
    await navegador.close()
  }
}

try {
  process.exitCode = (await comparar()) ? 0 : 1
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 2
}
