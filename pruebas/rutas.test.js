/**
 * Pruebas de la lista blanca del BFF.
 *
 * El BFF reenvia con el token de la persona adosado: lo que pase esta lista queda alcanzable desde
 * el navegador. Lo importante no es que deje pasar lo permitido, sino que no deje pasar lo demas.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { rutaCompartida, rutaPermitida } from '../src/datos/rutas.ts'

test('deja pasar los recursos del nucleo', () => {
  for (const ruta of [['me'], ['lookups'], ['tasks'], ['tasks', '512', 'comments'], ['projects', '44', 'milestones']]) {
    assert.equal(rutaPermitida(ruta), true, ruta.join('/'))
  }
})

test('notifications pasa para staff: campana, preferencias y el interruptor de correo', () => {
  // La API ya gatea /settings y /mail-queue por admin; el BFF solo decide si la ruta existe.
  for (const ruta of [['notifications'], ['notifications', 'settings'], ['notifications', 'mail-queue']]) {
    assert.equal(rutaPermitida(ruta), true, ruta.join('/'))
  }

  assert.equal(rutaPermitida(['notifications'], 'contacto'), false)
})

test('settings pasa para staff y no para el portal', () => {
  // Mismo criterio que `notifications`: la API filtra por admin, el BFF solo dice si la ruta existe.
  assert.equal(rutaPermitida(['settings']), true)
  assert.equal(rutaPermitida(['settings'], 'contacto'), false)
})

test('auth NO pasa: los tokens solo los ve /api/sesion', () => {
  assert.equal(rutaPermitida(['auth', 'login']), false)
  assert.equal(rutaPermitida(['auth', 'refresh']), false)
})

test('un recurso fuera de la lista no pasa', () => {
  // frente: detalle — `invoices` paso a estar en la lista blanca; el ejemplo usa un recurso que sigue afuera.
  assert.equal(rutaPermitida(['payments']), false)
  assert.equal(rutaPermitida(['verificacion', 'permisos']), false)
})

test('una ruta vacia no pasa', () => {
  assert.equal(rutaPermitida([]), false)
})

test('no se puede escalar fuera de la lista con .. ni con segmentos vacios', () => {
  assert.equal(rutaPermitida(['tasks', '..', 'auth', 'login']), false)
  assert.equal(rutaPermitida(['tasks', '', 'comments']), false)
  assert.equal(rutaPermitida(['tasks', '.']), false)
})

/**
 * El matcher del proxy, tal cual lo declara `proxy.ts`.
 *
 * Se lee del archivo en vez de copiarlo: una copia se desincroniza y la prueba pasaria verificando
 * una regla que ya no corre.
 */
function matcherDelProxy () {
  const fuente = readFileSync(new URL('../src/proxy.ts', import.meta.url), 'utf8')
  const [, literal] = fuente.match(/matcher:\s*\['([^']+)'\]/)
  // El archivo es TypeScript: lo que ahi es `\\.` vale `\.` una vez que el modulo se evalua.
  const patron = literal.replace(/\\\\/g, '\\')

  return new RegExp(`^${patron}$`)
}

test('el proxy protege el panel', () => {
  const matcher = matcherDelProxy()

  for (const ruta of ['/inicio', '/procesos', '/espacios/44', '/clientes']) {
    assert.equal(matcher.test(ruta), true, `${ruta} tiene que pedir sesion`)
  }

  // `/colaboradores` no existe todavia, pero si existiera tiene que nacer protegida: la excepcion es
  // `/colab` exacta, no todo lo que empiece igual.
  assert.equal(matcher.test('/colaboradores'), true)
})

test('el proxy deja pasar los estaticos y las dos pantallas de entrar', () => {
  // Un estatico detras del guardia se convierte en redireccion a `/colab`, y ahi la pantalla de
  // entrar se queda sin su propio logotipo.
  //
  // `/` es la pantalla de acceso del cliente: taparla seria un bucle de redirecciones.
  const matcher = matcherDelProxy()

  for (const ruta of ['/', '/colab', '/icon.png', '/marca/wiwo-ops.png', '/fonts/neo/Outfit-100-900-latin.woff2', '/api/sesion']) {
    assert.equal(matcher.test(ruta), false, `${ruta} no puede pedir sesion`)
  }
})

test('la pantalla de puerta de una sala queda fuera del guardia', () => {
  // Una tablet colgada en la pared no tiene cookie y no se puede loguear: si el guardia la tomara,
  // mostraria la pantalla de acceso en vez de la agenda. La autoriza el token de la sala.
  const matcher = matcherDelProxy()

  assert.equal(matcher.test('/sala/7f3a9c1e5b8d4260a1c7e93f5d2b6084'), false)
  // `/salas` es la agenda del equipo y SI exige sesion: la excepcion es `sala/`, en singular.
  assert.equal(matcher.test('/salas'), true)
})

test('el proxy protege el portal entero', () => {
  const matcher = matcherDelProxy()

  // `verificar` incluida: es del contacto que ya entro, asi que exige sesion como el resto.
  for (const ruta of ['/portal', '/portal/proyectos', '/portal/facturas/9', '/portal/verificar']) {
    assert.equal(matcher.test(ruta), true, `${ruta} tiene que pedir sesion`)
  }
})

test('un contacto no puede pedir rutas del panel por el BFF', () => {
  // Tercera barrera, despues de la columna del token y de exigirContacto(): que el pedido ni salga.
  for (const prefijo of ['clients', 'projects', 'tasks', 'staff', 'me', 'lookups']) {
    assert.equal(rutaPermitida([prefijo], 'contacto'), false, `contacto no puede pedir ${prefijo}`)
  }

  assert.equal(rutaPermitida(['portal', 'me'], 'contacto'), true)
  assert.equal(rutaPermitida(['files', 'task', '3', 'download'], 'contacto'), true)
})

test('un staff no puede pedir rutas del portal por el BFF', () => {
  // La simetrica: nadie previsualiza el portal con el token del panel.
  assert.equal(rutaPermitida(['portal', 'me'], 'staff'), false)
  assert.equal(rutaPermitida(['portal', 'invoices'], 'staff'), false)
})

test('el escape de directorio sigue bloqueado en las dos listas', () => {
  for (const sujeto of ['staff', 'contacto']) {
    assert.equal(rutaPermitida(['portal', '..', 'me'], sujeto), false)
    assert.equal(rutaPermitida(['clients', ''], sujeto), false)
  }
})

test('la descarga de adjuntos la pueden pedir los dos sujetos', () => {
  // Vive fuera de /portal porque las URLs que la API ya emitia apuntan ahi. Por eso el prefijo no
  // alcanza para saber de quien es el pedido, y el BFF tiene que mirar que sesion hay.
  assert.equal(rutaCompartida(['files', 'customer', '9', 'download']), true)
  assert.equal(rutaPermitida(['files', 'customer', '9', 'download'], 'staff'), true)
  assert.equal(rutaPermitida(['files', 'customer', '9', 'download'], 'contacto'), true)
})

test('ninguna otra ruta es compartida', () => {
  // Si esta lista crece sin querer, el BFF empieza a resolver el sujeto por sesion donde antes lo
  // resolvia por prefijo, y eso relaja una barrera sin que se note.
  for (const prefijo of ['portal', 'clients', 'projects', 'tasks', 'me', 'staff']) {
    assert.equal(rutaCompartida([prefijo]), false, prefijo)
  }
})
