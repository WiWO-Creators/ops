/**
 * Pruebas de la unica fuente de personas asignables.
 *
 * Lo que se rompe en silencio es el cache: si guardara el fallo, el primer error dejaria el selector
 * vacio para siempre; si no cacheara, abrir el selector diez veces serian diez peticiones de 184
 * filas. Y la ruta tiene que pasar la lista blanca del BFF, o el navegador no la alcanza.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cargarAsignables, olvidarAsignables, RUTA_DE_ASIGNABLES } from '../src/datos/asignables.ts'
import { rutaPermitida } from '../src/datos/rutas.ts'

const PERSONAS = [
  { id: 20, full_name: 'Ana Ríos', profile_image_url: null, area_id: 1, cargo_id: 2 },
  { id: 31, full_name: 'Bruno Cabral', profile_image_url: null, area_id: null, cargo_id: null }
]

/** Reemplaza `fetch` por uno que cuenta llamadas y devuelve lo que se le diga. */
function fetchDePrueba (respuesta) {
  const llamadas = []

  globalThis.fetch = async (url) => {
    llamadas.push(url)

    return await Promise.resolve(respuesta())
  }

  return llamadas
}

function sobreOk (datos) {
  return { ok: true, status: 200, json: async () => await Promise.resolve({ data: datos }) }
}

test('la ruta pide una sola pagina con tope, no las 25 por defecto', () => {
  assert.match(RUTA_DE_ASIGNABLES, /^staff\/asignables\?per_page=\d{3,}$/)
})

test('el BFF deja pasar la ruta con el prefijo `staff` que ya tenia', () => {
  assert.equal(rutaPermitida(['staff', 'asignables']), true)
  // El portal no: un contacto no elige a quien se le asigna una tarea.
  assert.equal(rutaPermitida(['staff', 'asignables'], 'contacto'), false)
})

test('las 184 filas se piden una sola vez aunque las pidan varias pantallas', async () => {
  olvidarAsignables()
  const llamadas = fetchDePrueba(() => sobreOk(PERSONAS))

  const [unas, otras] = await Promise.all([cargarAsignables(), cargarAsignables()])
  const terceras = await cargarAsignables()

  assert.equal(llamadas.length, 1)
  assert.deepEqual(unas.map((p) => p.id), [20, 31])
  assert.equal(otras, unas)
  assert.equal(terceras, unas)
})

test('un fallo no queda cacheado: el siguiente intento vuelve a pedir', async () => {
  olvidarAsignables()
  let falla = true
  const llamadas = fetchDePrueba(() => {
    if (falla) return { ok: false, status: 500, json: async () => await Promise.resolve({}) }

    return sobreOk(PERSONAS)
  })

  await assert.rejects(cargarAsignables())

  falla = false
  const personas = await cargarAsignables()

  assert.equal(llamadas.length, 2)
  assert.deepEqual(personas.map((p) => p.full_name), ['Ana Ríos', 'Bruno Cabral'])
})

test('una lista vacia se cachea igual: no es un error, es un equipo sin nadie', async () => {
  olvidarAsignables()
  const llamadas = fetchDePrueba(() => sobreOk([]))

  assert.deepEqual(await cargarAsignables(), [])
  assert.deepEqual(await cargarAsignables(), [])
  assert.equal(llamadas.length, 1)

  olvidarAsignables()
})
