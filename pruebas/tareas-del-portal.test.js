import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BORRADOR_VACIO_DE_TAREA, LARGO_DESCRIPCION_TAREA, LARGO_NOMBRE_TAREA, SIN_PRIORIDAD, cuerpoDeTarea,
  cuerpoDeTareaConArchivos, erroresDeBorrador, erroresDeLaApi, falloDeAltaDeTarea, tareaCompleta
} from '../src/dominio/tareas-del-portal.ts'

const equipo = [
  { id: 4, nombre: 'Ana Lagos', avatar: null },
  { id: 9, nombre: 'Diego Paredes', avatar: 'https://x/d.png' }
]
const exigeFecha = { vencimiento_requerido: true, asignables: equipo }
const sinExigir = { vencimiento_requerido: false, asignables: [] }

const borrador = (cambios) => ({ ...BORRADOR_VACIO_DE_TAREA, nombre: 'Revisar la propuesta', ...cambios })

test('sin nombre, o solo con espacios, no se puede crear', () => {
  assert.equal(tareaCompleta(borrador({ nombre: '   ' }), sinExigir), false)
  assert.match(erroresDeBorrador(borrador({ nombre: '' }), sinExigir).name, /nombre/)
})

test('el nombre no pasa del tope del contrato', () => {
  assert.equal(tareaCompleta(borrador({ nombre: 'a'.repeat(LARGO_NOMBRE_TAREA) }), sinExigir), true)
  assert.equal(tareaCompleta(borrador({ nombre: 'a'.repeat(LARGO_NOMBRE_TAREA + 1) }), sinExigir), false)
})

test('el vencimiento es obligatorio solo si el Proyecto lo exige', () => {
  assert.equal(tareaCompleta(borrador({}), sinExigir), true)
  assert.equal(tareaCompleta(borrador({}), exigeFecha), false)
  assert.match(erroresDeBorrador(borrador({}), exigeFecha).due_date, /exige fecha/)
  assert.equal(tareaCompleta(borrador({ vencimiento: '2026-12-31' }), exigeFecha), true)
})

test('una fecha a medio escribir o inexistente se marca aunque no sea obligatoria', () => {
  for (const fecha of ['31/12', '2026-02-31', '31/12/2026', 'mañana']) {
    assert.equal(tareaCompleta(borrador({ vencimiento: fecha }), sinExigir), false, fecha)
  }
})

test('el cuerpo omite lo vacio: ni descripcion, ni fecha, ni prioridad, ni asignados', () => {
  assert.deepEqual(cuerpoDeTarea(borrador({ nombre: '  Revisar  ' }), sinExigir), { name: 'Revisar' })
})

test('el cuerpo lleva lo elegido con los nombres del contrato', () => {
  const cuerpo = cuerpoDeTarea(
    borrador({ descripcion: '<p>Con detalle</p>', vencimiento: '2026-11-05', prioridad: '3', asignados: [9, 4] }),
    exigeFecha
  )

  assert.deepEqual(cuerpo, {
    name: 'Revisar la propuesta',
    description: '<p>Con detalle</p>',
    format: 'html',
    due_date: '2026-11-05',
    priority: 3,
    assignees: [9, 4]
  })
})

test('un asignado que ya no esta en la lista del Proyecto no viaja', () => {
  assert.deepEqual(cuerpoDeTarea(borrador({ asignados: [77, 4] }), exigeFecha).assignees, [4])
  assert.equal('assignees' in cuerpoDeTarea(borrador({ asignados: [4] }), sinExigir), false)
})

test('«sin prioridad» no manda priority', () => {
  assert.equal('priority' in cuerpoDeTarea(borrador({ prioridad: SIN_PRIORIDAD }), sinExigir), false)
})

test('los motivos del 422 caen en el campo que los causo', () => {
  const errores = erroresDeLaApi({
    due_date: ['requerido_por_cliente'],
    assignees: ['no_es_del_equipo'],
    name: ['requerido'],
    prospecto_existente: ['4']
  })

  assert.match(errores.due_date, /exige fecha/)
  assert.match(errores.assignees, /integran/)
  assert.match(errores.name, /obligatorio/)
  assert.equal('prospecto_existente' in errores, false)
})

test('el 422 tambien se lee si viene anidado en errors, y un motivo desconocido no se muestra pelado', () => {
  const errores = erroresDeLaApi({ errors: { priority: ['codigo_raro'] } })

  assert.equal(errores.priority, 'El valor no es válido.')
})

test('un 422 con campos conocidos no repite el mensaje general', () => {
  const fallo = falloDeAltaDeTarea({ estado: 422, mensaje: 'Hay campos que no se pueden guardar.', detalles: { due_date: ['requerido_por_cliente'] } })

  assert.equal(fallo.texto, null)
  assert.ok(fallo.campos.due_date)
})

test('un 422 sin campos del formulario cae al mensaje de la API', () => {
  const fallo = falloDeAltaDeTarea({ estado: 422, mensaje: 'Hay campos que no se pueden guardar.', detalles: { rel_id: ['no_editable'] } })

  assert.equal(fallo.texto, 'Hay campos que no se pueden guardar.')
  assert.deepEqual(fallo.campos, {})
})

test('el 429 dice cuanto esperar y devuelve los segundos', () => {
  const fallo = falloDeAltaDeTarea({ estado: 429, mensaje: 'x', reintentarEnSegundos: 600 })

  assert.equal(fallo.esperarSegundos, 600)
  assert.match(fallo.texto, /10 minutos/)
  assert.match(falloDeAltaDeTarea({ estado: 429, mensaje: 'x', reintentarEnSegundos: null }).texto, /Espera un rato/)
})

test('404 y 403 no filtran la causa; cualquier otro usa el mensaje de la API', () => {
  assert.match(falloDeAltaDeTarea({ estado: 404, mensaje: 'x' }).texto, /Ya no puedes crear/)
  assert.match(falloDeAltaDeTarea({ estado: 403, mensaje: 'x' }).texto, /no comparte/)
  assert.equal(falloDeAltaDeTarea({ estado: 500, mensaje: 'Se cayó' }).texto, 'Se cayó')
  assert.equal(falloDeAltaDeTarea({ mensaje: 'Sin red' }).texto, 'Sin red')
})

test('una descripcion que el editor dejo vacia no viaja, y sin ella tampoco el formato', () => {
  for (const vacia of ['', '<p></p>', '<p>&nbsp;</p>']) {
    const cuerpo = cuerpoDeTarea(borrador({ descripcion: vacia }), sinExigir)

    assert.equal('description' in cuerpo, false, vacia)
    assert.equal('format' in cuerpo, false, vacia)
  }
})

test('una descripcion que es solo una captura viaja', () => {
  const imagen = `<p><img src="/api/bff/files/texto-rico/${'ab12'.repeat(8)}" alt="captura"></p>`
  const cuerpo = cuerpoDeTarea(borrador({ descripcion: imagen }), sinExigir)

  assert.equal(cuerpo.description, imagen)
  assert.equal(cuerpo.format, 'html')
})

test('la descripcion no pasa del tope de caracteres visibles', () => {
  assert.equal(tareaCompleta(borrador({ descripcion: `<p>${'a'.repeat(LARGO_DESCRIPCION_TAREA)}</p>` }), sinExigir), true)
  assert.match(
    erroresDeBorrador(borrador({ descripcion: `<p>${'a'.repeat(LARGO_DESCRIPCION_TAREA + 1)}</p>` }), sinExigir).description,
    /descripción/
  )
})

test('sin archivos el alta sigue siendo JSON; con archivos es multipart con el cuerpo en payload', async () => {
  const cuerpo = cuerpoDeTarea(borrador({ asignados: [9, 4], descripcion: '<p>x</p>' }), exigeFecha)

  assert.equal(cuerpoDeTareaConArchivos(cuerpo, []), cuerpo)

  const archivo = new File(['hola'], 'captura.png', { type: 'image/png' })
  const formulario = cuerpoDeTareaConArchivos(cuerpo, [archivo, new File(['b'], 'b.pdf', { type: 'application/pdf' })])

  assert.ok(formulario instanceof FormData)
  assert.deepEqual(JSON.parse(formulario.get('payload')), cuerpo, 'el arreglo de asignados viaja entero')
  assert.deepEqual(formulario.getAll('attachments[]').map((a) => a.name), ['captura.png', 'b.pdf'])
})

test('los motivos de un archivo rechazado tienen frase propia', () => {
  assert.equal(falloDeAltaDeTarea({ mensaje: 'Archivo malo', estado: 422, detalles: { attachments: ['too_large'] } }).texto, 'Archivo malo')
})
