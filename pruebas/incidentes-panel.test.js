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
import { describirFalla, describirOrigen, describirPeticion } from '../src/dominio/incidentes.ts'
import { ErrorApi, incidenteDe, mensajeParaPantalla } from '../src/datos/errores.ts'

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

test('la excepcion pegada atras del mensaje no llega a la pantalla', () => {
  // El caso real de esta base: la parte legible primero y la excepcion cruda despues.
  assert.equal(
    mensajeParaPantalla("Error interno. Incidente 45d2c10e. mysqli_sql_exception: Unknown column 'i.origen' in 'SELECT' (mysqli_driver.php:307)"),
    'Error interno. Incidente 45d2c10e.'
  )

  // Un mensaje que ya es legible entero no se toca.
  assert.equal(
    mensajeParaPantalla('No tienes permiso para configurar los tipos.'),
    'No tienes permiso para configurar los tipos.'
  )

  // Una excepcion pelada no deja nada legible: antes que un volcado, la frase generica.
  assert.equal(mensajeParaPantalla('PDOException: SQLSTATE[42S22]'), 'Algo falló de nuestro lado.')
})

test('una respuesta de la API se lee como una frase, no como un codigo', () => {
  // Es el caso que motivo el cambio: el panel guarda `403 forbidden: ...` y esa cadena terminaba de
  // titulo de la pantalla, obligando a traducir un numero antes de entender el problema.
  const falla = describirFalla({
    origen: 'panel',
    mensaje: '403 forbidden: Solo el creador del espacio configura los tipos y sus ETA.'
  })

  assert.equal(falla.titular, 'Le faltaba permiso')
  assert.equal(falla.detalle, 'Solo el creador del espacio configura los tipos y sus ETA.')
  assert.equal(falla.estado, '403')
})

test('un estado HTTP sin frase propia se nombra con su codigo y no se inventa', () => {
  const falla = describirFalla({ origen: 'api', mensaje: '418 teapot: No hay cafe.' })

  assert.equal(falla.titular, 'La API contestó 418 teapot')
  assert.equal(falla.detalle, 'No hay cafe.')
})

test('un incidente sin respuesta de la API adentro se titula por su origen', () => {
  // Una pantalla que no se pudo dibujar no tiene estado HTTP que contar: lo unico cierto es de que
  // lado se rompio, y el mensaje tecnico entero pasa a ser el detalle.
  const falla = describirFalla({ origen: 'panel', mensaje: "Cannot read properties of undefined" })

  assert.equal(falla.titular, 'Una pantalla del panel no se pudo dibujar')
  assert.equal(falla.detalle, 'Cannot read properties of undefined')
  assert.equal(falla.estado, null)
})

test('la peticion se dice en castellano, y la ruta desconocida se muestra tal cual', () => {
  assert.equal(describirPeticion('/projects/274/task-types'), 'Proyecto #274 · task-types')
  assert.equal(describirPeticion('/tasks/91'), 'Tarea #91')
  assert.equal(describirPeticion('/projects?page=2'), 'Proyecto')

  // Nada de nombres inventados para lo que el panel no conoce: la ruta cruda al menos es cierta.
  assert.equal(describirPeticion('/webhooks/stripe'), '/webhooks/stripe')
})

test('el soporte se nombra desde una sola constante', () => {
  assert.equal(URL_SOPORTE, 'https://wiwo.center')
  assert.ok(URL_SOPORTE.includes(NOMBRE_SOPORTE))
})
