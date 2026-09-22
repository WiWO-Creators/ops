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
 *  4. **Todo es texto.** La fuente la arma un Server Component y la recibe un panel, que es cliente:
 *     una funcion adentro rompe la serializacion de React y la pagina no compila.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  conConsulta,
  conId,
  fuenteDelPanel,
  fuenteDelPortal,
  TAREA_DEL_PANEL
} from '../src/dominio/fuente-proyecto.ts'

const panel = fuenteDelPanel(7)
const portal = fuenteDelPortal(7)

/** Los recursos que el contacto no tiene. Son los unicos `null` permitidos. */
// `resumenDeTareas` salio de esta lista: los contadores por estado de la ficha son los mismos para
// los dos sujetos, y el portal ya tiene su ruta. Lo que el contacto no tiene sigue siendo lo que
// no puede pedir, no lo que todavia no le habiamos dado.
const SIN_RECURSO = [
  'subrecursosDeTarea', 'camposDeTareas', 'dependenciasDeTareas', 'actaTareas'
]

test('las dos fuentes declaran las mismas claves', () => {
  assert.deepEqual(Object.keys(panel).sort(), Object.keys(portal).sort())
})

test('la fuente es serializable: solo texto y null', () => {
  // Cruza el limite de Server a Client Component. Una funcion adentro es un error de build.
  for (const fuente of [panel, portal, TAREA_DEL_PANEL]) {
    for (const [clave, valor] of Object.entries(fuente)) {
      assert.equal(valor === null || typeof valor === 'string', true, `${clave} es ${typeof valor}`)
    }
  }
})

test('todas las rutas del portal empiezan con portal/', () => {
  for (const [clave, valor] of Object.entries(portal)) {
    if (clave === 'sujeto' || valor === null) continue

    assert.equal(valor.startsWith('portal/'), true, `${clave} → ${valor}`)
  }
})

test('ninguna ruta lleva barra inicial: el BFF ya pone el prefijo', () => {
  for (const fuente of [panel, portal]) {
    for (const [clave, valor] of Object.entries(fuente)) {
      if (clave === 'sujeto' || valor === null) continue

      assert.equal(valor.startsWith('/'), false, `${clave} → ${valor}`)
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
  assert.equal(panel.tareas, 'projects/7/tasks')
  assert.equal(panel.resumen, 'projects/7/overview')
  assert.equal(panel.hitos, 'projects/7/milestones')
  assert.equal(panel.tiempos, 'projects/7/timesheets')
  assert.equal(panel.gantt, 'projects/7/gantt')
})

test('el calendario del portal es su ruta propia y no el listado de tareas', () => {
  // La API lo exige aparte (`exigirPestania('calendar')`) aunque lo acote con las mismas dos
  // condiciones que las Tareas: pedirle el listado seria pasar por la pestaña equivocada.
  assert.equal(portal.calendario, 'portal/projects/7/calendar')
  // En el panel el calendario es una lectura mas del mismo listado.
  assert.equal(panel.calendario, panel.tareas)
})

test('el detalle de un Proceso del portal cuelga del proyecto', () => {
  // Nunca `portal/tasks/{id}`: la API del contacto no expone Procesos sueltos, y la pertenencia al
  // proyecto es lo que la deja decidir si esa tarea le corresponde.
  assert.equal(conId(portal.tarea, 512), 'portal/projects/7/tasks/512')
})

test('el detalle del panel pide los campos personalizados', () => {
  // Sin el include la clave no viaja, y el "Área de la compañía" solo se veria entrando a editar.
  assert.equal(conId(panel.tarea, 512), 'tasks/512?include=custom_fields')
})

test('conId resuelve el id antes del query, no despues', () => {
  assert.equal(conId('tasks/:id?include=custom_fields', 9), 'tasks/9?include=custom_fields')
})

test('conConsulta respeta la ruta que ya trae query', () => {
  assert.equal(conConsulta('projects/7/tasks', ''), 'projects/7/tasks')
  assert.equal(conConsulta('projects/7/tasks', 'page=2'), 'projects/7/tasks?page=2')
  assert.equal(conConsulta('tasks/9?include=custom_fields', 'page=2'), 'tasks/9?include=custom_fields&page=2')
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
  assert.equal(conId(TAREA_DEL_PANEL.tarea, 9), 'tasks/9?include=custom_fields')
  assert.equal(TAREA_DEL_PANEL.lookups, 'lookups')
  assert.equal(conId(TAREA_DEL_PANEL.subrecursosDeTarea, 9), 'tasks/9')
})
