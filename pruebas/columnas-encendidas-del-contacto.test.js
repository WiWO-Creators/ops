/**
 * Pruebas de los ocho interruptores de columna de la tabla de Tareas del portal (migracion `0830`).
 *
 * El interruptor NO es cosmetico: apagado, la API no manda la clave. Por eso lo que se verifica acá
 * son las dos direcciones del mismo hecho —apagado no dibuja la columna, encendido la dibuja y la
 * pinta contra una fila real— y sobre todo que el estado de nacimiento no cambie nada: los 279
 * Proyectos arrancan con los ocho en cero, y el dia del despliegue la tabla del cliente tiene que
 * ser exactamente la de la vispera.
 *
 * La prueba de pintado es la que importa. Una columna declarada cuya clave no llego no deja la
 * celda vacia: rompe la fila entera, porque la celda rica del panel lee el objeto adentro.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { columnasDelContacto, procesosDelContacto } from '../src/definiciones/portal-proyectos.ts'
import { procesosDelEspacio } from '../src/definiciones/procesos.ts'

/** Los ocho flags con la columna que enciende cada uno. Es el contrato con `VisibilidadContacto`. */
const FLAGS = {
  wiwo_portal_campo_responsables: 'assignees',
  wiwo_portal_campo_seguidores: 'followers',
  wiwo_portal_campo_etiquetas: 'tags',
  wiwo_portal_campo_iteraciones: 'iterations',
  wiwo_portal_campo_eta: 'eta',
  wiwo_portal_campo_desviacion: 'desviacion',
  wiwo_portal_campo_sla: 'estado_sla',
  wiwo_portal_campo_justificacion: 'justificacion'
}

/**
 * Una fila con los ocho campos opcionales puestos, como la manda la API con todo encendido.
 *
 * Las formas salen de `FormasDelPortal::conCamposOpcionales()`: `assignees` y `followers` son la
 * referencia de staff, `tags` id y nombre, `iterations` vive dentro de `counts`, y `justificacion`
 * llega sin `creada_por` —es un id de staff y no se publica—.
 */
const FILA_COMPLETA = {
  id: 512,
  patente: 'ESP-008-01',
  name: 'Revisar la pantalla de acceso',
  description: null,
  status: 4,
  priority: 1,
  start_date: '2026-08-08',
  due_date: '2026-09-08',
  date_added: '2026-08-01 09:00:00',
  date_finished: null,
  milestone: { id: 3, name: 'Puesta en marcha' },
  milestone_order: 0,
  task_type: { id: 7, name: 'Diseño', label_color: '#1e40af', text_color: '#ffffff' },
  approval: {
    requerida: true,
    estado: 'aprobada',
    solicitada_en: '2026-09-01T12:00:00Z',
    resuelta_en: '2026-09-02T09:30:00Z',
    comentario: 'Va bien, sigan'
  },
  counts: { comments: 2, checklist: 3, checklist_done: 1, attachments: 0, iterations: 5 },
  assignees: [{ id: 183, full_name: 'Ana Díaz', profile_image_url: null }],
  followers: [{ id: 42, full_name: 'Luis Rey', profile_image_url: null }],
  tags: [{ id: 9, name: 'esperando-plata' }],
  eta: '2026-09-25',
  desviacion_dias: 5,
  estado_sla: 'atrasado',
  justificacion: { texto: 'El cliente tardó en responder', creada_en: '2026-09-20 09:00:00' }
}

/** La misma fila con todo lo opcional vacio: listas sin elementos y medidas en null. */
const FILA_VACIA = {
  ...FILA_COMPLETA,
  counts: { comments: 0, checklist: 0, checklist_done: 0, attachments: 0, iterations: 0 },
  assignees: [],
  followers: [],
  tags: [],
  eta: null,
  desviacion_dias: null,
  estado_sla: null,
  justificacion: { texto: null, creada_en: null }
}

const TODOS = Object.keys(FLAGS)

/** Las claves de columna de una definicion, para comparar listas sin ruido. */
function claves (definicion) {
  return definicion.columnas.map((columna) => columna.clave)
}

test('sin ningun flag la tabla es la de siempre: el dia del despliegue no cambia nada', () => {
  const apagada = claves(procesosDelContacto(8))

  for (const columna of Object.values(FLAGS)) {
    assert.equal(apagada.includes(columna), false, columna)
  }

  // El argumento por omision y la lista vacia tienen que dar exactamente lo mismo: los 279
  // Proyectos nacen sin ninguna fila, y quien no pase nada no puede recibir una tabla distinta.
  assert.deepEqual(claves(procesosDelContacto(8, [])), apagada)
})

test('cada flag enciende su columna y ninguna otra', () => {
  for (const [flag, columna] of Object.entries(FLAGS)) {
    const conUno = claves(procesosDelContacto(8, [flag]))

    assert.equal(conUno.includes(columna), true, `${flag} enciende ${columna}`)

    for (const [otroFlag, otraColumna] of Object.entries(FLAGS)) {
      if (otroFlag === flag) continue
      assert.equal(conUno.includes(otraColumna), false, `${flag} no puede encender ${otraColumna}`)
    }
  }
})

test('con los ocho encendidos estan las ocho, y ninguna se repite', () => {
  const todas = claves(procesosDelContacto(8, TODOS))

  for (const columna of Object.values(FLAGS)) {
    assert.equal(todas.includes(columna), true, columna)
  }

  assert.equal(new Set(todas).size, todas.length, 'ninguna columna duplicada')
})

test('las columnas encendidas son las del equipo: mismo rotulo y misma posicion relativa', () => {
  const equipo = claves(procesosDelEspacio(8))
  const contacto = claves(procesosDelContacto(8, TODOS))

  // El orden del contacto tiene que ser una SUBSECUENCIA del equipo: la tabla del cliente y la del
  // equipo se leen igual, y una columna que aparezca en otro lugar rompe esa promesa.
  const posiciones = contacto.map((clave) => equipo.indexOf(clave))

  for (const posicion of posiciones) assert.notEqual(posicion, -1)
  assert.deepEqual([...posiciones].sort((a, b) => a - b), posiciones, 'el orden del equipo se conserva')

  // Y el rotulo tiene que ser literalmente el mismo objeto de definicion, no una copia con el
  // mismo texto: es lo que hace que un renombre futuro llegue a las dos pantallas.
  const porClaveEquipo = new Map(procesosDelEspacio(8).columnas.map((c) => [c.clave, c]))

  for (const columna of procesosDelContacto(8, TODOS).columnas) {
    const suya = porClaveEquipo.get(columna.clave)
    assert.equal(columna.encabezado, suya.encabezado, columna.clave)
  }
})

test('ninguna columna encendida lanza al pintar una fila del portal', () => {
  for (const fila of [FILA_COMPLETA, FILA_VACIA]) {
    for (const columna of procesosDelContacto(8, TODOS).columnas) {
      assert.doesNotThrow(() => columna.presentar(fila), `columna ${columna.clave}`)
    }
  }
})

test('ninguna columna encendida ofrece ordenar por algo que el portal no ordena', () => {
  const definicion = procesosDelContacto(8, TODOS)

  for (const columna of definicion.columnas) {
    if (columna.ordenPor === undefined) continue
    assert.equal(definicion.ordenables.includes(columna.ordenPor), true, columna.clave)
  }
})

test('el interruptor no abre acciones ni filtros: sigue siendo solo lectura', () => {
  const definicion = procesosDelContacto(8, TODOS)

  assert.deepEqual(definicion.acciones, [])
  // Los filtros los gobierna el endpoint del portal, no estos flags: encender una columna no
  // habilita filtrar por ella, porque filtrar por un campo tambien es leerlo.
  assert.deepEqual(definicion.filtros.map((f) => f.clave), ['status'])
})

test('un flag que el front no conoce se ignora en vez de romper la tabla', () => {
  const inventado = claves(procesosDelContacto(8, ['wiwo_portal_campo_inventado']))

  assert.deepEqual(inventado, claves(procesosDelContacto(8)))
})

test('columnasDelContacto no pierde las de siempre al encender opcionales', () => {
  const siempre = columnasDelContacto()

  for (const columna of siempre) {
    assert.equal(columnasDelContacto(TODOS).includes(columna), true, columna)
  }

  assert.equal(columnasDelContacto(TODOS).length, siempre.length + TODOS.length)
})
