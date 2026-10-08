/**
 * Pruebas del proxy BFF a nivel de decision: de que sujeto es cada peticion, que pasa la lista
 * blanca, que se hace ante un 401 con refresco y que cabeceras salen en una descarga.
 *
 * Cubren `portal/tickets` (el listado del cliente), `tickets` (el del equipo) y `files/*` (la
 * descarga de adjuntos, compartida por los dos sujetos). El handler de Next no se importa: lo que
 * decide vive en `src/datos/proxy-bff.ts` y lo que toca cookies o la API entra como parametro.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cabecerasDeSalida, elegirSujeto, esTokenVencido, llamarConRefresco } from '../src/datos/proxy-bff.ts'
import { rutaPermitida } from '../src/datos/rutas.ts'

/** Dice si hay sesion del panel, y cuenta cuantas veces se pregunto. */
function panel (hay) {
  const llamadas = { n: 0 }
  const leer = async () => { llamadas.n += 1; return hay }

  return { leer, llamadas }
}

const sesion = { acceso: 'viejo', refresco: 'r', sujeto: 'staff' }
const renovada = { acceso: 'nuevo', refresco: 'r2', sujeto: 'staff' }

/** Una respuesta de la API con ese estado y, si hay, ese codigo de error. */
function respuesta (estado, codigo) {
  const cuerpo = codigo === undefined ? '{"data":[]}' : JSON.stringify({ error: { code: codigo, message: 'x' } })

  return new Response(cuerpo, { status: estado, headers: { 'content-type': 'application/json' } })
}

/** Dependencias falsas: la API contesta con la cola de respuestas y se anota todo lo que pasa. */
function dependencias ({ respuestas, refresco }) {
  const registro = { tokens: [], guardadas: [], borrados: 0, refrescos: 0 }

  return {
    registro,
    dependencias: {
      llamar: async (token) => { registro.tokens.push(token); return respuestas.shift() },
      refrescar: async () => {
        registro.refrescos += 1
        if (refresco instanceof Error) throw refresco

        return refresco
      },
      guardar: async (nueva) => { registro.guardadas.push(nueva) },
      borrar: async () => { registro.borrados += 1 }
    }
  }
}

// --- sujeto elegido -------------------------------------------------------------------------------

test('portal/tickets es siempre del contacto, haya o no sesion del panel', async () => {
  const conPanel = panel(true)
  const sinPanel = panel(false)

  assert.equal(await elegirSujeto(['portal', 'tickets'], conPanel.leer), 'contacto')
  assert.equal(await elegirSujeto(['portal', 'tickets', '7'], sinPanel.leer), 'contacto')
  assert.equal(conPanel.llamadas.n, 0, 'no hace falta mirar la cookie del panel para decidir el portal')
})

test('tickets del equipo es del staff y no consulta la cookie', async () => {
  const lectura = panel(false)

  assert.equal(await elegirSujeto(['tickets'], lectura.leer), 'staff')
  assert.equal(await elegirSujeto(['tickets', '7', 'respuestas'], lectura.leer), 'staff')
  assert.equal(lectura.llamadas.n, 0)
})

test('files/*: un contacto sin sesion del panel descarga como contacto', async () => {
  assert.equal(await elegirSujeto(['files', 'ticket', '7', 'download'], panel(false).leer), 'contacto')
})

test('files/*: quien tiene sesion del panel descarga como staff', async () => {
  assert.equal(await elegirSujeto(['files', 'ticket', '7', 'download'], panel(true).leer), 'staff')
})

test('files/* con las dos sesiones (Ver como cliente) sale como staff: limite documentado, sin fuga', async () => {
  // El contacto que se mira y el staff que mira son la misma persona con dos cookies: el sujeto
  // elegido es el del panel, igual que la API. No cruza datos entre personas; la vista solo deja de
  // ser fiel a lo que el cliente podria bajar.
  const ruta = ['files', 'ticket', '7', 'download']
  const sujeto = await elegirSujeto(ruta, panel(true).leer)

  assert.equal(sujeto, 'staff')
  assert.equal(rutaPermitida(ruta, sujeto), true)
})

test('files/* solo consulta la cookie del panel cuando la ruta es compartida', async () => {
  const lectura = panel(true)

  await elegirSujeto(['files', 'x'], lectura.leer)
  await elegirSujeto(['projects', '1'], lectura.leer)

  assert.equal(lectura.llamadas.n, 1)
})

// --- lista blanca (404) ---------------------------------------------------------------------------

test('el contacto no puede pedir rutas del panel: la lista blanca las rechaza (404 en el BFF)', () => {
  for (const ruta of [['tickets'], ['clients', '1'], ['staff'], ['settings']]) {
    assert.equal(rutaPermitida(ruta, 'contacto'), false, ruta.join('/'))
  }
})

test('portal/tickets pasa para el contacto y no para el staff', () => {
  assert.equal(rutaPermitida(['portal', 'tickets'], 'contacto'), true)
  assert.equal(rutaPermitida(['portal', 'tickets', '7', 'respuestas'], 'contacto'), true)
  assert.equal(rutaPermitida(['portal', 'tickets'], 'staff'), false)
})

test('tickets pasa para el staff y no para el contacto', () => {
  assert.equal(rutaPermitida(['tickets', '7'], 'staff'), true)
  assert.equal(rutaPermitida(['tickets', '7'], 'contacto'), false)
})

test('un segmento con escape no pasa ni en portal/tickets', () => {
  assert.equal(rutaPermitida(['portal', 'tickets', '..', 'clients'], 'contacto'), false)
  assert.equal(rutaPermitida(['portal', 'tickets', '%2e%2e'], 'contacto'), false)
})

// --- 401 con refresco -----------------------------------------------------------------------------

test('esTokenVencido reconoce solo el 401 token_expired y deja la respuesta legible', async () => {
  const vencida = respuesta(401, 'token_expired')

  assert.equal(await esTokenVencido(vencida), true)
  assert.equal((await vencida.json()).error.code, 'token_expired')
  assert.equal(await esTokenVencido(respuesta(401, 'unauthenticated')), false)
  assert.equal(await esTokenVencido(respuesta(403, 'token_expired')), false)
  assert.equal(await esTokenVencido(new Response('<html>', { status: 401 })), false)
  assert.equal(await esTokenVencido(respuesta(200)), false)
})

test('una respuesta buena no refresca ni toca la cookie', async () => {
  const { dependencias: deps, registro } = dependencias({ respuestas: [respuesta(200)], refresco: renovada })
  const resultado = await llamarConRefresco(sesion, deps)

  assert.equal(resultado.respuesta.status, 200)
  assert.deepEqual(registro.tokens, ['viejo'])
  assert.equal(registro.refrescos, 0)
})

test('token vencido: refresca una vez, guarda la cookie nueva y reintenta con el token nuevo', async () => {
  const { dependencias: deps, registro } = dependencias({
    respuestas: [respuesta(401, 'token_expired'), respuesta(200)],
    refresco: renovada
  })
  const resultado = await llamarConRefresco(sesion, deps)

  assert.equal(resultado.respuesta.status, 200)
  assert.deepEqual(registro.tokens, ['viejo', 'nuevo'])
  assert.deepEqual(registro.guardadas, [renovada])
  assert.equal(registro.refrescos, 1)
  assert.equal(registro.borrados, 0)
})

test('token vencido y refresco rechazado: borra la sesion y avisa que se cerro, sin reintentar', async () => {
  const { dependencias: deps, registro } = dependencias({
    respuestas: [respuesta(401, 'token_expired'), respuesta(200)],
    refresco: null
  })
  const resultado = await llamarConRefresco(sesion, deps)

  assert.deepEqual(resultado, { sesionCerrada: true })
  assert.deepEqual(registro.tokens, ['viejo'])
  assert.equal(registro.borrados, 1)
  assert.deepEqual(registro.guardadas, [])
})

test('un 401 con otro codigo no refresca y se devuelve tal cual', async () => {
  const { dependencias: deps, registro } = dependencias({ respuestas: [respuesta(401, 'unauthenticated')], refresco: renovada })
  const resultado = await llamarConRefresco(sesion, deps)

  assert.equal(resultado.respuesta.status, 401)
  assert.equal(registro.refrescos, 0)
  assert.equal(registro.borrados, 0)
})

test('un fallo al refrescar que no es un rechazo se propaga y no borra la sesion', async () => {
  const { dependencias: deps, registro } = dependencias({
    respuestas: [respuesta(401, 'token_expired')],
    refresco: new Error('red caida')
  })

  await assert.rejects(llamarConRefresco(sesion, deps), /red caida/)
  assert.equal(registro.borrados, 0)
})

test('si el reintento tambien falla se devuelve esa respuesta, sin refrescar otra vez', async () => {
  const { dependencias: deps, registro } = dependencias({
    respuestas: [respuesta(401, 'token_expired'), respuesta(401, 'token_expired')],
    refresco: renovada
  })
  const resultado = await llamarConRefresco(sesion, deps)

  assert.equal(resultado.respuesta.status, 401)
  assert.equal(registro.refrescos, 1)
})

// --- cabeceras de descarga ------------------------------------------------------------------------

test('la descarga de un adjunto de ticket sale como attachment, nosniff y sandbox', () => {
  const salida = cabecerasDeSalida(
    new Response('x', { headers: { 'content-type': 'text/html', 'content-disposition': 'inline; filename="a.html"' } }),
    true
  )

  assert.equal(salida.get('content-disposition'), 'attachment; filename="a.html"')
  assert.equal(salida.get('x-content-type-options'), 'nosniff')
  assert.equal(salida.get('content-security-policy'), 'sandbox')
})

test('el listado portal/tickets no fuerza cabeceras de descarga', () => {
  const salida = cabecerasDeSalida(new Response('{}', { headers: { 'content-type': 'application/json' } }))

  assert.equal(salida.get('content-disposition'), null)
  assert.equal(salida.get('content-security-policy'), null)
  assert.equal(salida.get('content-type'), 'application/json')
})
