/**
 * Pruebas de `ProyectoVista`, la forma con la que los dos sujetos dibujan el mismo Proyecto.
 *
 * Lo que se prueba no es el mapeo campo a campo: es que el adaptador del portal **no deje pasar** lo
 * que es del equipo. La cabecera es una sola y la comparten las cuatro pantallas, asi que el unico
 * lugar donde se decide que ve el cliente es este archivo. Si alguien agrega un campo interno a la
 * vista y lo copia en los dos adaptadores, estas pruebas son las que se rompen.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { proyectoDelPanel, proyectoDelPortal } from '../src/dominio/proyecto.ts'

/** Un Espacio del panel con lo que mira el adaptador, y basura interna alrededor. */
const ESPACIO = {
  id: 8,
  name: 'Panel de indicadores',
  patente: 'ACM-008',
  image_url: '/uploads/projects/8.png',
  description: '<p>Da igual: la cabecera no la dibuja.</p>',
  status: 4,
  client: { id: 1, company: 'Acme SRL', image_url: '/uploads/clients/1.png' },
  billing_type: 1,
  start_date: '2026-03-15',
  deadline: '2026-09-30',
  date_finished: null,
  progress: 91,
  progress_from_tasks: true,
  project_cost: 12000,
  project_rate_per_hour: null,
  estimated_hours: 120,
  added_from: 3,
  project_created: '2026-03-10',
  tags: [{ id: 1, name: 'urgente' }],
  counts: { tasks: 9, tasks_open: 9, milestones: 2 },
  archived: false,
  archived_at: null,
  members: [{ id: 2, full_name: 'Ana Ríos', profile_image_url: null }]
}

/** El mismo proyecto como lo devuelve el portal: los campos internos ni vienen. */
const DEL_PORTAL = {
  id: 8,
  name: 'Panel de indicadores',
  description: '<p>Da igual.</p>',
  status: 4,
  start_date: '2026-03-15',
  deadline: '2026-09-30',
  date_finished: null,
  progress: 91,
  counts: { tasks: 9, tasks_open: 9, milestones: 2 },
  members: [{ id: 2, full_name: 'Ana Ríos', profile_image_url: null }]
}

const EMPRESA = { id: 1, company: 'Acme SRL' }

test('el panel conserva lo suyo: patente, imagen, cliente y etiquetas', () => {
  const vista = proyectoDelPanel(ESPACIO)

  assert.equal(vista.patente, 'ACM-008')
  assert.equal(vista.image_url, '/uploads/projects/8.png')
  assert.equal(vista.cliente?.company, 'Acme SRL')
  assert.deepEqual(vista.tags, [{ id: 1, name: 'urgente' }])
})

test('el portal NO publica el codigo interno ni las etiquetas del equipo', () => {
  // Es la razon de ser de este adaptador. `patente` es el identificador interno del Espacio y las
  // etiquetas son vocabulario del equipo ("bloqueado", "urgente"): ninguno de los dos es del
  // cliente, y la cabecera los dibujaria si llegaran.
  const vista = proyectoDelPortal(DEL_PORTAL, EMPRESA)

  assert.equal(vista.patente, null)
  assert.deepEqual(vista.tags, [])
})

test('el portal muestra la empresa del propio contacto como cliente', () => {
  const vista = proyectoDelPortal(DEL_PORTAL, EMPRESA)

  assert.equal(vista.cliente?.company, 'Acme SRL')
  assert.equal(vista.cliente?.id, 1)
})

test('sin equipo compartido la vista trae una lista vacia, no undefined', () => {
  // La cabecera dibuja "Sin personas" con una lista vacia; con `undefined` reventaria al mapear.
  const { members: delPanel } = proyectoDelPanel({ ...ESPACIO, members: undefined })
  const { members: delPortal } = proyectoDelPortal({ ...DEL_PORTAL, members: undefined }, EMPRESA)

  assert.deepEqual(delPanel, [])
  assert.deepEqual(delPortal, [])
})

test('los dos sujetos describen el mismo proyecto con las mismas claves', () => {
  // Si un adaptador suma una clave y el otro no, la cabecera empieza a dibujar distinto segun quien
  // mire, que es justo lo que esta vista existe para impedir.
  assert.deepEqual(
    Object.keys(proyectoDelPanel(ESPACIO)).sort(),
    Object.keys(proyectoDelPortal(DEL_PORTAL, EMPRESA)).sort()
  )
})
