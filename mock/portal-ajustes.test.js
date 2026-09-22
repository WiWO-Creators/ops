/**
 * Pruebas del bloque de interruptores del portal que sirve el mock:
 * `GET|PUT /projects/{id}/portal-settings` y el `campos_tareas` que sale de el.
 *
 * Existen porque este bloque es el unico del mock que el panel escribe, y porque hasta ahora
 * atendia UNA sola clave —`wiwo_portal_actas`— mientras el panel mandaba las veintiuna. El
 * resultado era un 422 en cada guardado y una pantalla del panel que no se podia probar en
 * navegador. Lo que se deja clavado acá es lo que impide que vuelva a pasar con la casilla
 * siguiente:
 *
 *  1. **El PUT acepta todas las claves declaradas**, no una lista escrita a mano en el handler.
 *  2. **Una clave desconocida sigue siendo 422.** `tblproject_settings` guarda tambien las `view_*`
 *     del panel clasico: aceptar nombres libres seria escribir cualquiera de ellas desde acá.
 *  3. **El 422 no escribe nada.** Un reemplazo total que falla a la mitad es peor que no guardar.
 *  4. **`campos_tareas` refleja los flags, y la tarea del portal no trae lo apagado.** Es el
 *     contrato completo del interruptor por campo: el flag y la forma tienen que decir lo mismo.
 *
 *  5. **La única clave que nace encendida, nace encendida.** Es el caso que pedía la nota de antes,
 *     ya resuelto: `wiwo_portal_tickets` vale 1 con la fila ausente y el resto vale 0
 *     (`VisibilidadContacto::ENCENDIDO_SI_FALTA`, migracion `0800`). Es la excepcion porque se puso
 *     DELANTE de algo que el cliente ya veia, no detras de algo nuevo. Un mock que la muestre
 *     apagada miente sobre la API real, y mentir es peor que faltar.
 *
 * La lista de excepciones vive en `ENCENDIDO_SI_FALTA_DEL_PORTAL`, en el servidor, y no en un
 * `?? true` suelto dentro de `ajustesDelPortal()`: una excepcion escondida en medio de una
 * expresion es la clase de detalle que nadie encuentra cuando el sintoma aparece meses despues.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'

/** El Proyecto del fixture que comparte todo. */
const PROYECTO = 1

/** Los ocho interruptores de columna, con la clave de la tarea que publica cada uno. */
const CAMPOS = {
  wiwo_portal_campo_responsables: 'assignees',
  wiwo_portal_campo_seguidores: 'followers',
  wiwo_portal_campo_etiquetas: 'tags',
  wiwo_portal_campo_eta: 'eta',
  wiwo_portal_campo_desviacion: 'desviacion_dias',
  wiwo_portal_campo_sla: 'estado_sla',
  wiwo_portal_campo_justificacion: 'justificacion'
}

let base
let staff
let contacto

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`

  const entrar = async (ruta, cuerpo) => {
    const respuesta = await fetch(`${base}${ruta}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo)
    })

    return { authorization: `Bearer ${(await respuesta.json()).data.access_token}` }
  }

  staff = await entrar('/auth/login', { email: 'ana@wiwo.me', password: 'mock1234' })
  contacto = await entrar('/auth/portal/login', { email: 'clienta@acme.com', password: 'portal1234' })
})

after(() => new Promise((resolver) => servidor.close(resolver)))

/** Lee los interruptores como staff. */
async function leerAjustes () {
  const respuesta = await fetch(`${base}/projects/${PROYECTO}/portal-settings`, { headers: staff })

  return (await respuesta.json()).data
}

/** Escribe el bloque entero con los cambios pedidos, como hace el panel: leer, modificar, escribir. */
async function escribirAjustes (cambios) {
  const respuesta = await fetch(`${base}/projects/${PROYECTO}/portal-settings`, {
    method: 'PUT',
    headers: { ...staff, 'content-type': 'application/json' },
    body: JSON.stringify({ ...(await leerAjustes()), ...cambios })
  })

  return { estado: respuesta.status, datos: (await respuesta.json()).data }
}

/** Pide algo del portal como el contacto. */
async function pedirPortal (ruta) {
  const respuesta = await fetch(`${base}${ruta}`, { headers: contacto })

  return (await respuesta.json()).data
}

test('el GET devuelve el bloque entero, no una sola clave', async () => {
  const ajustes = await leerAjustes()

  // Las cuatro familias: el maestro, una pestaña, un bloque de la ficha y un campo de columna.
  for (const clave of ['visible_para_cliente', 'view_tasks', 'view_task_comments', 'wiwo_portal_campo_eta']) {
    assert.equal(Object.hasOwn(ajustes, clave), true, clave)
    assert.equal(typeof ajustes[clave], 'boolean', clave)
  }

  assert.ok(Object.keys(ajustes).length >= 22, `Son al menos veintidós claves: ${Object.keys(ajustes).length}`)
})

test('los ocho campos de columna nacen apagados', async () => {
  const ajustes = await leerAjustes()

  for (const flag of Object.keys(CAMPOS)) {
    assert.equal(ajustes[flag], false, flag)
  }
})

test('las solicitudes de soporte nacen ENCENDIDAS y el resto apagado', async () => {
  const ajustes = await leerAjustes()

  // Es la única excepción de las veintidós, y está clavada acá porque es el caso que la nota de la
  // cabecera pedía: la fila ausente vale 1 para esta clave y 0 para todas las demás
  // (`VisibilidadContacto::ENCENDIDO_SI_FALTA`, migración `0800`). Se puso delante de algo que el
  // cliente YA veía, así que un mock que la muestre apagada miente sobre la API real, y mentir es
  // peor que faltar.
  assert.equal(ajustes.wiwo_portal_tickets, true)

  // El contraste se hace contra `wiwo_portal_gestion`, que en este Proyecto tampoco tiene fila: las
  // dos claves están igual de ausentes y una vale 1 y la otra 0, que es justo lo que hay que fijar.
  // `wiwo_portal_actas` no sirve de contraste acá porque el fixture lo enciende a mano en el
  // Proyecto 1, para poder mirar el Meeting Paper sin prenderlo primero.
  assert.equal(ajustes.wiwo_portal_gestion, false, 'el tablero de gestión tiene que seguir naciendo apagado')
})

test('apagar las solicitudes de soporte se guarda, y se puede volver a encender', async () => {
  // El interruptor existe para poder APAGAR un Proyecto concreto, así que esa es la escritura que
  // hay que poder hacer. Y tiene que quedar guardado como un `false` explícito: si el mock tratara
  // la ausencia y el '0' como lo mismo, apagarlo no se podría distinguir de no haberlo tocado nunca.
  const apagado = await escribirAjustes({ wiwo_portal_tickets: false })

  assert.equal(apagado.estado, 200)
  assert.equal(apagado.datos.wiwo_portal_tickets, false)
  assert.equal((await leerAjustes()).wiwo_portal_tickets, false)

  const encendido = await escribirAjustes({ wiwo_portal_tickets: true })

  assert.equal(encendido.estado, 200)
  assert.equal((await leerAjustes()).wiwo_portal_tickets, true)
})

test('el PUT guarda cualquiera de las claves declaradas, no solo las actas', async () => {
  const { estado, datos } = await escribirAjustes({ view_task_comments: true, wiwo_portal_campo_eta: true })

  assert.equal(estado, 200)
  assert.equal(datos.view_task_comments, true)
  assert.equal(datos.wiwo_portal_campo_eta, true)

  await escribirAjustes({ wiwo_portal_campo_eta: false })
})

test('una clave desconocida es 422 y no escribe nada', async () => {
  const antes = await leerAjustes()

  const respuesta = await fetch(`${base}/projects/${PROYECTO}/portal-settings`, {
    method: 'PUT',
    headers: { ...staff, 'content-type': 'application/json' },
    body: JSON.stringify({ ...antes, wiwo_portal_campo_inventado: true, wiwo_portal_campo_sla: true })
  })

  assert.equal(respuesta.status, 422)
  assert.deepEqual((await respuesta.json()).error.details.wiwo_portal_campo_inventado, ['desconocida'])
  // Lo valido que venia en el mismo cuerpo tampoco se guardo: el reemplazo es total o no es.
  assert.deepEqual(await leerAjustes(), antes)
})

test('falta una clave vieja y es 422: el PUT es reemplazo total', async () => {
  const { view_tasks: _, ...sinUna } = await leerAjustes()

  const respuesta = await fetch(`${base}/projects/${PROYECTO}/portal-settings`, {
    method: 'PUT',
    headers: { ...staff, 'content-type': 'application/json' },
    body: JSON.stringify(sinUna)
  })

  assert.equal(respuesta.status, 422)
  assert.deepEqual((await respuesta.json()).error.details.view_tasks, ['required'])
})

test('falta una clave nueva y NO es 422: es la rampa del panel sin desplegar', async () => {
  const ajustes = await leerAjustes()
  const { wiwo_portal_campo_sla: _, wiwo_portal_gestion: __, ...sinLasNuevas } = ajustes

  const respuesta = await fetch(`${base}/projects/${PROYECTO}/portal-settings`, {
    method: 'PUT',
    headers: { ...staff, 'content-type': 'application/json' },
    body: JSON.stringify(sinLasNuevas)
  })

  assert.equal(respuesta.status, 200)
  // Ausente es "dejala como esta", no "apagala": un panel viejo no puede apagar en silencio algo
  // que la gerencia del cliente ya estaba usando.
  assert.equal((await leerAjustes()).wiwo_portal_campo_sla, ajustes.wiwo_portal_campo_sla)
})

test('campos_tareas sale de los flags y la tarea no trae lo apagado', async () => {
  await escribirAjustes(Object.fromEntries(Object.keys(CAMPOS).map((flag) => [flag, false])))

  const apagado = await pedirPortal(`/portal/projects/${PROYECTO}`)
  assert.deepEqual(apagado.campos_tareas, [])

  const tareasApagadas = await pedirPortal(`/portal/projects/${PROYECTO}/tasks`)
  assert.ok(tareasApagadas.length > 0, 'El fixture tiene que traer tareas para que esto valga algo.')

  for (const tarea of tareasApagadas) {
    for (const clave of Object.values(CAMPOS)) {
      assert.equal(Object.hasOwn(tarea, clave), false, `${clave} viajo con el flag apagado`)
    }
  }

  // Encendidos dos, y solo esos dos.
  await escribirAjustes({ wiwo_portal_campo_etiquetas: true, wiwo_portal_campo_sla: true })

  const encendido = await pedirPortal(`/portal/projects/${PROYECTO}`)
  assert.deepEqual(
    [...encendido.campos_tareas].sort(),
    ['wiwo_portal_campo_etiquetas', 'wiwo_portal_campo_sla']
  )

  for (const tarea of await pedirPortal(`/portal/projects/${PROYECTO}/tasks`)) {
    assert.equal(Object.hasOwn(tarea, 'tags'), true)
    assert.equal(Object.hasOwn(tarea, 'estado_sla'), true)
    assert.equal(Object.hasOwn(tarea, 'assignees'), false)
    assert.equal(Object.hasOwn(tarea, 'eta'), false)
  }

  await escribirAjustes({ wiwo_portal_campo_etiquetas: false, wiwo_portal_campo_sla: false })
})

test('la justificacion del portal nunca publica quien la escribio', async () => {
  await escribirAjustes({ wiwo_portal_campo_justificacion: true })

  for (const tarea of await pedirPortal(`/portal/projects/${PROYECTO}/tasks`)) {
    assert.equal(Object.hasOwn(tarea.justificacion, 'creada_por'), false)
    assert.deepEqual(Object.keys(tarea.justificacion).sort(), ['creada_en', 'texto'])
  }

  await escribirAjustes({ wiwo_portal_campo_justificacion: false })
})

test('el contacto no puede tocar los interruptores', async () => {
  const respuesta = await fetch(`${base}/projects/${PROYECTO}/portal-settings`, { headers: contacto })

  assert.notEqual(respuesta.status, 200)
})
