/**
 * Pruebas de la traduccion del `link` de un aviso a una ruta de Ops.
 *
 * Lo que se verifica es el borde, no el caso feliz: la campana lleva desde su primer dia
 * descartando `link` entero, asi que cualquier formato que esta funcion no reconozca tiene que
 * seguir cayendo en `null` y pintarse sin enlace. Un `null` de mas solo devuelve el comportamiento
 * viejo; un enlace de mas manda a alguien a una pantalla que no es, y eso no se nota hasta que
 * alguien lo sigue.
 *
 * El `#taskid=N` es el unico formato que hoy escribe el recordatorio de fecha tope
 * (`modules/wiwo_core/deadline_reminders.php`). El resto de `tblnotifications.link` —`#leadid=`,
 * rutas del admin viejo— queda fuera a proposito.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rutaDeAviso } from '../src/dominio/enlace-de-aviso.ts'

test('un enlace a tarea del panel viejo se traduce al listado con el detalle abierto', () => {
  assert.equal(rutaDeAviso('#taskid=512'), '/procesos?tarea=512')
})

test('el id viaja tal cual, sin recortes ni relleno', () => {
  assert.equal(rutaDeAviso('#taskid=1'), '/procesos?tarea=1')
  assert.equal(rutaDeAviso('#taskid=98765'), '/procesos?tarea=98765')
})

test('los espacios alrededor no cuentan', () => {
  assert.equal(rutaDeAviso('  #taskid=7  '), '/procesos?tarea=7')
})

test('sin link no hay enlace', () => {
  assert.equal(rutaDeAviso(null), null)
})

test('un link vacio no es un enlace', () => {
  assert.equal(rutaDeAviso(''), null)
  assert.equal(rutaDeAviso('   '), null)
})

test('un formato desconocido se descarta entero en vez de adivinarle destino', () => {
  assert.equal(rutaDeAviso('#leadid=7'), null)
  assert.equal(rutaDeAviso('admin/tasks/view/512'), null)
  assert.equal(rutaDeAviso('https://board.wiwo.me/admin/tasks#taskid=512'), null)
  assert.equal(rutaDeAviso('#taskid=512&tab=comentarios'), null)
  assert.equal(rutaDeAviso('#taskid='), null)
  assert.equal(rutaDeAviso('#taskid=abc'), null)
  assert.equal(rutaDeAviso('#taskid=-3'), null)
})

test('un id que no nombra ninguna fila no se enlaza', () => {
  assert.equal(rutaDeAviso('#taskid=0'), null)
  assert.equal(rutaDeAviso(`#taskid=${'9'.repeat(20)}`), null)
})

test('una ruta interna de Ops se usa tal cual (enlace de ticket, T3)', () => {
  assert.equal(rutaDeAviso('/proyectos/12?tab=tickets&ticket=40'), '/proyectos/12?tab=tickets&ticket=40')
  assert.equal(rutaDeAviso('  /portal/soporte/3 '), '/portal/soporte/3')
})

test('nada que salga de Ops pasa por ruta interna', () => {
  assert.equal(rutaDeAviso('//evil.com/proyectos'), null)
  assert.equal(rutaDeAviso('/\\evil.com'), null)
  assert.equal(rutaDeAviso('https://evil.com/proyectos/1'), null)
  assert.equal(rutaDeAviso('/proyectos/1 onclick=x'), null)
  assert.equal(rutaDeAviso('/proyectos/1"><script>'), null)
  assert.equal(rutaDeAviso('javascript:alert(1)'), null)
})
