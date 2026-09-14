/**
 * Pruebas del registro de incidentes de cara al usuario.
 *
 * Lo que se cuida aca no es que las funciones devuelvan un texto, sino las dos cosas que romperian
 * el circuito completo sin dar error en ningun lado:
 *
 *  1. Que el codigo del incidente se lea de `details`. Si `incidenteDe()` devolviera `undefined`
 *     ante el `{ incidente: 'ab12cd34' }` que manda la API, el aviso flotante saldria sin numero y
 *     la persona no tendria nada que reportar — que es exactamente el problema que esto vino a
 *     resolver, y sin ninguna señal de que dejo de funcionar.
 *  2. Que `avisarError()` no lance cuando se importa en el servidor. Lo llama el cliente de datos,
 *     que se ejecuta en los dos lados: si tocara `window` sin comprobar, cada render de servidor que
 *     pasara por ahi se caeria.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EVENTO_ERROR, avisarError } from '../src/lib/aviso-de-error.ts'
import { NOMBRE_SOPORTE, URL_SOPORTE } from '../src/lib/soporte.ts'
import { describirOrigen } from '../src/dominio/incidentes.ts'
import { ErrorApi, incidenteDe } from '../src/datos/errores.ts'

test('el codigo del incidente se lee del `details` que manda la API', () => {
  assert.equal(incidenteDe({ incidente: 'ab12cd34' }), 'ab12cd34')
  assert.equal(new ErrorApi('server_error', 'Error interno.', 500, { incidente: 'ab12cd34' }).incidente, 'ab12cd34')
})

test('un error sin incidente no inventa ninguno', () => {
  assert.equal(incidenteDe(undefined), undefined)
  assert.equal(incidenteDe({}), undefined)
  assert.equal(incidenteDe({ incidente: '' }), undefined)
  assert.equal(new ErrorApi('forbidden', 'Sin permiso', 403).incidente, undefined)
})

test('los `details` de un 422 no se confunden con un incidente', () => {
  // La misma clave con la forma del 422 —una lista de motivos— no es un codigo: devolverla como tal
  // pondria "required" donde la pantalla espera ocho hexadecimales.
  assert.equal(incidenteDe({ incidente: ['required'] }), undefined)
  assert.equal(incidenteDe({ name: ['required'] }), undefined)
})

test('cada origen tiene nombre y tono, y el desconocido se muestra igual', () => {
  assert.equal(describirOrigen('api').etiqueta, 'API')
  assert.equal(describirOrigen('panel').etiqueta, 'Panel')
  assert.equal(describirOrigen('portal').etiqueta, 'Portal')

  // Un origen que la API empiece a registrar antes de que el panel lo conozca se muestra crudo, no
  // se esconde: una fila sin etiqueta sigue siendo una fila que hay que poder ver.
  assert.equal(describirOrigen('cron').etiqueta, 'cron')
  assert.equal(describirOrigen('cron').tono, 'neutro')
})

test('avisar de un error en el servidor no lanza ni intenta tocar el `window`', () => {
  assert.equal(globalThis.window, undefined)
  assert.doesNotThrow(() => { avisarError({ mensaje: 'algo se rompio' }) })
})

test('el aviso viaja en un evento con nombre propio del proyecto', () => {
  // El nombre es contrato entre quien emite y la pila que escucha, y viven en archivos distintos:
  // cambiarlo de un lado sin el otro apagaria los avisos sin que nada falle.
  assert.equal(EVENTO_ERROR, 'ops:error')
})

test('el soporte se nombra desde una sola constante', () => {
  assert.equal(URL_SOPORTE, 'https://wiwo.center')
  assert.ok(URL_SOPORTE.includes(NOMBRE_SOPORTE))
})
