/**
 * Logica de "Fusionar entidades": quien puede, a que ruta se pregunta, que se ofrece como destino y
 * cuando la vista previa deja confirmar. Lo que dibuja el dialogo se prueba en el navegador.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  avisoDeOmitidas,
  diasParaDeshacer,
  eleccionesIniciales,
  etiquetaDeAccion,
  etiquetaDeEstadoDeFusion,
  fichaDeEntidadFusionable,
  nombreDeEntidadFusionable,
  opcionesDeDestino,
  puedeConfirmarFusion,
  puedeFusionar,
  rutaDeDestinos,
  rutaDeFusion,
  rutaDePrevisualizacion,
  salidaDelOrigen,
  origenEstaEnPapelera,
  textoDeValor,
  textoParaDeshacer,
  totalDeFilas
} from '../src/dominio/fusion.ts'
import { CONTEOS_DE_FUSION, CONFLICTOS_DE_FUSION, DUPLICADOS_DE_FUSION } from '../src/definiciones/fusion.ts'

test('puedeFusionar: administracion y coordinacion multiarea, nadie mas', () => {
  const base = { is_admin: false, is_superadmin: false, is_coordinador_multiarea: false }

  assert.equal(puedeFusionar(base), false)
  assert.equal(puedeFusionar({ ...base, is_admin: true }), true)
  assert.equal(puedeFusionar({ ...base, is_superadmin: true }), true)
  assert.equal(puedeFusionar({ ...base, is_coordinador_multiarea: true }), true)
})

test('las rutas usan el prefijo de cada entidad: los prospectos son `prospectos`', () => {
  assert.equal(rutaDePrevisualizacion('projects', 5, 9), 'projects/5/merge-preview?into=9')
  assert.equal(rutaDePrevisualizacion('prospects', 5, 9), 'prospectos/5/merge-preview?into=9')
  assert.equal(rutaDeFusion('clients', 7), 'clients/7/actions/merge')
  assert.match(rutaDeDestinos('clients'), /^clients\/minimos\?/)
  assert.match(rutaDeDestinos('prospects'), /^prospectos\?/)
  assert.match(rutaDeDestinos('projects'), /^projects\?/)
})

test('nombres y fichas salen del glosario y de las rutas del panel', () => {
  assert.equal(nombreDeEntidadFusionable('projects'), 'Proyecto')
  assert.equal(nombreDeEntidadFusionable('clients', true), 'Clientes')
  assert.equal(nombreDeEntidadFusionable('prospects'), 'Prospecto')
  assert.equal(fichaDeEntidadFusionable('projects', 3), '/proyectos/3')
  assert.equal(fichaDeEntidadFusionable('clients', 3), '/clientes/3')
  assert.equal(fichaDeEntidadFusionable('prospects', 3), '/prospectos/3')
})

test('opcionesDeDestino unifica el nombre de cada entidad y saca el origen', () => {
  const proyectos = [{ id: 1, name: 'Uno' }, { id: 2, name: 'Dos' }]
  const clientes = [{ id: 1, company: 'Acme' }, { id: 2, company: 'Beta' }]
  const prospectos = [{ id: 1, empresa: 'Gama' }, { id: 2, empresa: 'Delta' }]

  assert.deepEqual(opcionesDeDestino('projects', proyectos, 1), [{ valor: '2', etiqueta: 'Dos' }])
  assert.deepEqual(opcionesDeDestino('clients', clientes, 2), [{ valor: '1', etiqueta: 'Acme' }])
  assert.deepEqual(opcionesDeDestino('prospects', prospectos, 99).map((o) => o.etiqueta), ['Gama', 'Delta'])
})

test('opcionesDeDestino descarta filas rotas y respuestas que no son listas', () => {
  const filas = [null, 'x', { id: 'a', name: 'sin id numerico' }, { id: 3, name: '  ' }, { id: 4 }, { id: 5, name: 'Bien' }]

  assert.deepEqual(opcionesDeDestino('projects', filas, 0), [{ valor: '5', etiqueta: 'Bien' }])
  assert.deepEqual(opcionesDeDestino('projects', undefined, 0), [])
  assert.deepEqual(opcionesDeDestino('projects', { data: [] }, 0), [])
})

test('eleccionesIniciales deja cada conflicto con el valor del destino', () => {
  const conflictos = [
    { campo: 'vat', etiqueta: 'RUT', valor_origen: '1-9', valor_destino: '2-7' },
    { campo: 'city', etiqueta: 'Ciudad', valor_origen: 'Temuco', valor_destino: null }
  ]

  assert.deepEqual(eleccionesIniciales(conflictos), { vat: 'destino', city: 'destino' })
  assert.deepEqual(eleccionesIniciales([]), {})
})

test('un bloqueo en pie o la funcion apagada impiden confirmar', () => {
  assert.equal(puedeConfirmarFusion({ bloqueos: [], habilitada: true }), true)
  assert.equal(puedeConfirmarFusion({ bloqueos: ['Los proyectos son de clientes distintos.'], habilitada: true }), false)
  assert.equal(puedeConfirmarFusion({ bloqueos: [], habilitada: false }), false)
})

test('los Prospectos no pasan por la Papelera: se eliminan con respaldo', () => {
  assert.equal(origenEstaEnPapelera('projects'), true)
  assert.equal(origenEstaEnPapelera('clients'), true)
  assert.equal(origenEstaEnPapelera('prospects'), false)
  assert.match(salidaDelOrigen('clients'), /Papelera/)
  assert.doesNotMatch(salidaDelOrigen('prospects'), /Papelera/)
})

test('etiquetaDeAccion traduce el catalogo y calla lo que no conoce', () => {
  assert.equal(etiquetaDeAccion('mover'), 'Pasa al destino')
  assert.equal(etiquetaDeAccion('conservar_destino'), 'Queda el del destino')
  assert.equal(etiquetaDeAccion('algo_nuevo'), '')
  assert.equal(etiquetaDeAccion(undefined), '')
})

test('totalDeFilas suma y no se deja engañar por un valor que no es numero', () => {
  assert.equal(totalDeFilas([]), 0)
  assert.equal(totalDeFilas([{ tabla: 'a', etiqueta: 'A', filas: 4 }, { tabla: 'b', etiqueta: 'B', filas: 6 }]), 10)
  assert.equal(totalDeFilas([{ tabla: 'a', etiqueta: 'A', filas: Number.NaN }, { tabla: 'b', etiqueta: 'B', filas: 2 }]), 2)
})

test('textoDeValor muestra un guion largo donde no hay valor', () => {
  assert.equal(textoDeValor(null), '—')
  assert.equal(textoDeValor(undefined), '—')
  assert.equal(textoDeValor('   '), '—')
  assert.equal(textoDeValor('Acme'), 'Acme')
  assert.equal(textoDeValor(0), '0')
  assert.equal(textoDeValor(true), 'Sí')
  assert.equal(textoDeValor(false), 'No')
})

test('diasParaDeshacer cuenta hacia arriba y llega a cero cuando el plazo vencio', () => {
  const ahora = new Date('2026-10-10T12:00:00Z')

  assert.equal(diasParaDeshacer(null, ahora), 0)
  assert.equal(diasParaDeshacer('basura', ahora), 0)
  assert.equal(diasParaDeshacer('2026-10-09T12:00:00Z', ahora), 0)
  assert.equal(diasParaDeshacer('2026-10-10T13:00:00Z', ahora), 1)
  assert.equal(diasParaDeshacer('2026-11-09T12:00:00Z', ahora), 30)
})

test('textoParaDeshacer', () => {
  assert.equal(textoParaDeshacer(0), 'Ya no se puede')
  assert.equal(textoParaDeshacer(1), '1 día')
  assert.equal(textoParaDeshacer(12), '12 días')
})

test('etiquetaDeEstadoDeFusion conoce los tres estados y deja pasar uno nuevo tal cual', () => {
  assert.equal(etiquetaDeEstadoDeFusion('aplicada'), 'Fusionada')
  assert.equal(etiquetaDeEstadoDeFusion('pendiente_archivos'), 'Archivos pendientes')
  assert.equal(etiquetaDeEstadoDeFusion('revertida'), 'Deshecha')
  assert.equal(etiquetaDeEstadoDeFusion('en_proceso'), 'en_proceso')
})

test('avisoDeOmitidas solo habla si algo quedo sin devolver y cita pocos motivos', () => {
  const omitida = (motivo) => ({ tabla: 't', columna: 'c', motivo })

  assert.equal(avisoDeOmitidas([]), null)
  assert.match(avisoDeOmitidas([omitida('Cambió después.')]), /un cambio no se pudo devolver: Cambió después\./)
  assert.equal(
    avisoDeOmitidas([omitida('A'), omitida('A'), omitida('B'), omitida('C')]),
    'Se deshizo, pero 4 cambios no se pudieron devolver: A; B'
  )
})

test('las tablas de la vista previa no declaran orden ni filtros: no escriben en la URL de la pagina', () => {
  for (const definicion of [CONTEOS_DE_FUSION, DUPLICADOS_DE_FUSION, CONFLICTOS_DE_FUSION]) {
    assert.deepEqual(definicion.filtros, [])
    assert.deepEqual(definicion.ordenables, [])
    assert.equal(definicion.busqueda, false)
    assert.ok(definicion.columnas.every((columna) => columna.ordenPor === undefined))
  }
})
