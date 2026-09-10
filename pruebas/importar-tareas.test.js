import test from 'node:test'
import assert from 'node:assert/strict'

import {
  cuerpoDeImportacion,
  filtrarOrigenes,
  habilitaArchivar,
  resumenDelInforme,
  rutaHitosDestino,
  rutaImportar,
  rutaInforme,
  rutaProyectosOrigen,
  validarImportacion
} from '../src/componentes/proyecto/importar-tareas.ts'

/** Informe con los valores que dan "todo bien"; cada prueba pisa lo que le interesa. */
function informe (cambios = {}) {
  return {
    origen: { id: 100, nombre: 'Septiembre 2026', tareas: 12 },
    destino: { id: 200, nombre: 'Cuenta Acme' },
    hito: { id: 77, nombre: 'Septiembre' },
    importadas: 12,
    pendientes: 0,
    listo: true,
    diferencias: [],
    ...cambios
  }
}

test('el listado de origen pide también los archivados', () => {
  const ruta = rutaProyectosOrigen()

  // Sin este filtro el backend fuerza `archivado = 0`, y los meses viejos —que son justo los que se
  // vienen a reorganizar— no aparecerían en la lista.
  assert.ok(ruta.includes('filter%5Barchivado%5D=0%2C1'))
  assert.ok(ruta.startsWith('projects?'))
})

test('las rutas del informe y de la importación llevan el destino en la ruta y el resto como datos', () => {
  assert.equal(rutaInforme(200, 100, 77), 'projects/200/import-tasks?origen_id=100&hito_id=77')
  assert.equal(rutaImportar(200), 'projects/200/actions/import-tasks')
  assert.deepEqual(cuerpoDeImportacion(100, 77), { origen_id: 100, hito_id: 77 })
  assert.ok(rutaHitosDestino(200).startsWith('projects/200/milestones'))
})

test('el proyecto que se está mirando nunca es candidato a ser el origen', () => {
  const proyectos = [
    { id: 100, name: 'Septiembre 2026' },
    { id: 200, name: 'Cuenta Acme' },
    { id: 300, name: 'Octubre 2026' }
  ]

  assert.deepEqual(filtrarOrigenes(proyectos, 200, '').map((p) => p.id), [100, 300])
})

test('el buscador de origen ignora mayúsculas y acentos', () => {
  const proyectos = [
    { id: 100, name: 'Gráfica de septiembre' },
    { id: 300, name: 'Otro' }
  ]

  assert.deepEqual(filtrarOrigenes(proyectos, 200, 'grafica').map((p) => p.id), [100])
  assert.deepEqual(filtrarOrigenes(proyectos, 200, '  GRÁFICA  ').map((p) => p.id), [100])
  assert.deepEqual(filtrarOrigenes(proyectos, 200, 'nada').map((p) => p.id), [])
})

test('no se deja disparar la importación sin las dos elecciones', () => {
  assert.equal(validarImportacion(null, 77, 200), 'Elegí de qué proyecto vas a traer las tareas.')
  assert.equal(validarImportacion(100, null, 200), 'Elegí a qué hito van a entrar las tareas.')
  assert.equal(validarImportacion(200, 77, 200), 'El proyecto de origen no puede ser este mismo.')
  assert.equal(validarImportacion(100, 77, 200), null)
})

test('el resumen distingue las cuatro situaciones que cambian lo que se puede hacer', () => {
  assert.match(
    resumenDelInforme(informe({ origen: { id: 100, nombre: 'Vacío', tareas: 0 }, importadas: 0 })),
    /no tiene tareas para traer/
  )

  assert.match(
    resumenDelInforme(informe({ importadas: 0, pendientes: 12, listo: false })),
    /Se van a copiar 12 tareas/
  )

  assert.match(
    resumenDelInforme(informe({ importadas: 5, pendientes: 7, listo: false })),
    /Quedan 7 por traer/
  )

  assert.match(
    resumenDelInforme(informe({
      listo: false,
      diferencias: [{ tarea_origen: 1, nombre: 'Revisión', copia_id: 9, campo: 'priority', origen: '2', copia: '1' }]
    })),
    /1 dato no coincide/
  )

  assert.match(resumenDelInforme(informe()), /Ya se puede archivar/)
})

test('el resumen concuerda en singular', () => {
  assert.match(
    resumenDelInforme(informe({ origen: { id: 100, nombre: 'Uno', tareas: 1 }, importadas: 1 })),
    /^1 tarea de "Uno" está en/
  )
  assert.match(
    resumenDelInforme(informe({ importadas: 0, pendientes: 1, listo: false })),
    /^Se van a copiar 1 tarea de/
  )
  assert.match(
    resumenDelInforme(informe({
      importadas: 3,
      listo: false,
      diferencias: [{ tarea_origen: 1, nombre: 'R', copia_id: 9, campo: 'priority', origen: '2', copia: '1' }]
    })),
    /^Se copiaron 3 tareas, pero 1 dato no coincide/
  )
})

test('archivar se habilita solo con el visto bueno del backend', () => {
  assert.equal(habilitaArchivar(null), false)
  assert.equal(habilitaArchivar(informe({ listo: false })), false)
  assert.equal(habilitaArchivar(informe()), true)

  // El `listo` manda aunque las cuentas parezcan cerradas: la regla vive en el backend, y
  // recalcularla acá es tener dos versiones que se separan en cuanto una cambia.
  assert.equal(habilitaArchivar(informe({ listo: false, pendientes: 0, diferencias: [] })), false)
})
