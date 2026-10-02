/**
 * Pruebas de la pantalla de Focals.
 *
 * Lo que se verifica es lo que el servidor NO garantiza y la pantalla tiene que resolver sola: unir
 * dos listados que llegan por separado, ordenar los Proyectos de una cuenta, y traducir los tres
 * códigos con los que Thinking Orb dice "esto no está roto".
 *
 * La fórmula del semáforo no se prueba acá: vive entera en el backend (`Salud\Formula`) y repetirla
 * en el front daría dos verdades sobre el mismo puntaje. Lo que sí se prueba es que los `sin_datos`
 * no se traten como el peor caso, que es el error que un indicador de salud no puede darse.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  agruparPorCliente,
  contarPorTramo,
  mensajeDeFalloDeEstado,
  nombreDe,
  nombresDeFocales,
  ordenarPorSemaforo,
  pedirEstado,
  rutaDeEstado,
  tramosEnCero
} from '../src/datos/focals.ts'
import { GLOSARIO, nombrar } from '../src/dominio/glosario.ts'

/** Un score de cliente con lo mínimo que la pantalla toca. */
function cliente (id, score, semaforo) {
  return {
    client_id: id,
    cliente: `Cliente ${id}`,
    fecha: '2026-09-11',
    score,
    semaforo,
    variacion: null,
    espacios: 0,
    procesos: 0,
    senales: senales()
  }
}

/** Un score de Proyecto con lo mínimo que la pantalla toca. */
function espacio (id, clientId, score, semaforo, nombre = `Proyecto ${id}`) {
  return {
    project_id: id,
    espacio: nombre,
    client_id: clientId,
    cliente: `Cliente ${clientId}`,
    fecha: '2026-09-11',
    score,
    semaforo,
    variacion: null,
    procesos: 0,
    senales: senales(),
    estado: null
  }
}

function senales () {
  return {
    plazos: { peso: 45, score: null, medibles: 0, incumplidos: 0, en_riesgo: 0, atraso_promedio: null },
    carga: { peso: 30, score: null, abiertos: 0, con_movimiento: 0, estancados: 0, dias_ventana: 14 },
    vencimientos: { peso: 25, score: null, por_vencer: 0, criticos: 0, vencidos: 0 }
  }
}

test('el glosario nombra a esta gente "Focals", y de ahí sale la interfaz', () => {
  assert.equal(GLOSARIO.focal.plural, 'Focals')
  assert.equal(GLOSARIO.focal.singular, 'Focal')
  assert.equal(nombrar('focal', 2), 'Focals')
  assert.equal(nombrar('focal', 1), 'Focal')
})

test('agrupar respeta el orden de clientes que trae el servidor', () => {
  const clientes = [cliente(7, 12, 'rojo'), cliente(3, 80, 'verde')]
  const espacios = [espacio(1, 3, 80, 'verde'), espacio(2, 7, 12, 'rojo')]

  const cuentas = agruparPorCliente(clientes, espacios)

  assert.deepEqual(cuentas.map((c) => c.cliente.client_id), [7, 3])
  assert.deepEqual(cuentas[0].espacios.map((e) => e.project_id), [2])
  assert.deepEqual(cuentas[1].espacios.map((e) => e.project_id), [1])
})

test('un cliente sin Proyectos queda con la lista vacía, no se pierde de la pantalla', () => {
  const cuentas = agruparPorCliente([cliente(5, null, 'sin_datos')], [])

  assert.equal(cuentas.length, 1)
  assert.deepEqual(cuentas[0].espacios, [])
})

test('un Proyecto de un cliente que no está en la lista se descarta', () => {
  // Las dos llamadas vieron carteras distintas. Mejor un Proyecto de menos que media pantalla con
  // una tarjeta sin cliente.
  const cuentas = agruparPorCliente([cliente(1, 40, 'rojo')], [espacio(9, 99, 40, 'rojo')])

  assert.deepEqual(cuentas[0].espacios, [])
})

test('un Proyecto sin cliente no rompe el agrupado', () => {
  const huerfano = { ...espacio(9, 1, 40, 'rojo'), client_id: null }

  const cuentas = agruparPorCliente([cliente(1, 40, 'rojo')], [huerfano])

  assert.deepEqual(cuentas[0].espacios, [])
})

test('los Proyectos van del peor al mejor, y "sin datos" al final', () => {
  const ordenados = ordenarPorSemaforo([
    espacio(1, 1, null, 'sin_datos'),
    espacio(2, 1, 90, 'verde'),
    espacio(3, 1, 4, 'rojo')
  ])

  assert.deepEqual(ordenados.map((e) => e.project_id), [3, 2, 1])
})

test('a igual puntaje manda el nombre, y el arreglo de entrada no se toca', () => {
  const entrada = [espacio(1, 1, 10, 'rojo', 'Zeta'), espacio(2, 1, 10, 'rojo', 'Alfa')]

  const ordenados = ordenarPorSemaforo(entrada)

  assert.deepEqual(ordenados.map((e) => e.espacio), ['Alfa', 'Zeta'])
  assert.deepEqual(entrada.map((e) => e.espacio), ['Zeta', 'Alfa'])
})

test('el recuento por tramo declara los cuatro tramos, también los que dan cero', () => {
  const cuenta = contarPorTramo([
    espacio(1, 1, 4, 'rojo'),
    espacio(2, 1, 4, 'rojo'),
    espacio(3, 1, null, 'sin_datos')
  ])

  assert.deepEqual(cuenta, { verde: 0, amarillo: 0, rojo: 2, sin_datos: 1 })
})

test('un Proyecto sin nombre se muestra por su id, nunca en blanco', () => {
  assert.equal(nombreDe({ ...espacio(42, 1, 4, 'rojo'), espacio: null }), '#42')
  assert.equal(nombreDe(espacio(42, 1, 4, 'rojo', 'Rediseño')), 'Rediseño')
})

test('la ruta del estado se arma con el id del Proyecto', () => {
  assert.equal(rutaDeEstado(12), 'ia/proyectos/12/estado')
})

test('la ruta del estado rechaza un id que no sea un entero mayor que 0', () => {
  // Un NaN, un cero, un negativo o un decimal armarían una ruta que el BFF rechaza sin explicar por qué.
  for (const invalido of [Number.NaN, 0, -3, 1.5, Infinity]) {
    assert.throws(() => rutaDeEstado(invalido), RangeError)
  }
})

test('los tramos en cero declaran los cuatro tramos y cada llamada devuelve un objeto propio', () => {
  const uno = tramosEnCero()
  uno.rojo += 1

  assert.deepEqual(tramosEnCero(), { verde: 0, amarillo: 0, rojo: 0, sin_datos: 0 })
})

test('404 es Thinking Orb apagado y 409 es que todavía no corrió el cálculo', () => {
  // Los dos son estados normales del sistema, y la diferencia importa: en uno no hay nada que hacer
  // y en el otro basta con esperar al cálculo del día.
  const apagado = mensajeDeFalloDeEstado(404, 'Recurso desconocido: "ia".')
  const sinFoto = mensajeDeFalloDeEstado(409, 'Todavía no hay semáforo de hoy para este Espacio.')

  assert.match(apagado, /apagado/)
  assert.notEqual(apagado, sinFoto)
  assert.match(sinFoto, /una vez al día/)
  assert.match(mensajeDeFalloDeEstado(429, 'x'), /cuota/)
})

test('lo que no está previsto se cuenta con las palabras del servidor', () => {
  assert.equal(mensajeDeFalloDeEstado(500, 'Se cayó todo'), 'Se cayó todo')
})

test('los tres mensajes previstos dicen que falta el párrafo, no que el semáforo se rompió', () => {
  // El párrafo es lo único que falta cuando la IA no contesta: el puntaje se sigue viendo. Si el
  // mensaje dijera "no se pudo cargar el semáforo", mandaría a alguien a revisar un cálculo sano.
  assert.match(mensajeDeFalloDeEstado(404, 'x'), /semáforo se ve igual/)
  assert.match(mensajeDeFalloDeEstado(409, 'x'), /foto de hoy/)
  assert.match(mensajeDeFalloDeEstado(429, 'x'), /no depende de ella/)
})

test('un Proyecto sin puntaje ni nombre no rompe el orden ni se vuelve el peor', () => {
  const sinNada = { ...espacio(5, 1, null, 'sin_datos'), espacio: null }
  const ordenados = ordenarPorSemaforo([sinNada, espacio(6, 1, 30, 'rojo', 'Beta')])

  assert.deepEqual(ordenados.map((e) => e.project_id), [6, 5])
})

test('un cliente repetido en la lista recibe sus Proyectos en cada aparición', () => {
  const cuentas = agruparPorCliente([cliente(1, 40, 'rojo'), cliente(1, 40, 'rojo')], [espacio(9, 1, 40, 'rojo')])

  assert.equal(cuentas.length, 2)
  assert.deepEqual(cuentas.map((c) => c.espacios.map((e) => e.project_id)), [[9], [9]])
})

test('sin clientes ni Proyectos la cartera queda vacía', () => {
  assert.deepEqual(agruparPorCliente([], []), [])
  assert.deepEqual(agruparPorCliente([], [espacio(1, 1, 10, 'rojo')]), [])
})

/**
 * Un `fetch` falso que responde lo que se le diga y recuerda con qué lo llamaron.
 *
 * @param responder función que devuelve la `Response`, o lanza para simular la red caída
 */
function traerFalso (responder) {
  const llamadas = []
  const traer = async (url, opciones) => {
    llamadas.push({ url, opciones })

    return await responder(opciones)
  }

  return { traer, llamadas }
}

const ESTADO = { texto: 'Va bien.', generado_en: '2026-10-02 08:00:00', vigente: true, reutilizado: false }

test('pedirEstado devuelve el estado cuando el servidor lo manda completo', async () => {
  const { traer, llamadas } = traerFalso(() => Response.json({ data: ESTADO }))

  const resultado = await pedirEstado(12, { traer })

  assert.deepEqual(resultado, {
    ok: true,
    estado: { texto: 'Va bien.', generado_en: '2026-10-02 08:00:00', vigente: true }
  })
  assert.equal(llamadas[0].url, '/api/bff/ia/proyectos/12/estado')
  assert.equal(llamadas[0].opciones.method, 'POST')
  assert.ok(llamadas[0].opciones.signal instanceof AbortSignal)
})

test('pedirEstado explica 404, 409 y 429 como desenlaces esperados, sin leer el cuerpo', async () => {
  for (const codigo of [404, 409, 429]) {
    const respuesta = new Response('<html>no debería leerse</html>', { status: codigo })
    const { traer } = traerFalso(() => respuesta)

    const resultado = await pedirEstado(12, { traer })

    assert.equal(respuesta.bodyUsed, false)
    assert.equal(resultado.ok, false)
    assert.equal(resultado.esperado, true)
    assert.equal(resultado.error, mensajeDeFalloDeEstado(codigo, ''))
  }
})

test('pedirEstado distingue la sesión cerrada y un permiso negado de los esperados', async () => {
  const sesion = await pedirEstado(12, {
    traer: traerFalso(() => Response.json({ error: { code: 'unauthenticated', message: 'x' } }, { status: 401 })).traer
  })
  const permiso = await pedirEstado(12, {
    traer: traerFalso(() => Response.json({ error: { code: 'forbidden', message: 'Sin acceso a este Proyecto.' } }, { status: 403 })).traer
  })

  assert.equal(sesion.ok, false)
  assert.equal(sesion.esperado, false)
  assert.match(sesion.error, /sesión/)
  assert.equal(permiso.ok, false)
  assert.equal(permiso.esperado, false)
  assert.equal(permiso.error, 'Sin acceso a este Proyecto.')
})

test('pedirEstado devuelve el mensaje del servidor en una falla real', async () => {
  const { traer } = traerFalso(() => Response.json(
    { error: { code: 'server_error', message: 'Error interno.', details: { incidente: 'ab12cd34' } } },
    { status: 500 }
  ))

  const resultado = await pedirEstado(12, { traer })

  assert.equal(resultado.ok, false)
  assert.equal(resultado.esperado, false)
  assert.match(resultado.error, /Error interno/)
})

test('pedirEstado rechaza un cuerpo ilegible o con la forma equivocada', async () => {
  const cuerpos = [
    () => new Response('no es json', { status: 200 }),
    () => Response.json({}),
    () => Response.json({ data: null }),
    () => Response.json({ data: { ...ESTADO, texto: '   ' } }),
    () => Response.json({ data: { ...ESTADO, texto: 12 } }),
    () => Response.json({ data: { ...ESTADO, vigente: 'si' } }),
    () => Response.json({ data: { texto: 'Hola', vigente: true } })
  ]

  for (const cuerpo of cuerpos) {
    const resultado = await pedirEstado(12, { traer: traerFalso(cuerpo).traer })

    assert.equal(resultado.ok, false)
    assert.equal(resultado.esperado, false)
    assert.match(resultado.error, /no se pudo leer/)
  }
})

test('pedirEstado cuenta la red caída sin lanzar', async () => {
  const { traer } = traerFalso(() => { throw new TypeError('fetch failed') })

  const resultado = await pedirEstado(12, { traer })

  assert.equal(resultado.ok, false)
  assert.equal(resultado.esperado, false)
  assert.match(resultado.error, /contactar al servidor/)
})

test('pedirEstado se rinde cuando se acaba el tiempo y lo dice con otras palabras', async () => {
  const { traer } = traerFalso(({ signal }) => new Promise((resolver, rechazar) => {
    signal.addEventListener('abort', () => { rechazar(signal.reason) })
  }))

  const resultado = await pedirEstado(12, { traer, tiempoMaximoMs: 5 })

  assert.equal(resultado.ok, false)
  assert.equal(resultado.esperado, false)
  assert.match(resultado.error, /tardó demasiado/)
})

test('pedirEstado respeta la señal de quien dejó de esperar', async () => {
  const controlador = new AbortController()
  const { traer } = traerFalso(({ signal }) => new Promise((resolver, rechazar) => {
    signal.addEventListener('abort', () => { rechazar(signal.reason) })
  }))

  const pendiente = pedirEstado(12, { traer, senal: controlador.signal })
  controlador.abort()
  const resultado = await pendiente

  assert.equal(resultado.ok, false)
  assert.equal(resultado.esperado, true)
})

test('pedirEstado con un id inválido lanza antes de pedir nada', async () => {
  const { traer, llamadas } = traerFalso(() => Response.json({ data: ESTADO }))

  await assert.rejects(() => pedirEstado(Number.NaN, { traer }), RangeError)
  assert.equal(llamadas.length, 0)
})

test('los focales de una cuenta se dibujan en el orden de alta que puso el servidor', () => {
  const cuenta = {
    focales: [
      { id: 53, full_name: 'Ana Pérez' },
      { id: 61, full_name: 'Luis Muñoz' }
    ]
  }

  assert.deepEqual(nombresDeFocales(cuenta), ['Ana Pérez', 'Luis Muñoz'])
})

test('una cuenta sin focal, o una API vieja, dan lista vacía y no rompen la tarjeta', () => {
  // Los tres casos son el mismo para la pantalla: no hay a quién nombrar. Distinguirlos la obligaría
  // a dibujar tres estados de los que dos no significan nada distinto para quien mira.
  assert.deepEqual(nombresDeFocales({ focales: [] }), [])
  assert.deepEqual(nombresDeFocales({}), [])
  assert.deepEqual(nombresDeFocales({ focales: undefined }), [])
})

test('un nombre en blanco no pinta una insignia vacía', () => {
  const cuenta = { focales: [{ id: 7, full_name: '   ' }, { id: 8, full_name: ' Ana Pérez ' }] }

  assert.deepEqual(nombresDeFocales(cuenta), ['Ana Pérez'])
})
