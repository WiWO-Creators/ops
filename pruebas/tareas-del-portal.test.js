import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BORRADOR_VACIO_DE_TAREA, CUERPO_DE_CANCELAR, CUERPO_DE_REABRIR, ESTADO_AL_REABRIR, LARGO_DESCRIPCION_TAREA,
  LARGO_NOMBRE_TAREA, SIN_PRIORIDAD, borradorDeEdicion, cuerpoDeEdicion, cuerpoDeTarea, cuerpoDeTareaConArchivos,
  erroresDeBorrador, erroresDeEdicion, erroresDeLaApi, erroresDeLaApiDeEdicion, falloDeAltaDeTarea,
  falloDeEdicionDeTarea, sePuedeCancelar, sePuedeEditar, sePuedeReabrir, tareaCompleta
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

// -- Edicion, cancelacion y reapertura --------------------------------------------------------

const ficha = {
  name: 'Revisar la propuesta',
  description: 'texto viejo',
  description_html: '<p>texto viejo</p>',
  due_date: '2027-03-15',
  priority: 2
}

test('el borrador de edicion parte de la ficha, con la descripcion en HTML', () => {
  assert.deepEqual(borradorDeEdicion(ficha), {
    nombre: 'Revisar la propuesta', descripcion: '<p>texto viejo</p>', vencimiento: '2027-03-15', prioridad: '2'
  })
  assert.equal(borradorDeEdicion({ ...ficha, description_html: null }).descripcion, 'texto viejo', 'sin HTML, el texto plano')
  assert.equal(borradorDeEdicion({ ...ficha, description: null, description_html: null, due_date: null }).vencimiento, '')
})

test('el cuerpo de edicion lleva solo lo que cambio', () => {
  const inicial = borradorDeEdicion(ficha)

  assert.deepEqual(cuerpoDeEdicion(inicial, inicial), {}, 'sin cambios no viaja nada')
  assert.deepEqual(cuerpoDeEdicion({ ...inicial, nombre: '  Otro  ', prioridad: '4' }, inicial), { name: 'Otro', priority: 4 })
  assert.deepEqual(
    cuerpoDeEdicion({ ...inicial, descripcion: '<p>nuevo</p>' }, inicial),
    { description: '<p>nuevo</p>', format: 'html' }
  )
})

test('vaciar la descripcion o el vencimiento viaja como null', () => {
  const inicial = borradorDeEdicion(ficha)
  const cuerpo = cuerpoDeEdicion({ ...inicial, descripcion: '<p></p>', vencimiento: '' }, inicial)

  assert.deepEqual(cuerpo, { description: null, format: 'html', due_date: null })
})

test('editar valida el nombre, y el vencimiento solo si cambio', () => {
  const inicial = borradorDeEdicion(ficha)
  const hoy = '2026-10-14'

  assert.match(erroresDeEdicion({ ...inicial, nombre: '  ' }, inicial, sinExigir, hoy).name, /nombre/)
  assert.equal(erroresDeEdicion({ ...inicial, nombre: 'a'.repeat(LARGO_NOMBRE_TAREA + 1) }, inicial, sinExigir, hoy).name?.includes('admite'), true)
  assert.deepEqual(erroresDeEdicion(inicial, inicial, exigeFecha, hoy), {})

  const vencida = { ...inicial, vencimiento: '2026-01-01' }

  assert.deepEqual(erroresDeEdicion(vencida, vencida, sinExigir, hoy), {}, 'una fecha pasada que no cambio se deja')
  assert.match(erroresDeEdicion(vencida, inicial, sinExigir, hoy).due_date, /anterior a hoy/)
  assert.match(erroresDeEdicion({ ...inicial, vencimiento: '31/12' }, inicial, sinExigir, hoy).due_date, /día\/mes\/año/)
})

test('quitar el vencimiento solo se rechaza si el cliente lo exige', () => {
  const inicial = borradorDeEdicion(ficha)
  const sinFecha = { ...inicial, vencimiento: '' }

  assert.match(erroresDeEdicion(sinFecha, inicial, exigeFecha, '2026-10-14').due_date, /exige fecha/)
  assert.deepEqual(erroresDeEdicion(sinFecha, inicial, sinExigir, '2026-10-14'), {})
})

test('editar y cancelar solo con la Tarea abierta; reabrir solo con la Cancelada', () => {
  for (const estado of [1, 2, 4, 10]) {
    assert.equal(sePuedeEditar(estado), true, `editar ${estado}`)
    assert.equal(sePuedeCancelar(estado), true, `cancelar ${estado}`)
    assert.equal(sePuedeReabrir(estado), false, `reabrir ${estado}`)
  }
  for (const estado of [5, 9, 11]) {
    assert.equal(sePuedeEditar(estado), false, `editar ${estado}`)
    assert.equal(sePuedeCancelar(estado), false, `cancelar ${estado}`)
  }
  assert.equal(sePuedeReabrir(11), true)
  assert.equal(sePuedeReabrir(5), false, 'una completa la reabre el equipo')
})

test('cancelar manda 11 y reabrir manda 1', () => {
  assert.deepEqual(CUERPO_DE_CANCELAR, { status: 11 })
  assert.deepEqual(CUERPO_DE_REABRIR, { status: ESTADO_AL_REABRIR })
  assert.equal(ESTADO_AL_REABRIR, 1)
})

test('el 422 de la edicion cae en el campo, y una clave ajena se ignora', () => {
  const errores = erroresDeLaApiDeEdicion({ due_date: ['anterior_al_inicio'], priority: ['no_valido'], status: ['no_valido'] })

  assert.match(errores.due_date, /anterior a hoy/)
  assert.equal(errores.priority, 'El valor no es válido.')
  assert.equal('status' in errores, false)
})

test('cada rechazo de la edicion se explica segun lo que se intentaba', () => {
  assert.match(falloDeEdicionDeTarea({ mensaje: 'x', estado: 404 }, 'editar').texto, /Ya no puedes modificar/)
  assert.match(falloDeEdicionDeTarea({ mensaje: 'x', estado: 403 }, 'editar').texto, /no comparte/)

  const editar409 = falloDeEdicionDeTarea({ mensaje: 'x', estado: 409 }, 'editar')
  const cancelar409 = falloDeEdicionDeTarea({ mensaje: 'x', estado: 409 }, 'cancelar')
  const reabrir409 = falloDeEdicionDeTarea({ mensaje: 'x', estado: 409 }, 'reabrir')

  assert.match(editar409.texto, /cambió de estado/)
  assert.match(cancelar409.texto, /no se puede cancelar/)
  assert.match(reabrir409.texto, /nada que reabrir/)
  assert.equal(editar409.recargar && cancelar409.recargar && reabrir409.recargar, true, 'un 409 vuelve a pedir la ficha')

  const con422 = falloDeEdicionDeTarea({ mensaje: 'Hay campos', estado: 422, detalles: { name: ['requerido'] } }, 'editar')

  assert.equal(con422.texto, null, 'con campos, el texto general sobra')
  assert.match(con422.campos.name, /obligatorio/)
  assert.equal(falloDeEdicionDeTarea({ mensaje: 'Hay campos', estado: 422, detalles: { otro: ['x'] } }, 'editar').texto, 'Hay campos')
  assert.equal(falloDeEdicionDeTarea({ mensaje: 'Caído', estado: 500 }, 'editar').texto, 'Caído')
})
