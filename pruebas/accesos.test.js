/**
 * Pruebas del panel de accesos.
 *
 * Lo que se protege son cuatro cosas que, si se rompen, reparten permisos mal y en silencio:
 *
 *   1. Que **dos escalones no puedan compartir el orden**. El orden ES la herencia del piso: con dos
 *      en la misma posición, "lo que está debajo" deja de estar definido y el piso que la API suma
 *      depende del orden en que devuelva las filas.
 *   2. Que un escalón de **sistema** solo mande el nombre. La API rechaza el resto con 422, así que
 *      mandar el cuerpo entero convertiría un renombre legítimo en un error.
 *   3. Que una feature sin capacidades **desaparezca del piso** en vez de quedar como lista vacía:
 *      es la forma que devuelve la API, y un `{tasks: []}` de más haría ver cambios donde no hay.
 *   4. Que los filtros vacíos **no viajen** en la consulta de personas. Mandar `escalon=` obligaría a
 *      la API a decidir si eso es "sin escalón" o "cualquiera".
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  borradorDeEscalon,
  capacidadesDelPiso,
  consultaDePersonas,
  cuerpoDeEscalon,
  escalonesAsignables,
  estaEncendido,
  motivoParaRechazarEscalon,
  motivoParaRechazarNombre,
  nombreDeEscalon,
  pisoConCapacidad
} from '../src/dominio/accesos.ts'

/** Un escalón con lo mínimo, para no repetir el objeto entero en cada prueba. */
function escalon (clave, orden, extra = {}) {
  return {
    clave,
    nombre: clave,
    orden,
    piso: {},
    alcance: 'propio',
    jefatura: false,
    asignable: true,
    sistema: false,
    personas: 0,
    ...extra
  }
}

const CATALOGO = [
  escalon('usuario', 1, { nombre: 'Usuario', sistema: true }),
  escalon('lider', 2, { nombre: 'Líder' }),
  escalon('head', 3, { nombre: 'Head', asignable: false })
]

test('el orden repetido se rechaza y nombra a quien lo ocupa', () => {
  const borrador = { ...borradorDeEscalon(), clave: 'gerente', nombre: 'Gerencia', orden: '2' }
  const motivo = motivoParaRechazarEscalon(borrador, CATALOGO, null)

  assert.match(motivo ?? '', /Líder/)
})

test('el mismo orden en el escalón que se edita no es un choque consigo mismo', () => {
  const borrador = { ...borradorDeEscalon(CATALOGO[1]), nombre: 'Líder de equipo' }

  assert.equal(motivoParaRechazarEscalon(borrador, CATALOGO, 'lider'), null)
})

test('la clave se valida con el formato de la API y solo al crear', () => {
  const malo = { ...borradorDeEscalon(), clave: 'Jefe-De-Area', nombre: 'Jefe', orden: '9' }
  assert.match(motivoParaRechazarEscalon(malo, CATALOGO, null) ?? '', /clave/)

  const bueno = { ...malo, clave: 'jefe_de_area' }
  assert.equal(motivoParaRechazarEscalon(bueno, CATALOGO, null), null)
})

test('la clave duplicada se rechaza antes de salir', () => {
  const borrador = { ...borradorDeEscalon(), clave: 'lider', nombre: 'Otro líder', orden: '9' }

  assert.match(motivoParaRechazarEscalon(borrador, CATALOGO, null) ?? '', /lider/)
})

test('el nombre vacío y el orden no entero se rechazan', () => {
  const sinNombre = { ...borradorDeEscalon(), clave: 'x_y', nombre: '   ', orden: '9' }
  assert.match(motivoParaRechazarEscalon(sinNombre, CATALOGO, null) ?? '', /nombre/)

  const sinOrden = { ...borradorDeEscalon(), clave: 'x_y', nombre: 'X', orden: '' }
  assert.match(motivoParaRechazarEscalon(sinOrden, CATALOGO, null) ?? '', /orden/)

  const ordenCero = { ...borradorDeEscalon(), clave: 'x_y', nombre: 'X', orden: '0' }
  assert.match(motivoParaRechazarEscalon(ordenCero, CATALOGO, null) ?? '', /orden/)
})

test('un escalón de sistema solo valida y solo manda el nombre', () => {
  const borrador = { ...borradorDeEscalon(CATALOGO[0]), nombre: 'Colaborador', orden: '2' }

  // El orden 2 ya lo ocupa Líder, y aun así no bloquea: en los de sistema la API lo ignora.
  assert.equal(motivoParaRechazarEscalon(borrador, CATALOGO, 'usuario', true), null)
  assert.deepEqual(cuerpoDeEscalon(borrador, 'usuario', true), { nombre: 'Colaborador' })
})

test('el cuerpo del alta lleva la clave y el de la edición no', () => {
  const borrador = {
    ...borradorDeEscalon(),
    clave: 'jefe_de_area',
    nombre: 'Jefe de área',
    orden: '4',
    alcance: 'area',
    jefatura: true,
    piso: { tasks: ['view'] }
  }

  assert.equal(cuerpoDeEscalon(borrador, null).clave, 'jefe_de_area')
  assert.equal(cuerpoDeEscalon(borrador, 'jefe_de_area').clave, undefined)
  assert.deepEqual(cuerpoDeEscalon(borrador, null).piso, { tasks: ['view'] })
  assert.equal(cuerpoDeEscalon(borrador, null).orden, 4)
})

test('desmarcar la última capacidad saca la feature del piso', () => {
  const conUna = pisoConCapacidad({}, 'tasks', 'view', true)
  assert.deepEqual(conUna, { tasks: ['view'] })

  const vacio = pisoConCapacidad(conUna, 'tasks', 'view', false)
  assert.deepEqual(vacio, {})
  assert.equal(capacidadesDelPiso(vacio), 0)
})

test('marcar dos veces la misma capacidad no la duplica', () => {
  const una = pisoConCapacidad({ tasks: ['view'] }, 'tasks', 'view', true)

  assert.deepEqual(una, { tasks: ['view'] })
  assert.equal(capacidadesDelPiso({ tasks: ['view', 'edit'], projects: ['view'] }), 3)
})

test('solo los escalones asignables se ofrecen, y en orden', () => {
  const asignables = escalonesAsignables([CATALOGO[2], CATALOGO[1], CATALOGO[0]])

  assert.deepEqual(asignables.map((uno) => uno.clave), ['usuario', 'lider'])
})

test('un escalón que ya no está en el catálogo se muestra por su clave, no vacío', () => {
  assert.equal(nombreDeEscalon(CATALOGO, 'lider'), 'Líder')
  assert.equal(nombreDeEscalon(CATALOGO, 'fantasma'), 'fantasma')
  assert.equal(nombreDeEscalon(CATALOGO, null), '—')
})

test('los filtros vacíos no viajan y la página uno tampoco', () => {
  assert.equal(consultaDePersonas({ buscar: '', escalon: '', rol: '', area: '' }, 1), '')
  assert.equal(
    consultaDePersonas({ buscar: '  ana  ', escalon: 'head', rol: '', area: '' }, 3),
    '?buscar=ana&escalon=head&pagina=3'
  )
})

test('un nombre repetido se rechaza sin mirar mayúsculas ni espacios', () => {
  assert.equal(motivoParaRechazarNombre('Analytics', ['Diseño']), null)
  assert.match(motivoParaRechazarNombre('  analytics ', ['Analytics']) ?? '', /Ya existe/)
  assert.match(motivoParaRechazarNombre('   ', []) ?? '', /vacío/)
})

test('solo el "1" de tbloptions cuenta como encendido', () => {
  assert.equal(estaEncendido('1'), true)
  assert.equal(estaEncendido('0'), false)
  assert.equal(estaEncendido(''), false)
})
