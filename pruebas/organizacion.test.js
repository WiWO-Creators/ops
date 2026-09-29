/**
 * Pruebas de la pantalla de Organización.
 *
 * Lo que se protege:
 *
 *   1. Que la **salud** cuente solo gente activa y detecte las jefaturas de baja: un contador que
 *      incluye bajas promete huecos que no existen.
 *   2. Que el **listado** esconda las bajas salvo que se pidan, y que cada filtro recorte lo suyo.
 *   3. Que el **panel** mande solo lo que cambió, partido por endpoint: reenviar un campo igual
 *      dispara guards de la API (409 por el propio escalón) sin motivo.
 *   4. Que el **lote** salte de antemano lo que la API rechazaría: el propio escalón y los ciclos.
 *   5. Que el **CSV** resuelva nombres y escape comas y comillas.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cambiosDePersona,
  csvDePersonas,
  cuerpoDeLote,
  filtrarPersonas,
  formularioDe,
  hayCambios,
  nodosDesdePersonas,
  omitidasDelLote,
  saludDeOrganizacion
} from '../src/dominio/organizacion.ts'

/** Una persona de prueba con valores por defecto razonables. */
function persona (staffid, extra = {}) {
  return {
    staffid,
    nombre: `Persona ${staffid}`,
    correo: `p${staffid}@wiwo.cl`,
    escalon: 'staff',
    jefe_staffid: null,
    jefe_nombre: null,
    area_id: null,
    area_ids: [],
    cargo_id: null,
    activo: true,
    coordinador_multiarea: false,
    is_admin: false,
    is_superadmin: false,
    ...extra
  }
}

/** Un área de prueba. */
function area (id, extra = {}) {
  return { id, nombre: `Área ${id}`, area_superior_id: null, jefe_staffid: null, personas: 1, en_tareas: true, ...extra }
}

const SIN_FILTROS = { buscar: '', escalon: '', area: '', cargo: '', problema: '', rol: '' }

test('la salud cuenta solo gente activa y marca jefaturas dadas de baja', () => {
  const personas = [
    persona(1, { area_id: 10, jefe_staffid: 2 }),
    persona(2, { area_id: 10 }),
    persona(3),
    persona(4, { activo: false })
  ]
  const areas = [area(10, { jefe_staffid: 2 }), area(11, { jefe_staffid: 4, personas: 0, en_tareas: false }), area(12), area(13, { personas: 0 })]

  const salud = saludDeOrganizacion(personas, areas)
  const ids = (grupo, clave) => salud[grupo].find((uno) => uno.clave === clave).ids

  assert.deepEqual(ids('personas', 'sin_area'), [3])
  assert.deepEqual(ids('personas', 'sin_jefe'), [2, 3])
  assert.deepEqual(ids('areas', 'sin_jefatura'), [12], 'un área vacía cuenta como vacía, no como sin jefatura')
  assert.deepEqual(ids('areas', 'jefatura_de_baja'), [11])
  assert.deepEqual(ids('areas', 'vacia'), [11, 13])
  assert.deepEqual(ids('areas', 'fuera_de_procesos'), [11])
  assert.equal(salud.total, 8)
})

test('un organigrama completo no tiene huecos', () => {
  const personas = [persona(1, { area_id: 10, jefe_staffid: 2 }), persona(2, { area_id: 10, jefe_staffid: 1 })]
  const salud = saludDeOrganizacion(personas, [area(10, { jefe_staffid: 1 })])

  assert.equal(salud.total, 0)
})

test('el listado esconde las bajas salvo que se pidan', () => {
  const personas = [persona(1), persona(2, { activo: false })]
  const salud = saludDeOrganizacion(personas, [])

  assert.deepEqual(filtrarPersonas(personas, SIN_FILTROS, salud).map((uno) => uno.staffid), [1])
  assert.deepEqual(filtrarPersonas(personas, { ...SIN_FILTROS, rol: 'baja' }, salud).map((uno) => uno.staffid), [2])
})

test('cada filtro recorta lo suyo, y la búsqueda ignora tildes y mayúsculas', () => {
  const personas = [
    persona(1, { nombre: 'Íñigo Pérez', escalon: 'lead', area_id: 10, area_ids: [10, 11], cargo_id: 3 }),
    persona(2, { nombre: 'Ana Soto', is_admin: true }),
    persona(3, { nombre: 'Luis Gil', is_admin: true, is_superadmin: true, coordinador_multiarea: true })
  ]
  const salud = saludDeOrganizacion(personas, [])
  const filtrar = (cambio) => filtrarPersonas(personas, { ...SIN_FILTROS, ...cambio }, salud).map((uno) => uno.staffid)

  assert.deepEqual(filtrar({ buscar: 'inigo perez' }), [1])
  assert.deepEqual(filtrar({ escalon: 'lead' }), [1])
  assert.deepEqual(filtrar({ area: '11' }), [1], 'filtra también por las áreas adicionales')
  assert.deepEqual(filtrar({ cargo: '3' }), [1])
  assert.deepEqual(filtrar({ rol: 'admin' }), [2], 'administrador no incluye a superadministradores')
  assert.deepEqual(filtrar({ rol: 'superadmin' }), [3])
  assert.deepEqual(filtrar({ rol: 'coordinador' }), [3])
  assert.deepEqual(filtrar({ problema: 'sin_area' }), [2, 3])
})

test('el panel manda solo lo que cambió, partido por endpoint', () => {
  const guardada = persona(5, { escalon: 'lead', jefe_staffid: 1, area_id: 10, cargo_id: 2 })
  const formulario = formularioDe(guardada)

  assert.equal(hayCambios(cambiosDePersona(guardada, formulario)), false)

  const cambios = cambiosDePersona(guardada, { ...formulario, jefe_staffid: null, rol: 'admin' })

  assert.deepEqual(cambios.accesos, { jefe_staffid: null })
  assert.deepEqual(cambios.rol, { is_admin: true })
})

test('pasar a superadministrador escribe solo las banderas que faltan', () => {
  const admin = persona(6, { is_admin: true })
  const cambios = cambiosDePersona(admin, { ...formularioDe(admin), rol: 'superadmin' })

  assert.deepEqual(cambios.rol, { is_superadmin: true })
  assert.deepEqual(cambios.accesos, {})
})

test('el lote salta el propio escalón y los ciclos', () => {
  const personas = [
    persona(1),
    persona(2, { jefe_staffid: 1 }),
    persona(3, { jefe_staffid: 2 })
  ]
  const nodos = nodosDesdePersonas(personas)

  const escalon = omitidasDelLote(personas, 'escalon', 'lead', 1, nodos)
  assert.deepEqual([...escalon.keys()], [1])

  // Poner a todos a cargo de 3: 1 y 2 están por encima de 3, así que colgarlos de él sería un ciclo;
  // 3 tampoco puede colgar de sí mismo.
  const jefe = omitidasDelLote(personas, 'jefe', 3, 99, nodos)
  assert.deepEqual([...jefe.keys()].sort(), [1, 2, 3])

  assert.equal(omitidasDelLote(personas, 'jefe', null, 99, nodos).size, 0, 'desenganchar nunca cierra un ciclo')
})

test('el cuerpo del lote corresponde a cada acción', () => {
  assert.deepEqual(cuerpoDeLote('area', '10'), { area_id: 10 })
  assert.deepEqual(cuerpoDeLote('area', null), { area_id: null })
  assert.deepEqual(cuerpoDeLote('jefe', 4), { jefe_staffid: 4 })
  assert.deepEqual(cuerpoDeLote('cargo', '2'), { cargo_id: 2 })
  assert.deepEqual(cuerpoDeLote('escalon', 'director'), { escalon: 'director' })
})

test('los nodos leen como raíz a quien cuelga de una baja', () => {
  const nodos = nodosDesdePersonas([persona(1, { activo: false }), persona(2, { jefe_staffid: 1 })])

  assert.deepEqual(nodos, [{ staffid: 2, nombre: 'Persona 2', escalon: 'staff', jefe_staffid: null }])
})

test('el CSV resuelve nombres y escapa comas y comillas', () => {
  const texto = csvDePersonas(
    [persona(1, { nombre: 'Pérez, "Toto"', area_id: 10, cargo_id: 2, jefe_nombre: 'Ana', is_admin: true })],
    [area(10, { nombre: 'Analytics' })],
    [{ id: 2, nombre: 'Colaborador', personas: 1 }]
  )
  const [encabezado, fila] = texto.split('\r\n')

  assert.equal(encabezado, 'Nombre,Correo,Escalón,A cargo de,Área,Cargo,Rol de sistema,Coordina varias áreas,Activa')
  assert.equal(fila, '"Pérez, ""Toto""",p1@wiwo.cl,Staff,Ana,Analytics,Colaborador,Administrador,No,Sí')
})
