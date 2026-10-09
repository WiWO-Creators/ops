import { setTimeout as esperar } from 'node:timers/promises'

/**
 * Apoyo del banco de red lenta (`pruebas/red-lenta.browser.mjs`).
 *
 * Reune lo que necesita cualquier prueba de navegador que quiera ver la app con una red mala:
 *
 * - `emularRed`: latencia y ancho de banda del navegador por CDP (solo Chromium).
 * - `interceptarBff`: intercepta `**\/api/bff/**` para retrasar, perder la respuesta o contestar 504,
 *   y deja un registro de cada peticion (metodo, ruta, `Idempotency-Key`, que paso con ella).
 * - `contarRsc`: cuenta las peticiones `_rsc` de navegacion de Next, sin los prefetch.
 * - `instalarSonda` / `medirClic`: cuanto tarda la pantalla en cambiar tras un clic.
 * - `contarBloqueados`: controles que siguen deshabilitados u ocupados.
 *
 * Nada de esto toca el servidor: una "respuesta perdida" deja que la peticion llegue y se procese, y
 * solo le corta la respuesta al navegador, que es lo que pasa en una red movil que se cae.
 */

/** Perfiles de red. Los anchos de banda van en bytes por segundo, como los pide CDP. */
export const PERFILES = Object.freeze({
  '3g-lento': { latenciaMs: 400, bajadaBps: (400 * 1000) / 8, subidaBps: (400 * 1000) / 8 },
  'rtt-2s': { latenciaMs: 2000, bajadaBps: (1500 * 1000) / 8, subidaBps: (750 * 1000) / 8 },
  ninguno: null
})

/** Rutas del BFF que se disparan solas y no son una accion de la persona. */
const RUIDO_POR_DEFECTO = Object.freeze([/\/presence$/, /\/notifications\/count$/])
/** Metodos que no escriben. */
const METODOS_DE_LECTURA = Object.freeze(['GET', 'HEAD', 'OPTIONS'])

/**
 * Crea el controlador de emulacion de red de una pagina.
 *
 * @param {import('playwright').Page} pagina pagina de Chromium ya creada
 * @param {string} perfil clave de `PERFILES`
 * @returns {Promise<{ encender: () => Promise<void>, apagar: () => Promise<void> }>}
 * @throws {Error} si el perfil no existe
 */
export async function emularRed (pagina, perfil) {
  if (!(perfil in PERFILES)) throw new Error(`Perfil de red desconocido: ${perfil}. Usa ${Object.keys(PERFILES).join(', ')}.`)

  const sesion = await pagina.context().newCDPSession(pagina)
  await sesion.send('Network.enable')

  const aplicar = async (condiciones) => {
    await sesion.send('Network.emulateNetworkConditions', condiciones)
  }
  const libre = { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }

  return {
    async encender () {
      const datos = PERFILES[perfil]
      await aplicar(datos === null
        ? libre
        : { offline: false, latency: datos.latenciaMs, downloadThroughput: datos.bajadaBps, uploadThroughput: datos.subidaBps })
    },
    async apagar () {
      await aplicar(libre)
    }
  }
}

/**
 * Decide si una regla aplica a una peticion.
 *
 * @param {object} regla `{ metodo?: string | string[], ruta?: RegExp }`
 * @param {string} metodo metodo HTTP de la peticion
 * @param {string} ruta pathname de la peticion
 * @returns {boolean}
 */
function coincide (regla, metodo, ruta) {
  const metodos = regla.metodo === undefined ? null : [regla.metodo].flat().map((m) => m.toUpperCase())

  return (metodos === null || metodos.includes(metodo)) && (regla.ruta === undefined || regla.ruta.test(ruta))
}

/**
 * Huella corta del cuerpo de una peticion, para reconocer una escritura repetida.
 *
 * @param {string | null} cuerpo texto del cuerpo
 * @returns {string | null}
 */
function huellaDe (cuerpo) {
  if (cuerpo === null || cuerpo === '') return null

  return cuerpo.length > 200 ? `${cuerpo.slice(0, 200)}#${cuerpo.length}` : cuerpo
}

/**
 * Intercepta las peticiones que casan con `patron` y las registra.
 *
 * Modos de una regla (`{ metodo?, ruta?, veces?, modo }`; la primera que casa gana, `veces` limita
 * cuantas peticiones afecta y despues deja pasar):
 *
 * - `{ tipo: 'pasar' }`: sin tocar (el valor por defecto).
 * - `{ tipo: 'retardo', ms, momento? }`: `momento: 'respuesta'` (por defecto) deja llegar la peticion
 *   al servidor y retiene la respuesta `ms`; `'peticion'` retiene la peticion antes de enviarla.
 * - `{ tipo: 'perder-respuesta' }`: la peticion llega y se procesa, y al navegador se le corta la
 *   conexion (`TypeError: Failed to fetch`).
 * - `{ tipo: '504' }`: contesta 504 `upstream_timeout` sin tocar el servidor.
 *
 * @param {import('playwright').BrowserContext} contexto contexto del navegador
 * @param {{ patron?: string | RegExp, ruido?: RegExp[] }} [opciones] `patron` por defecto `**\/api/bff/**`
 * @returns {Promise<object>} controlador con el registro y los contadores
 */
export async function interceptarBff (contexto, { patron = '**/api/bff/**', ruido = RUIDO_POR_DEFECTO } = {}) {
  const peticiones = []
  const porPeticion = new WeakMap()
  let reglas = []
  let desde = 0

  /** Busca la regla aplicable y gasta una de sus `veces`. */
  const reglaPara = (metodo, ruta) => {
    const regla = reglas.find((r) => (r.restantes === undefined || r.restantes > 0) && coincide(r, metodo, ruta))
    if (regla !== undefined && regla.restantes !== undefined) regla.restantes -= 1

    return regla?.modo ?? { tipo: 'pasar' }
  }

  /** Atiende una peticion segun el modo que le toque. */
  const atender = async (ruta) => {
    const peticion = ruta.request()
    const url = new URL(peticion.url())
    const modo = reglaPara(peticion.method(), url.pathname)
    const registro = {
      n: peticiones.length + 1,
      metodo: peticion.method(),
      ruta: url.pathname,
      consulta: url.search,
      clave: peticion.headers()['idempotency-key'] ?? null,
      huella: huellaDe(peticion.postData()),
      modo: modo.tipo,
      llegoAlServidor: false,
      estado: null,
      inicioMs: Math.round(performance.now()),
      finMs: null
    }
    peticiones.push(registro)
    porPeticion.set(peticion, registro)

    try {
      await aplicarModo(ruta, modo, registro)
    } catch (error) {
      // El navegador cancela por su cuenta (limite de tiempo, cambio de pantalla): no es un fallo del banco.
      registro.estado ??= 'cancelada-por-el-navegador'
      registro.detalle = String(error?.message ?? error).split('\n')[0]
    } finally {
      registro.finMs ??= Math.round(performance.now())
    }
  }

  await contexto.route(patron, atender)
  contexto.on('response', (respuesta) => {
    const registro = porPeticion.get(respuesta.request())
    if (registro !== undefined && registro.estado === null) {
      registro.estado = respuesta.status()
      registro.llegoAlServidor = true
    }
  })

  const esEscritura = (p) => !METODOS_DE_LECTURA.includes(p.metodo) && !ruido.some((r) => r.test(p.ruta))
  const vigentes = () => peticiones.slice(desde)

  return {
    peticiones: vigentes,
    /** Sustituye las reglas activas. */
    establecer (nuevas) {
      reglas = nuevas.map((r) => ({ ...r, restantes: r.veces }))
    },
    /** Empieza a contar desde cero sin perder el historial completo. */
    reiniciar () {
      desde = peticiones.length
    },
    /** Cuantas peticiones casan con `{ metodo, ruta }` desde el ultimo reinicio. */
    contar ({ metodo, ruta } = {}) {
      return vigentes().filter((p) => coincide({ metodo, ruta }, p.metodo, p.ruta)).length
    },
    /** Peticiones que casan, con su `Idempotency-Key` y su resultado. */
    detalle (filtro = {}) {
      return vigentes()
        .filter((p) => coincide(filtro, p.metodo, p.ruta))
        .map(({ n, metodo, ruta, clave, modo, estado, llegoAlServidor }) => ({ n, metodo, ruta, clave, modo, estado, llegoAlServidor }))
    },
    /** Escrituras desde el ultimo reinicio, sin el ruido de fondo. */
    escrituras () {
      return vigentes().filter(esEscritura)
    },
    /**
     * Escrituras repetidas: mismo metodo, ruta y cuerpo mas de una vez.
     *
     * `claveRepetida` es verdadero solo si TODAS comparten `Idempotency-Key`; es lo que permite que el
     * servidor reconozca el reintento. Una clave distinta en cada intento significa que un reintento
     * crea dos veces.
     */
    duplicadas () {
      const grupos = new Map()
      for (const p of vigentes().filter(esEscritura)) {
        const llave = `${p.metodo} ${p.ruta} ${p.huella ?? ''}`
        grupos.set(llave, [...(grupos.get(llave) ?? []), p])
      }

      return [...grupos.values()]
        .filter((g) => g.length > 1)
        .map((g) => ({
          metodo: g[0].metodo,
          ruta: g[0].ruta,
          intentos: g.length,
          claves: g.map((p) => p.clave),
          claveRepetida: g.every((p) => p.clave !== null && p.clave === g[0].clave),
          llegaronAlServidor: g.filter((p) => p.llegoAlServidor).length
        }))
    }
  }
}

/**
 * Ejecuta el modo de una regla sobre una ruta interceptada.
 *
 * @param {import('playwright').Route} ruta peticion retenida
 * @param {{ tipo: string, ms?: number, momento?: string }} modo modo a aplicar
 * @param {object} registro entrada del registro, que se completa
 * @returns {Promise<void>}
 * @throws {Error} si el modo no existe o el navegador ya cancelo la peticion
 */
async function aplicarModo (ruta, modo, registro) {
  switch (modo.tipo) {
    case 'pasar':
      return await ruta.continue()
    case 'retardo': {
      if (modo.momento === 'peticion') {
        await esperar(modo.ms)

        return await ruta.continue()
      }
      const respuesta = await ruta.fetch()
      registro.llegoAlServidor = true
      registro.estado = respuesta.status()
      await esperar(modo.ms)

      return await ruta.fulfill({ response: respuesta })
    }
    case 'perder-respuesta': {
      const respuesta = await ruta.fetch()
      registro.llegoAlServidor = true
      registro.estado = `perdida(${respuesta.status()})`

      return await ruta.abort('connectionreset')
    }
    case '504':
      registro.estado = 504

      return await ruta.fulfill({
        status: 504,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'upstream_timeout', message: 'Tiempo agotado (simulado por el banco).' } })
      })
    default:
      throw new Error(`Modo de interceptacion desconocido: ${modo.tipo}`)
  }
}

/**
 * Cuenta las peticiones `_rsc` de navegacion de una pagina, sin los prefetch de los enlaces.
 *
 * @param {import('playwright').Page} pagina pagina a observar
 * @returns {{ lista: () => string[], reiniciar: () => void }}
 */
export function contarRsc (pagina) {
  const todas = []
  let desde = 0

  pagina.on('request', (peticion) => {
    const cabeceras = peticion.headers()
    const esPrefetch = cabeceras['next-router-prefetch'] !== undefined || cabeceras.purpose === 'prefetch'
    if (peticion.url().includes('_rsc=') && !esPrefetch) {
      const url = new URL(peticion.url())
      todas.push(`${url.pathname}${url.search.replace(/[?&]_rsc=[^&]*/, '')}`)
    }
  })

  return {
    lista: () => todas.slice(desde),
    reiniciar () {
      desde = todas.length
    }
  }
}

/**
 * Instala en el contexto la sonda que mide cuanto tarda la pantalla en cambiar tras una interaccion.
 * Debe llamarse antes de abrir paginas.
 *
 * La sonda guarda el instante del primer `pointerdown`/`click`/`keydown` y el de la primera mutacion
 * del DOM posterior. Cuenta cualquier mutacion, asi que un cambio ajeno (polling, reloj) puede dar un
 * falso "respondio"; el error va hacia no detectar un clic muerto, nunca hacia inventarlo.
 *
 * @param {import('playwright').BrowserContext} contexto contexto del navegador
 * @returns {Promise<void>}
 */
export async function instalarSonda (contexto) {
  await contexto.addInitScript(() => {
    const sonda = { clic: null, mutacion: null }
    window.__redLenta = sonda
    const marcar = () => { if (sonda.clic === null) sonda.clic = performance.now() }
    for (const evento of ['pointerdown', 'click', 'keydown']) window.addEventListener(evento, marcar, true)
    new MutationObserver(() => {
      if (sonda.clic !== null && sonda.mutacion === null) sonda.mutacion = performance.now()
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true })
  })
}

/**
 * Ejecuta una interaccion y mide cuanto tardo la pantalla en reaccionar.
 *
 * @param {import('playwright').Page} pagina pagina con la sonda instalada
 * @param {() => Promise<unknown>} accion interaccion (un clic, una tecla)
 * @param {number} [esperaMs] cuanto observar despues de la accion
 * @returns {Promise<number | null>} milisegundos hasta el primer cambio, o `null` si no hubo ninguno
 */
export async function medirClic (pagina, accion, esperaMs = 400) {
  await pagina.evaluate(() => {
    if (window.__redLenta) Object.assign(window.__redLenta, { clic: null, mutacion: null })
  })
  await accion()
  await pagina.waitForTimeout(esperaMs)

  return await pagina.evaluate(() => {
    const sonda = window.__redLenta

    return sonda?.clic == null || sonda.mutacion == null ? null : Math.round(sonda.mutacion - sonda.clic)
  })
}

/**
 * Cuenta los controles que parecen colgados dentro de un ambito: deshabilitados, ocupados o con
 * `aria-disabled`. Se compara contra el conteo previo a la accion, porque algunos controles nacen
 * deshabilitados (un paginador en la primera pagina).
 *
 * @param {import('playwright').Page} pagina pagina a revisar
 * @param {string} [ambito] selector CSS del ambito
 * @returns {Promise<number>}
 */
export async function contarBloqueados (pagina, ambito = 'body') {
  return (await nombrarBloqueados(pagina, ambito)).length
}

/**
 * Nombra los controles que parecen colgados dentro de un ambito, para poder explicar un fallo.
 *
 * @param {import('playwright').Page} pagina pagina a revisar
 * @param {string} [ambito] selector CSS del ambito
 * @returns {Promise<string[]>} una etiqueta corta por control: `etiqueta:nombre accesible`
 */
export async function nombrarBloqueados (pagina, ambito = 'body') {
  return await pagina.locator(ambito).first().evaluate((raiz) => [...raiz.querySelectorAll(
    'button:disabled, input:disabled, select:disabled, [aria-busy="true"], [aria-disabled="true"]'
  )].map((e) => `${e.tagName.toLowerCase()}:${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)}`))
}
