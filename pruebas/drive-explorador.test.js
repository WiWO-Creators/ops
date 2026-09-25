/**
 * Pruebas del explorador de Drive: la lógica que decide sin navegador.
 *
 * Lo que se protege, en orden de daño si se rompe:
 *
 *   1. Dónde se puede soltar un arrastre. Un destino mal validado mueve una carpeta dentro de sí
 *      misma o deja soltar donde el backend dirá que no, sin aviso previo.
 *   2. El resumen del lote: cada fallo tiene que salir con su nombre y su motivo.
 *   3. La selección con Shift y Ctrl, y el foco con flechas: son las que dan de qué se arrastra.
 *   4. Orden, filtro, tipo por mime y tamaño legible, que son lo que se ve en cada fila.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SELECCION_VACIA, TOPE_SUBIDA_BYTES, fechaDeModificacion, filtrarPorNombre, formatearTamano, indiceTrasTecla,
  motivoParaNoSoltar, motivoParaNoSubir, nombreRepetido, ordenarNodos, partirEnLotes, recortarMigas,
  resumenDeBorrado, resumenDeTraslado, reubicarRutas, seleccionar, separarNodos, subidasParaArrancar, sumarNodos, tipoDeNodo
} from '../src/dominio/drive-explorador.ts'

/** Un nodo con lo mínimo. */
function nodo (id, name, extra = {}) {
  return { id, name, is_folder: false, web_view_link: `https://drive/${id}`, ...extra }
}

const carpeta = (id, name, extra = {}) => nodo(id, name, { is_folder: true, ...extra })

test('el tipo sale del mime y, si falta, de la extensión', () => {
  assert.equal(tipoDeNodo(nodo('1', 'x', { mime_type: 'application/pdf' })), 'pdf')
  assert.equal(tipoDeNodo(nodo('1', 'x', { mime_type: 'image/png' })), 'imagen')
  assert.equal(tipoDeNodo(nodo('1', 'x', { mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })), 'hoja')
  assert.equal(tipoDeNodo(nodo('1', 'x', { mime_type: 'application/vnd.google-apps.document' })), 'documento')
  assert.equal(tipoDeNodo(nodo('1', 'x', { mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })), 'presentacion')
  assert.equal(tipoDeNodo(nodo('1', 'x', { mime_type: 'video/mp4' })), 'video')
  assert.equal(tipoDeNodo(nodo('1', 'x', { mime_type: 'audio/mp4' })), 'audio')
  assert.equal(tipoDeNodo(nodo('1', 'x', { mime_type: 'application/zip' })), 'comprimido')
  assert.equal(tipoDeNodo(nodo('1', 'Planilla.XLSX', { mime_type: null })), 'hoja')
  assert.equal(tipoDeNodo(nodo('1', 'foto.jpeg', { mime_type: 'application/octet-stream' })), 'imagen')
  assert.equal(tipoDeNodo(nodo('1', 'sin-extension')), 'otro')
  assert.equal(tipoDeNodo(nodo('1', '.oculto')), 'otro')
})

test('una carpeta locked es la carpeta de una Tarea', () => {
  assert.equal(tipoDeNodo(carpeta('1', 'Bases')), 'carpeta')
  assert.equal(tipoDeNodo(carpeta('1', 'ACM-001-01', { locked: true })), 'carpeta-tarea')
})

test('ordenar deja las carpetas arriba y usa orden natural', () => {
  const lista = [nodo('a', 'Fase 10.pdf'), carpeta('c', 'zeta'), nodo('b', 'fase 2.pdf'), carpeta('d', 'Álamo')]
  assert.deepEqual(ordenarNodos(lista, { criterio: 'nombre', ascendente: true }).map((n) => n.id), ['d', 'c', 'b', 'a'])
  assert.deepEqual(ordenarNodos(lista, { criterio: 'nombre', ascendente: false }).map((n) => n.id), ['c', 'd', 'a', 'b'])
})

test('ordenar por fecha o tamaño deja al final lo que no tiene dato, en los dos sentidos', () => {
  const lista = [
    nodo('viejo', 'a', { modified_time: '2026-01-01T00:00:00Z', size_bytes: 10 }),
    nodo('sin', 'b', { modified_time: null, size_bytes: null }),
    nodo('nuevo', 'c', { modified_time: '2026-09-01T00:00:00Z', size_bytes: 500 })
  ]
  assert.deepEqual(ordenarNodos(lista, { criterio: 'fecha', ascendente: false }).map((n) => n.id), ['nuevo', 'viejo', 'sin'])
  assert.deepEqual(ordenarNodos(lista, { criterio: 'fecha', ascendente: true }).map((n) => n.id), ['viejo', 'nuevo', 'sin'])
  assert.deepEqual(ordenarNodos(lista, { criterio: 'tamano', ascendente: false }).map((n) => n.id), ['nuevo', 'viejo', 'sin'])
})

test('el filtro ignora tildes y mayúsculas, y vacío devuelve todo', () => {
  const lista = [nodo('1', 'Reunión de inicio.m4a'), nodo('2', 'propuesta.pdf')]
  assert.deepEqual(filtrarPorNombre(lista, 'REUNION').map((n) => n.id), ['1'])
  assert.equal(filtrarPorNombre(lista, '  ').length, 2)
  assert.equal(filtrarPorNombre(lista, 'nada').length, 0)
})

test('el tamaño se lee con un decimal bajo 10 y guion si no hay dato', () => {
  assert.equal(formatearTamano(820), '820 B')
  assert.equal(formatearTamano(48_128), '47 KB')
  assert.equal(formatearTamano(1_258_291), '1,2 MB')
  assert.equal(formatearTamano(25 * 1024 * 1024), '25 MB')
  assert.equal(formatearTamano(null), '—')
  assert.equal(formatearTamano(undefined), '—')
  assert.equal(formatearTamano(-1), '—')
  assert.equal(formatearTamano(0), '0 B')
})

test('la fecha de modificación es relativa, con la absoluta aparte', () => {
  const ahora = new Date('2026-09-25T12:00:00Z')
  const { relativa, absoluta } = fechaDeModificacion('2026-09-23T12:00:00Z', ahora)
  assert.equal(relativa, 'anteayer')
  assert.notEqual(absoluta, '—')
  assert.deepEqual(fechaDeModificacion(null, ahora), { relativa: '—', absoluta: '—' })
  // Un reloj de servidor adelantado no produce "dentro de 2 segundos".
  assert.doesNotMatch(fechaDeModificacion('2026-09-25T12:00:02Z', ahora).relativa, /dentro/)
  assert.deepEqual(fechaDeModificacion('no-es-fecha', ahora), { relativa: '—', absoluta: '—' })
})

test('la selección: clic simple, Ctrl alterna y Shift arma el rango desde el ancla', () => {
  const visibles = ['a', 'b', 'c', 'd', 'e']
  let seleccion = seleccionar(visibles, SELECCION_VACIA, 'b', 'unico')
  assert.deepEqual(seleccion, { ids: ['b'], ancla: 'b' })

  seleccion = seleccionar(visibles, seleccion, 'd', 'rango')
  assert.deepEqual(seleccion.ids, ['b', 'c', 'd'])
  // El segundo Shift+clic corrige el mismo rango: el ancla no se movió.
  seleccion = seleccionar(visibles, seleccion, 'a', 'rango')
  assert.deepEqual(seleccion, { ids: ['a', 'b'], ancla: 'b' })

  seleccion = seleccionar(visibles, seleccion, 'e', 'alternar')
  assert.deepEqual(seleccion.ids, ['a', 'b', 'e'])
  seleccion = seleccionar(visibles, seleccion, 'a', 'alternar')
  assert.deepEqual(seleccion.ids, ['b', 'e'])
})

test('Shift sin ancla visible elige solo el item', () => {
  assert.deepEqual(seleccionar(['a', 'b'], { ids: ['z'], ancla: 'z' }, 'b', 'rango'), { ids: ['b'], ancla: 'b' })
  assert.deepEqual(seleccionar(['a', 'b'], SELECCION_VACIA, 'fuera', 'rango'), SELECCION_VACIA)
})

test('no se suelta sobre lo que se arrastra, ni dentro, ni donde ya está, ni sin permiso', () => {
  const arrastre = { ids: ['bases', 'pdf'], padreId: 'raiz' }

  assert.equal(motivoParaNoSoltar({ id: 'oferta', ruta: ['raiz', 'oferta'] }, arrastre), null)
  assert.notEqual(motivoParaNoSoltar({ id: 'bases', ruta: ['raiz', 'bases'] }, arrastre), null)
  assert.notEqual(motivoParaNoSoltar({ id: 'hija', ruta: ['raiz', 'bases', 'hija'] }, arrastre), null)
  assert.notEqual(motivoParaNoSoltar({ id: 'raiz', ruta: ['raiz'] }, arrastre), null)
  assert.notEqual(motivoParaNoSoltar({ id: 'lectura', ruta: ['raiz', 'lectura'], canWrite: false }, arrastre), null)
  assert.notEqual(motivoParaNoSoltar({ id: 'oferta', ruta: ['raiz', 'oferta'] }, { ids: [], padreId: 'raiz' }), null)
})

test('una carpeta de Tarea o de permiso desconocido es destino: decide el backend', () => {
  const arrastre = { ids: ['pdf'], padreId: 'raiz' }
  assert.equal(motivoParaNoSoltar({ id: 'tarea', ruta: ['raiz', 'tarea'], canWrite: true }, arrastre), null)
  assert.equal(motivoParaNoSoltar({ id: 'tarea', ruta: ['raiz', 'tarea'] }, arrastre), null)
  // Hacia arriba, a un ancestro que no es el padre, también se puede.
  assert.equal(motivoParaNoSoltar({ id: 'raiz', ruta: ['raiz'] }, { ids: ['x'], padreId: 'bases' }), null)
})

test('la subida rechaza de antemano lo que pasa del tope o no tiene nombre', () => {
  assert.equal(motivoParaNoSubir({ name: 'a.pdf', size: TOPE_SUBIDA_BYTES }), null)
  assert.match(motivoParaNoSubir({ name: 'video.mp4', size: TOPE_SUBIDA_BYTES + 1 }), /25 MB/)
  assert.notEqual(motivoParaNoSubir({ name: ' ', size: 1 }), null)
})

test('nombre repetido sin distinguir tildes ni mayúsculas, salvo el propio item', () => {
  const hermanos = [carpeta('1', 'Bases'), nodo('2', 'Acta.pdf')]
  assert.equal(nombreRepetido('bases', hermanos), true)
  assert.equal(nombreRepetido(' ACTA.PDF ', hermanos), true)
  assert.equal(nombreRepetido('Bases', hermanos, '1'), false)
  assert.equal(nombreRepetido('Oferta', hermanos), false)
})

test('los lotes respetan el tope de la API', () => {
  const ids = Array.from({ length: 120 }, (_, i) => String(i))
  assert.deepEqual(partirEnLotes(ids).map((lote) => lote.length), [50, 50, 20])
  assert.deepEqual(partirEnLotes([]), [])
  assert.throws(() => partirEnLotes(ids, 0), RangeError)
})

test('el resumen del traslado nombra cada fallo con su motivo', () => {
  const nombres = { a: 'propuesta.pdf', b: 'Acta firmada.pdf', c: 'logo.png', d: 'x' }
  const nombreDe = (id) => nombres[id]

  assert.equal(
    resumenDeTraslado({ moved: ['a', 'c', 'd'], failed: [{ id: 'b', error: 'Drive no deja moverlo.', status: 403 }] }, nombreDe, 'Bases'),
    '3 movidos a «Bases», 1 falló: «Acta firmada.pdf»: Drive no deja moverlo.'
  )
  assert.equal(resumenDeTraslado({ moved: ['a'], failed: [] }, nombreDe, 'Bases'), '1 movido a «Bases».')
  assert.match(resumenDeTraslado({ moved: [], failed: [{ id: 'a', error: 'e1', status: 403 }, { id: 'b', error: 'e2', status: 409 }] }, nombreDe, 'X'), /^2 fallaron: «propuesta\.pdf»: e1; «Acta firmada\.pdf»: e2/)
  assert.equal(resumenDeTraslado({ moved: [], failed: [] }, nombreDe, 'X'), 'No se movió nada.')
})

test('la cola de subidas no pasa del tope en paralelo', () => {
  const cola = [
    { id: '1', estado: 'subiendo' }, { id: '2', estado: 'pendiente' }, { id: '3', estado: 'lista' },
    { id: '4', estado: 'pendiente' }, { id: '5', estado: 'pendiente' }
  ]
  assert.deepEqual(subidasParaArrancar(cola, 3), ['2', '4'])
  assert.deepEqual(subidasParaArrancar(cola.map((s) => ({ ...s, estado: 'subiendo' })), 3), [])
})

test('las migas largas conservan la raíz y las últimas', () => {
  const migas = ['r', 'a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() }))
  const pasos = recortarMigas(migas, 4)
  assert.deepEqual(pasos.map((p) => (p.tipo === 'miga' ? p.miga.id : `…${p.ocultas.map((m) => m.id).join('')}`)), ['r', '…ab', 'c', 'd'])
  assert.equal(recortarMigas(migas, 10).length, 5)
})

test('las flechas mueven el foco por fila en la cuadrícula y se quedan dentro', () => {
  assert.equal(indiceTrasTecla(-1, 10, 'ArrowDown', 1), 0)
  assert.equal(indiceTrasTecla(3, 10, 'ArrowDown', 1), 4)
  assert.equal(indiceTrasTecla(3, 10, 'ArrowRight', 1), 3)
  assert.equal(indiceTrasTecla(1, 10, 'ArrowDown', 4), 5)
  assert.equal(indiceTrasTecla(8, 10, 'ArrowDown', 4), 9)
  assert.equal(indiceTrasTecla(0, 10, 'ArrowUp', 4), 0)
  assert.equal(indiceTrasTecla(5, 10, 'End', 4), 9)
  assert.equal(indiceTrasTecla(5, 10, 'Home', 4), 0)
  assert.equal(indiceTrasTecla(0, 0, 'ArrowDown', 1), -1)
})

test('el traslado optimista saca y devuelve los nodos sin duplicar', () => {
  const lista = [nodo('a', 'a'), nodo('b', 'b'), nodo('c', 'c')]
  const { quedan, salen } = separarNodos(lista, ['a', 'c'])
  assert.deepEqual(quedan.map((n) => n.id), ['b'])
  assert.deepEqual(salen.map((n) => n.id), ['a', 'c'])
  assert.deepEqual(sumarNodos(quedan, [nodo('b', 'b2'), ...salen]).map((n) => n.name), ['b2', 'a', 'c'])
})

test('mover una carpeta corrige su ruta y la de todo lo que cuelga de ella', () => {
  const m = (id) => ({ id, name: id })
  const rutas = { r: [m('r')], a: [m('r'), m('a')], b: [m('r'), m('a'), m('b')], x: [m('r'), m('x')] }
  const nuevas = reubicarRutas(rutas, 'a', [m('r'), m('x'), m('a')])
  assert.deepEqual(nuevas.b.map((miga) => miga.id), ['r', 'x', 'a', 'b'])
  assert.deepEqual(nuevas.x.map((miga) => miga.id), ['r', 'x'])
  assert.deepEqual(nuevas.r.map((miga) => miga.id), ['r'])
})

test('el resumen del borrado cuenta la papelera y nombra los fallos', () => {
  const nombreDe = (id) => ({ a: 'x.pdf', b: 'y.pdf' })[id]
  assert.equal(resumenDeBorrado(['a'], [], nombreDe), '1 enviado a la papelera.')
  assert.equal(resumenDeBorrado(['a'], [{ id: 'b', error: 'Sin permiso.' }], nombreDe), '1 enviado a la papelera, 1 falló: «y.pdf»: Sin permiso.')
  assert.equal(resumenDeBorrado([], [], nombreDe), 'No se borró nada.')
})
