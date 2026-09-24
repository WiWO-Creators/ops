/**
 * Pruebas del Scope del contrato en el mock, contra el servidor.
 *
 * Lo que queda clavado es el contrato que programa el frontend:
 *
 *  1. **Sin Scope** el `GET` responde `scope: null` y analizar es 409.
 *  2. **El `PUT` valida como la API**: 422 con el motivo por campo, y claves desconocidas como
 *     `no_editable`.
 *  3. **Interpretar no guarda** y acepta JSON y multipart con PDF.
 *  4. **Analizar** ordena fuera, dudoso, dentro; un segundo analisis inmediato es 429 con
 *     `retry_after`; y editar el Scope despues marca el analisis como desactualizado.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'

let base
let staff

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`

  const respuesta = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ana@wiwo.me', password: 'mock1234' })
  })
  staff = (await respuesta.json()).data.access_token
})

after(() => new Promise((resolver) => servidor.close(resolver)))

/**
 * Pide una ruta con la sesion del staff.
 *
 * @returns {Promise<{ estado: number, cuerpo: any }>}
 */
async function pedir (ruta, metodo = 'GET', datos) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${staff}`, 'content-type': 'application/json' },
    ...(datos === undefined ? {} : { body: JSON.stringify(datos) })
  })

  return { estado: respuesta.status, cuerpo: await respuesta.json() }
}

const SCOPE = {
  fuente: 'texto',
  texto_original: 'Contrato',
  resumen: 'Rediseño del portal',
  incluye: ['Diseño de la pantalla de acceso', 'Flujo de alta'],
  excluye: ['Permisos por rol'],
  supuestos: ['El cliente entrega los textos']
}

test('sin scope el GET dice null y quien puede editar', async () => {
  const { estado, cuerpo } = await pedir('/projects/3/scope')

  assert.equal(estado, 200)
  assert.equal(cuerpo.data.scope, null)
  assert.equal(cuerpo.data.analisis, null)
  assert.equal(cuerpo.data.puede_editar, true)
})

test('analizar sin scope es 409', async () => {
  const { estado, cuerpo } = await pedir('/ia/proyectos/3/scope/analizar', 'POST')

  assert.equal(estado, 409)
  assert.equal(cuerpo.error.code, 'conflict')
})

test('un proyecto inexistente es 404', async () => {
  assert.equal((await pedir('/projects/9999/scope')).estado, 404)
})

test('el PUT valida como la API', async () => {
  const vacio = await pedir('/projects/4/scope', 'PUT', { fuente: 'texto', resumen: '  ', incluye: [] })
  assert.equal(vacio.estado, 422)
  assert.deepEqual(vacio.cuerpo.error.details.resumen, ['required'])

  const malo = await pedir('/projects/4/scope', 'PUT', {
    fuente: 'otra', incluye: ['ok', '  '], excluye: ['x'.repeat(501)], raro: 1
  })
  assert.equal(malo.estado, 422)
  assert.deepEqual(malo.cuerpo.error.details, {
    fuente: ['invalid'], incluye: ['invalid'], excluye: ['too_long'], raro: ['no_editable']
  })
})

test('interpretar texto no guarda y parte por secciones', async () => {
  const { estado, cuerpo } = await pedir('/ia/proyectos/4/scope/interpretar', 'POST', {
    fuente: 'texto',
    texto: 'Rediseño del sitio.\nIncluye:\n- Home\n- Blog\nNo incluye:\n- Hosting'
  })

  assert.equal(estado, 200)
  assert.deepEqual(cuerpo.data.incluye, ['Home', 'Blog'])
  assert.deepEqual(cuerpo.data.excluye, ['Hosting'])
  assert.ok(Array.isArray(cuerpo.data.observaciones) && cuerpo.data.observaciones.length > 0)
  assert.equal((await pedir('/projects/4/scope')).cuerpo.data.scope, null)
})

test('interpretar texto vacio es 422', async () => {
  const { estado, cuerpo } = await pedir('/ia/proyectos/4/scope/interpretar', 'POST', { fuente: 'texto', texto: ' ' })

  assert.equal(estado, 422)
  assert.deepEqual(cuerpo.error.details.texto, ['required'])
})

test('interpretar un PDF por multipart', async () => {
  const formulario = new FormData()
  formulario.append('fuente', 'pdf')
  formulario.append('texto', 'No incluye: soporte 24/7')
  formulario.append('archivo', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'contrato.pdf')

  const respuesta = await fetch(`${base}/ia/proyectos/4/scope/interpretar`, {
    method: 'POST',
    headers: { authorization: `Bearer ${staff}` },
    body: formulario
  })
  const cuerpo = await respuesta.json()

  assert.equal(respuesta.status, 200)
  assert.match(cuerpo.data.resumen, /contrato\.pdf/)
  assert.ok(cuerpo.data.excluye.includes('soporte 24/7'))
})

test('guardar, analizar, frenar y desactualizar', async () => {
  const guardado = await pedir('/projects/5/scope', 'PUT', SCOPE)
  assert.equal(guardado.estado, 200)
  assert.equal(guardado.cuerpo.data.scope.fuente, 'texto')
  assert.equal(guardado.cuerpo.data.scope.actualizado_por.id > 0, true)

  const analisis = await pedir('/ia/proyectos/5/scope/analizar', 'POST')
  assert.equal(analisis.estado, 200)

  const { tareas, conteo, scope_desactualizado: desactualizado } = analisis.cuerpo.data
  assert.equal(desactualizado, false)
  assert.equal(conteo.total, tareas.length)
  assert.equal(conteo.dentro + conteo.fuera + conteo.dudoso, conteo.total)
  assert.ok(conteo.fuera > 0, 'el mock tiene que mostrar al menos una fuera de scope')

  const orden = { fuera: 0, dudoso: 1, dentro: 2 }
  const posiciones = tareas.map((t) => orden[t.veredicto])
  assert.deepEqual(posiciones, [...posiciones].sort((a, b) => a - b))

  const otra = await pedir('/ia/proyectos/5/scope/analizar', 'POST')
  assert.equal(otra.estado, 429)
  assert.equal(otra.cuerpo.error.code, 'rate_limited')
  assert.ok(otra.cuerpo.error.details.retry_after > 0)

  await pedir('/projects/5/scope', 'PUT', { ...SCOPE, resumen: 'Otro' })
  const leido = await pedir('/projects/5/scope')
  assert.equal(leido.cuerpo.data.analisis.scope_desactualizado, true)
})
