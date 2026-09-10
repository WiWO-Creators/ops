import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  crearBorrador, claveBorrador, leerBorrador, guardarBorrador, eliminarBorrador
} from '../src/dominio/flujo-licitacion.ts'

/** Almacenamiento local en memoria para comprobar persistencia sin navegador. */
function almacenamiento () {
  const datos = new Map()
  return {
    getItem: clave => datos.get(clave) ?? null,
    setItem: (clave, valor) => datos.set(clave, valor),
    removeItem: clave => datos.delete(clave)
  }
}

test('restaura valores y checkpoint sin mezclar usuario ni prospecto', () => {
  const local = almacenamiento()
  const clave = claveBorrador(7, 20)
  const borrador = {
    ...crearBorrador(20, { empresa: 'Empresa', activo: true }),
    paso: 2, contactoId: 30,
    valoresContacto: { email: 'contacto@example.test' },
    valoresLicitacion: { nombre: 'Evento', descripcion: '' },
    pendiente: 'licitacion'
  }
  guardarBorrador(local, clave, borrador)
  assert.deepEqual(leerBorrador(local, clave), borrador)
  assert.equal(leerBorrador(local, claveBorrador(8, 20)), null)
  assert.equal(leerBorrador(local, claveBorrador(7, 21)), null)
  assert.equal(leerBorrador(local, claveBorrador(7)), null)
  eliminarBorrador(local, clave)
  assert.equal(leerBorrador(local, clave), null)
})

test('inicia en prospecto nuevo o continúa desde uno existente y conserva creación pendiente', () => {
  const nuevo = crearBorrador()
  assert.equal(nuevo.paso, 0)
  assert.equal(nuevo.prospectoId, null)
  assert.equal(nuevo.licitacionId, null)
  assert.equal(crearBorrador(20).paso, 1)
  const local = almacenamiento()
  for (const pendiente of ['prospecto', 'contacto', 'licitacion', null]) {
    const borrador = { ...nuevo, pendiente }
    guardarBorrador(local, 'prueba', borrador)
    assert.deepEqual(leerBorrador(local, 'prueba'), borrador)
  }
  assert.throws(() => crearBorrador(0), /válido/)
  assert.throws(() => claveBorrador(-1), /cuenta/)
  assert.throws(() => claveBorrador(1, 0), /cuenta/)
})

test('rechaza borradores corruptos sin borrarlos ni confundirlos con ausencia', () => {
  const local = almacenamiento()
  const nuevo = crearBorrador()
  for (const valor of [null, [], {}, { ...nuevo, version: 2 }, { ...nuevo, paso: 3 },
    { ...nuevo, paso: 1 }, { ...nuevo, paso: 2, prospectoId: 2 },
    { ...nuevo, prospectoId: -1 }, { ...nuevo, contactoId: 1.5 },
    { ...nuevo, licitacionId: 0 }, { ...nuevo, licitacionId: 5 },
    { ...nuevo, prospectoId: 2, licitacionId: 5 },
    { ...nuevo, valoresContacto: [] }, { ...nuevo, valoresProspecto: { empresa: 42 } },
    { ...nuevo, pendiente: 'otro' }]) {
    const texto = JSON.stringify(valor)
    local.setItem('prueba', texto)
    assert.throws(() => leerBorrador(local, 'prueba'), /no es válido/)
    assert.equal(local.getItem('prueba'), texto)
  }
  local.setItem('prueba', '{')
  assert.throws(() => leerBorrador(local, 'prueba'), /no es válido/)
  assert.throws(() => guardarBorrador(local, 'prueba', {}), /inválido/)
})

test('informa cuota agotada o almacenamiento bloqueado sin aparentar éxito', () => {
  const error = new Error('QuotaExceededError')
  const local = {
    getItem () { throw error },
    setItem () { throw error },
    removeItem () { throw error }
  }
  assert.throws(() => leerBorrador(local, 'prueba'), /No se pudo leer/)
  assert.throws(() => guardarBorrador(local, 'prueba', crearBorrador()), /No se pudo guardar/)
  assert.throws(() => eliminarBorrador(local, 'prueba'), /No se pudo eliminar/)
})


test('conserva la licitación confirmada si el navegador impide eliminar el borrador', () => {
  const local = almacenamiento()
  const clave = claveBorrador(7)
  const terminado = {
    ...crearBorrador(20), paso: 2, contactoId: 30, licitacionId: 40
  }
  guardarBorrador(local, clave, terminado)
  const bloqueado = {
    ...local,
    removeItem () { throw new Error('SecurityError') }
  }
  assert.throws(() => eliminarBorrador(bloqueado, clave), /No se pudo eliminar/)
  assert.deepEqual(leerBorrador(local, clave), terminado)
  assert.equal(leerBorrador(local, clave).licitacionId, 40)
})
