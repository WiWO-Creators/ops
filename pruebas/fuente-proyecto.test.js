/**
 * Pruebas de `FuenteDeProyecto`, la pieza que deja montar un panel del equipo en el portal.
 *
 * Lo que se prueba no es cada ruta letra por letra: es lo que sostiene el diseño.
 *
 *  1. Las dos fuentes declaran **las mismas claves**. Una clave que exista en el panel y falte en el
 *     portal devolveria `undefined`, el panel pediria `/api/bff/undefined` y la unica forma de
 *     arreglarlo seria una rama por sujeto adentro del panel —justo lo que esta pieza existe para
 *     evitar—.
 *  2. **Todas las rutas del portal empiezan con `portal/`**. El BFF elige el sujeto por el primer
 *     segmento: una ruta del portal sin ese prefijo saldria con la sesion del staff, o moriria en la
 *     lista blanca. Es la garantia de que inyectar rutas alcanza.
 *  3. Los `null` del portal son **los mismos** que el diseño declara. Son lo que apaga la escritura
 *     y las columnas internas sin una rama; agregar uno de mas dejaria un panel sin datos y quitar
 *     uno haria que el cliente pida un recurso que no le corresponde.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fuenteDelPanel, fuenteDelPortal, TAREA_DEL_PANEL } from '../src/dominio/fuente-proyecto.ts'

const PROYECTO = 7
const panel = fuenteDelPanel(PROYECTO)
const portal = fuenteDelPortal(PROYECTO)

/** Los recursos que el contacto no tiene. Son los unicos `null` permitidos. */
const SIN_RECURSO = ['subrecursosDeTarea', 'resumenDeTareas', 'camposDeTareas', 'dependenciasDeTareas']

/**
 * Resuelve una clave de la fuente a la ruta que produce.
 *
 * Las funciones se llaman con un argumento de juguete: lo que interesa es la ruta, no el valor.
 *
 * @param fuente Una de las dos fuentes.
 * @param clave La clave a resolver.
 * @returns La ruta, o `null` si el sujeto no tiene ese recurso.
 */
function rutaDe (fuente, clave) {
  const valor = fuente[clave]

  if (valor === null) return null
  if (typeof valor === 'function') return valor(clave === 'tareas' || clave === 'calendario' ? '' : 3)

  return valor
}

test('las dos fuentes declaran las mismas claves', () => {
  assert.deepEqual(Object.keys(panel).sort(), Object.keys(portal).sort())
})

test('cada clave tiene el mismo tipo en las dos fuentes', () => {
  for (const clave of Object.keys(panel)) {
    if (SIN_RECURSO.includes(clave)) continue

    assert.equal(typeof portal[clave], typeof panel[clave], clave)
  }
})

test('todas las rutas del portal empiezan con portal/', () => {
  for (const clave of Object.keys(portal)) {
    if (clave === 'sujeto') continue

    const ruta = rutaDe(portal, clave)

    if (ruta === null) continue

    assert.equal(ruta.startsWith('portal/'), true, `${clave} → ${ruta}`)
  }
})

test('ninguna ruta lleva barra inicial: el BFF ya pone el prefijo', () => {
  for (const fuente of [panel, portal]) {
    for (const clave of Object.keys(fuente)) {
      if (clave === 'sujeto') continue

      const ruta = rutaDe(fuente, clave)

      if (ruta === null) continue

      assert.equal(ruta.startsWith('/'), false, `${clave} → ${ruta}`)
    }
  }
})

test('el portal deja en null exactamente los recursos que un contacto no tiene', () => {
  const nulos = Object.keys(portal).filter((clave) => portal[clave] === null)

  assert.deepEqual(nulos.sort(), [...SIN_RECURSO].sort())
})

test('el panel tiene todos los recursos: ningun null', () => {
  const nulos = Object.keys(panel).filter((clave) => panel[clave] === null)

  assert.deepEqual(nulos, [])
})

test('las rutas del panel cuelgan del proyecto que se pidio', () => {
  assert.equal(panel.tareas(''), 'projects/7/tasks')
  assert.equal(panel.tareas('page=2'), 'projects/7/tasks?page=2')
  assert.equal(panel.resumen, 'projects/7/overview')
  assert.equal(panel.hitos(500), 'projects/7/milestones?per_page=500')
  assert.equal(panel.acta(12), 'projects/7/actas/12')
})

test('el calendario del portal es su ruta propia y no el listado de tareas', () => {
  // La API lo exige aparte (`exigirPestania('calendar')`) aunque lo acote con las mismas dos
  // condiciones que las Tareas: pedirle el listado seria pasar por la pestaña equivocada.
  assert.equal(portal.calendario(''), 'portal/projects/7/calendar')
  assert.equal(portal.calendario('sort=due_date'), 'portal/projects/7/calendar?sort=due_date')
  // En el panel el calendario es una lectura mas del mismo listado.
  assert.equal(panel.calendario(''), panel.tareas(''))
})

test('el detalle de un Proceso del portal cuelga del proyecto', () => {
  // Nunca `portal/tasks/{id}`: la API del contacto no expone Procesos sueltos, y la pertenencia al
  // proyecto es lo que la deja decidir si esa tarea le corresponde.
  assert.equal(portal.tarea(512), 'portal/projects/7/tasks/512')
})

test('el detalle del panel pide los campos personalizados', () => {
  // Sin el include la clave no viaja, y el "Área de la compañía" solo se veria entrando a editar.
  assert.equal(panel.tarea(512), 'tasks/512?include=custom_fields')
})

test('un id no se interpola en crudo', () => {
  const fuente = fuenteDelPanel(Number('7'))

  assert.equal(fuente.tareas(''), 'projects/7/tasks')
  // El id llega como numero, asi que no hay nada que escapar; lo que se prueba es que la ruta no se
  // arme con texto libre.
  assert.equal(fuente.tarea(0), 'tasks/0?include=custom_fields')
})

test('la fuente del proyecto satisface la del detalle de una tarea', () => {
  // `ModalTarea` pide lo minimo (`FuenteDeTarea`) y la pestaña le pasa la fuente entera sin
  // adaptarla. Si dejaran de encajar, el modal volveria a necesitar su propia rama.
  for (const clave of Object.keys(TAREA_DEL_PANEL)) {
    assert.equal(clave in panel, true, clave)
    assert.equal(clave in portal, true, clave)
  }
})

test('el detalle suelto del panel es el que ya usaban las pantallas sin proyecto', () => {
  assert.equal(TAREA_DEL_PANEL.tarea(9), 'tasks/9?include=custom_fields')
  assert.equal(TAREA_DEL_PANEL.lookups, 'lookups')
  assert.equal(TAREA_DEL_PANEL.subrecursosDeTarea(9), 'tasks/9')
})
