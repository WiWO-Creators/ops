/**
 * Pruebas de LIVE: quien ve a quien, como se lee y se ordena el tablero, y que se le dice a la
 * persona cuando el medidor no arranca.
 *
 * Las tres cosas se rompen en silencio. Un alcance mal resuelto le pide a la API un tablero que no
 * le corresponde —o se lo esconde a quien si lo tiene—; una jerarquia que se come el nivel de la
 * Tarea deja "midiendo el Proyecto entero" indistinguible de "midiendo una Tarea", que es el unico
 * caso que esta pantalla existe para delatar; y un mensaje que no distingue el `409` de la jornada
 * del `409` del medidor deja a la persona sin saber que apretar.
 *
 * Y la cuarta cosa que se rompe en silencio es la marca de "hoy no": si caduca mal, o se pierde, la
 * ventana de apertura vuelve a interrumpir en cada recarga —que es el bucle que la hizo intrusiva— y
 * si no caduca nunca, deja de pedir la jornada para siempre.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cargoYArea, ordenarPorActividad, repartirTablero, trabajoDeLaFila } from '../src/componentes/live/presentacion.ts'
import {
  alcanceDeLive,
  claveDeJornadaPospuesta,
  clienteDeJornada,
  cuerpoDeApertura,
  esJefatura,
  filtrarPorNombre,
  fraseDeJornadaSinDestino,
  jornadaPospuestaHoy,
  jornadaSinDestino,
  mensajeDeFalloDeCliente,
  mensajeDeFalloDeJornada,
  mensajeDeFalloDeMedidor,
  olvidarJornadaPospuesta,
  posponerJornadaPorHoy,
  salidasDeApertura
} from '../src/dominio/live.ts'
import { GLOSARIO } from '../src/dominio/glosario.ts'

/** Un `/me` minimo: solo lo que `alcanceDeLive` mira. */
const yo = (extra = {}) => ({
  is_superadmin: false,
  is_director: false,
  dirige_areas: false,
  permissions: { tasks: [], projects: [], customers: [], staff: [] },
  ...extra
})

/** Una fila del tablero, con lo justo para ordenarla. */
const fila = (id, nombre, { espacio = null, tarea = null, jornada = false } = {}) => ({
  staff: { id, name: nombre, avatar: null, cargo: null, area: null },
  jornada: jornada || espacio !== null || tarea !== null
    ? { id, started_at: '2026-09-09T12:00:00Z', seconds: 3600 }
    : null,
  medidor: espacio === null && tarea === null
    ? null
    : {
        id,
        project: espacio,
        task: tarea,
        start_time: '2026-09-09T12:30:00Z',
        seconds: 600
      },
  presencia: null,
  seconds_today: 3600
})

const DELCO = { id: 4, name: 'DELCO' }
const ACME = { id: 9, name: 'ACME' }

test('sin permisos ni cargo, uno solo se ve a si mismo', () => {
  assert.equal(alcanceDeLive(yo()), 'propio')
})

test('el cargo Director abre el area, aunque Perfex no le haya dado ninguna capacidad', () => {
  assert.equal(alcanceDeLive(yo({ is_director: true })), 'area')
})

test('quien dirige un area del organigrama ve a su gente, sin cargo ni capacidad de Perfex', () => {
  // El caso que antes caia en `propio`: la API le daba el tablero entero de su rama y la pantalla
  // ni se lo pedia, asi que el lider no veia a nadie.
  assert.equal(alcanceDeLive(yo({ dirige_areas: true })), 'subordinados')
})

test('el organigrama gana sobre el cargo Director, que es la regla anterior', () => {
  assert.equal(alcanceDeLive(yo({ dirige_areas: true, is_director: true })), 'subordinados')
})

test('quien puede ver el Equipo ve el tablero entero', () => {
  const conStaffView = yo({ permissions: { tasks: [], projects: [], customers: [], staff: ['view'] } })

  assert.equal(alcanceDeLive(conStaffView), 'todo')
})

test('el superadministrador ve el tablero entero aunque no tenga la capacidad de Perfex', () => {
  assert.equal(alcanceDeLive(yo({ is_superadmin: true })), 'todo')
})

test('el alcance total gana sobre el de area', () => {
  const ambos = yo({
    is_director: true,
    permissions: { tasks: [], projects: [], customers: [], staff: ['view'] }
  })

  assert.equal(alcanceDeLive(ambos), 'todo')
})

test('el alcance total gana tambien sobre el del organigrama', () => {
  const ambos = yo({
    dirige_areas: true,
    permissions: { tasks: [], projects: [], customers: [], staff: ['view'] }
  })

  assert.equal(alcanceDeLive(ambos), 'todo')
})

test('quien mide va antes que quien solo tiene jornada, y ese antes que quien no tiene nada', () => {
  const orden = ordenarPorActividad([
    fila(1, 'Zoe', { jornada: true }),
    fila(2, 'Ana'),
    fila(3, 'Beto', { tarea: { id: 5, name: 'Algo' } })
  ])

  assert.deepEqual(orden.map((f) => f.staff.name), ['Beto', 'Zoe', 'Ana'])
})

test('a igualdad, alfabetico en español: la Ñ y los acentos no se van al final', () => {
  const orden = ordenarPorActividad([
    fila(1, 'Zoe', { espacio: DELCO }),
    fila(2, 'Ñato', { espacio: ACME }),
    fila(3, 'Ángela', { espacio: DELCO })
  ])

  assert.deepEqual(orden.map((f) => f.staff.name), ['Ángela', 'Ñato', 'Zoe'])
})

test('ninguna fila se pierde por el camino, y la lista original no se toca', () => {
  const filas = [
    fila(1, 'Ana', { espacio: DELCO }),
    fila(2, 'Beto'),
    fila(3, 'Carla', { espacio: ACME })
  ]
  const antes = filas.map((f) => f.staff.name)
  const orden = ordenarPorActividad(filas)

  assert.equal(orden.length, filas.length)
  // Ordenar el estado de React en el sitio es como se consiguen los repintados que no ocurren.
  assert.deepEqual(filas.map((f) => f.staff.name), antes)
})

test('un tablero vacio da una lista vacia', () => {
  assert.deepEqual(ordenarPorActividad([]), [])
})

test('quien mide cuelga dos niveles, y sus nombres salen del glosario', () => {
  const trabajo = trabajoDeLaFila(
    fila(1, 'Ana', { espacio: DELCO, tarea: { id: 77, name: 'Status semanal' } })
  )

  assert.equal(trabajo.midiendo, true)
  assert.deepEqual(trabajo.niveles.map((n) => n.etiqueta), [
    GLOSARIO.espacio.singular,
    GLOSARIO.proceso.singular
  ])
  assert.deepEqual(trabajo.niveles.map((n) => n.valor), ['DELCO', 'Status semanal'])
  assert.ok(trabajo.niveles.every((n) => !n.pendiente))
})

test('un medidor de Espacio sin Tarea lo dice, en vez de dejar el hueco', () => {
  const trabajo = trabajoDeLaFila(fila(1, 'Ana', { espacio: DELCO }))

  assert.equal(trabajo.niveles.length, 2)
  assert.equal(trabajo.niveles[0].valor, 'DELCO')
  assert.equal(trabajo.niveles[1].pendiente, true)
  assert.match(trabajo.niveles[1].valor, new RegExp(GLOSARIO.proceso.singular, 'i'))
})

test('con Proyecto y sin Tarea el nivel vacio es neutro: es una eleccion valida, no un defecto', () => {
  // La Tarea volvio a ser opcional el 2026-09-11. Pintar "aviso" ahi seria regañar a quien hizo
  // exactamente lo que el cliente pidio poder hacer.
  const trabajo = trabajoDeLaFila(fila(1, 'Ana', { espacio: DELCO }))

  assert.equal(trabajo.niveles[1].tono, 'neutro')
  assert.doesNotMatch(trabajo.niveles[1].valor, /falta/i)
})

test('el Espacio vacio si es un aviso: sin el no hay a que imputar el tiempo por ningun camino', () => {
  const trabajo = trabajoDeLaFila(fila(1, 'Ana', { tarea: { id: 77, name: 'Status semanal' } }))

  assert.equal(trabajo.niveles[0].tono, 'aviso')
})

test('una Tarea suelta conserva su nivel y avisa que no hay Espacio detras', () => {
  const trabajo = trabajoDeLaFila(fila(1, 'Ana', { tarea: { id: 77, name: 'Status semanal' } }))

  assert.equal(trabajo.niveles[0].pendiente, true)
  assert.equal(trabajo.niveles[1].valor, 'Status semanal')
  assert.equal(trabajo.niveles[1].pendiente, false)
})

test('el medidor huerfano se muestra igual, con los dos niveles pendientes y en aviso', () => {
  const huerfano = fila(1, 'Ana', { jornada: true })
  huerfano.medidor = { id: 1, project: null, task: null, start_time: '2026-09-09T12:30:00Z', seconds: 600 }
  const trabajo = trabajoDeLaFila(huerfano)

  assert.equal(trabajo.midiendo, true)
  assert.deepEqual(trabajo.niveles.map((n) => n.pendiente), [true, true])
  // Sin Espacio no hay eleccion legitima que defender: los dos niveles avisan.
  assert.deepEqual(trabajo.niveles.map((n) => n.tono), ['aviso', 'aviso'])
})

test('sin medidor no hay jerarquia que colgar, y el motivo distingue los dos casos', () => {
  const conJornada = trabajoDeLaFila(fila(1, 'Ana', { jornada: true }))
  const sinJornada = trabajoDeLaFila(fila(2, 'Beto'))

  assert.equal(conJornada.midiendo, false)
  assert.equal(sinJornada.midiendo, false)
  assert.notEqual(conJornada.motivo, sinJornada.motivo)
  assert.match(sinJornada.motivo, /sin jornada/i)
})

test('sin cargo ni area no se pinta un separador suelto', () => {
  assert.equal(cargoYArea({ cargo: null, area: null }), null)
  assert.equal(cargoYArea({ cargo: '  ', area: null }), null)
})

test('el cargo y el area van juntos, y no se repiten cuando dicen lo mismo', () => {
  assert.equal(cargoYArea({ cargo: 'Diseñadora', area: 'Creativo' }), 'Diseñadora · Creativo')
  assert.equal(cargoYArea({ cargo: 'Diseño', area: 'Diseño' }), 'Diseño')
  assert.equal(cargoYArea({ cargo: null, area: 'Creativo' }), 'Creativo')
})

test('el 409 al arrancar nombra las dos causas, porque la API no las distingue', () => {
  const mensaje = mensajeDeFalloDeMedidor(409, true)

  assert.match(mensaje, /jornada/i)
  assert.match(mensaje, /medidor corriendo/i)
})

test('el 409 al detener dice otra cosa que el de arrancar', () => {
  assert.notEqual(mensajeDeFalloDeMedidor(409, true), mensajeDeFalloDeMedidor(409, false))
  assert.match(mensajeDeFalloDeMedidor(409, false), /no tienes/i)
})

test('un fallo de red no muestra un codigo inventado', () => {
  assert.match(mensajeDeFalloDeMedidor(0, true), /conexión/i)
  assert.doesNotMatch(mensajeDeFalloDeMedidor(0, true), /\b0\b/)
})

test('cualquier codigo desconocido igual produce una frase', () => {
  assert.match(mensajeDeFalloDeMedidor(500, true), /500/)
  assert.ok(mensajeDeFalloDeMedidor(418, false).length > 0)
})

test('el 403 distingue arrancar de detener', () => {
  assert.match(mensajeDeFalloDeMedidor(403, false), /propio/i)
  assert.notEqual(mensajeDeFalloDeMedidor(403, true), mensajeDeFalloDeMedidor(403, false))
})

test('el 409 de la jornada no es ambiguo y se dice tal cual', () => {
  assert.match(mensajeDeFalloDeJornada(409, true), /ya tienes una jornada/i)
  assert.match(mensajeDeFalloDeJornada(409, false), /no tienes ninguna/i)
})

/**
 * El tablero se parte en dos, y el corte es tener jornada.
 *
 * `GET /live` devuelve a toda la empresa: en la base real, 184 filas para una persona midiendo. Si
 * las 183 restantes entran en la misma lista que la que trabaja, la pantalla que contesta "quien
 * esta trabajando ahora" es una pared de tarjetas que dicen "Sin jornada abierta".
 */
test('repartirTablero separa a quien tiene jornada de quien no', () => {
  const filas = [
    fila(1, 'Zoe'),
    fila(2, 'Ana', { jornada: true }),
    fila(3, 'Beto', { espacio: DELCO }),
    fila(4, 'Ada')
  ]

  const { activos, enReposo } = repartirTablero(filas)

  assert.deepEqual(activos.map((f) => f.staff.name), ['Beto', 'Ana'])
  assert.deepEqual(enReposo.map((f) => f.staff.name), ['Ada', 'Zoe'])
  assert.equal(activos.length + enReposo.length, filas.length, 'no se puede perder una fila')
})

/** Un medidor sin jornada es raro, pero es actividad: no puede caer en el pliegue. */
test('repartirTablero cuenta como activo el medidor sin jornada', () => {
  const huerfano = { ...fila(9, 'Huerfano', { espacio: ACME }), jornada: null }
  const { activos, enReposo } = repartirTablero([huerfano])

  assert.equal(activos.length, 1)
  assert.equal(enReposo.length, 0)
})

/**
 * El enlace al resumen del equipo se ofrece solo a quien puede abrirlo.
 *
 * Esconder no autoriza —la compuerta es el 403 de la API— pero un enlace que lleva a una pantalla
 * sin permiso tampoco informa: la mitad de la empresa lo vería y ninguna lo podría usar.
 */
test('esJefatura deja fuera a lider, focal y usuario', () => {
  for (const nivel of ['head', 'gerente', 'admin', 'superadmin']) {
    assert.equal(esJefatura(nivel), true, `${nivel} tendría que ver el resumen`)
  }

  for (const nivel of ['usuario', 'focal', 'lider']) {
    assert.equal(esJefatura(nivel), false, `${nivel} no tendría que ver el resumen`)
  }
})

/**
 * Abrir con destino puede fallar por el destino, no por la jornada.
 *
 * Desde que `POST /me/jornada` recibe el destino, la misma peticion arranca el medidor, asi que
 * devuelve su 403/404. Un mensaje que hable de la jornada mandaria a la persona a buscar donde no
 * es: la jornada no quedo abierta —la API la descarta— y lo que tiene que cambiar es el destino.
 *
 * El 403 y el 404 nombran los DOS niveles desde que la Tarea es opcional: sin ella se abre contra el
 * Proyecto entero, y ahi el que no existe o no es suyo es el Proyecto.
 */
test('el fallo al abrir con destino nombra el destino, no la jornada', () => {
  for (const codigo of [403, 404]) {
    assert.match(mensajeDeFalloDeJornada(codigo, true), /Proyecto/)
    assert.match(mensajeDeFalloDeJornada(codigo, true), /Tarea/)
  }

  assert.match(mensajeDeFalloDeJornada(422, true), /Tarea/)

  // Al cerrar no hay destino en juego: ahi 403 sigue siendo un fallo generico.
  assert.doesNotMatch(mensajeDeFalloDeJornada(403, false), /Tarea/)
})

/** El 409 sigue siendo el de la jornada: otra pestaña la abrio primero. */
test('el 409 al abrir sigue hablando de la jornada', () => {
  assert.equal(mensajeDeFalloDeJornada(409, true), 'Ya tienes una jornada abierta.')
})

/**
 * Un `localStorage` de mentira, con lo justo que miran las funciones de la marca.
 *
 * @param inicial pares clave/valor ya guardados
 * @returns el almacenamiento fingido, con su mapa a la vista para comprobar lo que se escribio
 */
function almacenamiento (inicial = {}) {
  const datos = new Map(Object.entries(inicial))

  return {
    datos,
    getItem: (clave) => datos.get(clave) ?? null,
    setItem: (clave, valor) => { datos.set(clave, valor) },
    removeItem: (clave) => { datos.delete(clave) }
  }
}

/** Uno que lanza en las tres operaciones, como en una ventana privada. */
function almacenamientoBloqueado () {
  const negar = () => { throw new DOMException('El almacenamiento está bloqueado.', 'SecurityError') }

  return { getItem: negar, setItem: negar, removeItem: negar }
}

const HOY = '2026-09-14'
const AYER = '2026-09-13'
const STAFF = 183

test('con la marca de hoy puesta, la jornada no se vuelve a exigir', () => {
  const alm = almacenamiento({ [claveDeJornadaPospuesta(STAFF, HOY)]: '1' })

  assert.equal(jornadaPospuestaHoy(alm, STAFF, HOY), true)
})

test('la marca de ayer no vale hoy: la jornada se exige de nuevo por la mañana', () => {
  // Es el punto entero de meter el dia en la clave. Sin esto, "ahora no" duraria para siempre.
  const alm = almacenamiento({ [claveDeJornadaPospuesta(STAFF, AYER)]: '1' })

  assert.equal(jornadaPospuestaHoy(alm, STAFF, HOY), false)
})

test('sin marca, la jornada se exige', () => {
  assert.equal(jornadaPospuestaHoy(almacenamiento(), STAFF, HOY), false)
})

test('la marca es de una persona y no del navegador', () => {
  // Dos cuentas en el mismo equipo —el de recepcion, o quien entra con otra sesion a revisar algo—
  // no heredan una decision que no tomaron.
  const alm = almacenamiento()

  posponerJornadaPorHoy(alm, STAFF, HOY)

  assert.equal(jornadaPospuestaHoy(alm, STAFF, HOY), true)
  assert.equal(jornadaPospuestaHoy(alm, 999, HOY), false)
})

test('abrir la jornada borra la marca del dia', () => {
  const alm = almacenamiento()

  posponerJornadaPorHoy(alm, STAFF, HOY)
  olvidarJornadaPospuesta(alm, STAFF, HOY)

  assert.equal(jornadaPospuestaHoy(alm, STAFF, HOY), false)
  assert.equal(alm.datos.size, 0)
})

/**
 * En una ventana privada, tocar `localStorage` lanza. Lo unico que se puede perder ahi es la memoria
 * de la decision: la cabecera tiene que seguir en pie, y la ventana vuelve a aparecer, que es el
 * comportamiento de siempre y no una pantalla rota.
 */
test('con el almacenamiento bloqueado se degrada a "no se acuerda", sin romper nada', () => {
  const alm = almacenamientoBloqueado()

  assert.doesNotThrow(() => jornadaPospuestaHoy(alm, STAFF, HOY))
  assert.equal(jornadaPospuestaHoy(alm, STAFF, HOY), false)

  assert.doesNotThrow(() => posponerJornadaPorHoy(alm, STAFF, HOY))
  assert.equal(posponerJornadaPorHoy(alm, STAFF, HOY), false)

  assert.doesNotThrow(() => olvidarJornadaPospuesta(alm, STAFF, HOY))
  assert.equal(olvidarJornadaPospuesta(alm, STAFF, HOY), false)
})

/**
 * El combo de Espacios pasa del centenar de opciones y se busca escribiendo. Quien filtra no escribe
 * los acentos ni respeta las mayusculas, asi que comparar el texto crudo esconde justo lo que se
 * esta buscando.
 */
test('buscar en el combo ignora acentos y mayusculas', () => {
  const opciones = [
    { id: 1, name: 'Logística Andina' },
    { id: 2, name: 'MUÑOZ y Compañía' },
    { id: 3, name: 'Delco' }
  ]

  assert.deepEqual(filtrarPorNombre(opciones, 'logistica').map((o) => o.id), [1])
  assert.deepEqual(filtrarPorNombre(opciones, 'MUNOZ').map((o) => o.id), [2])
  // Por subcadena y no por prefijo: los nombres del catalogo empiezan casi todos igual.
  assert.deepEqual(filtrarPorNombre(opciones, 'andina').map((o) => o.id), [1])
  assert.deepEqual(filtrarPorNombre(opciones, 'zzz'), [])
})

test('una busqueda vacia devuelve la lista entera, en su orden', () => {
  const opciones = [{ id: 1, name: 'Uno' }, { id: 2, name: 'Dos' }]

  assert.deepEqual(filtrarPorNombre(opciones, ''), opciones)
  assert.deepEqual(filtrarPorNombre(opciones, '   '), opciones)
})

/**
 * Las tres formas de abrir el dia.
 *
 * Se prueba el cuerpo que sale hacia la API y no lo que se dibuja, porque el cuerpo es lo unico que
 * la API ve y cada campo de mas cambia lo que hace: un `client_id` junto a un `project_id` no es
 * "las dos cosas", y un `task_id` sin su `project_id` es un 422. Lo que hay que fijar es que cada
 * camino mande **exactamente** sus ids y ninguno mas.
 */
test('con Espacio y sin Proceso viaja solo el project_id', () => {
  assert.deepEqual(
    cuerpoDeApertura({ tipo: 'espacio', espacioId: 7, procesoId: null }),
    { project_id: 7 }
  )
})

test('con Espacio y Proceso viajan los dos ids', () => {
  assert.deepEqual(
    cuerpoDeApertura({ tipo: 'espacio', espacioId: 7, procesoId: 42 }),
    { project_id: 7, task_id: 42 }
  )
})

/**
 * El `task_id` ausente se **omite**, no viaja en `0` ni en `null`. La API entiende los tres como
 * "sin Proceso", pero omitirlo es lo unico que no depende de esa equivalencia — y `PATCH` ya
 * demuestra que puede dejar de valer: alli `null` significa *quitar*, no *no elegi*.
 */
test('el Proceso ausente no viaja en 0 ni en null: no viaja', () => {
  const cuerpo = cuerpoDeApertura({ tipo: 'espacio', espacioId: 7, procesoId: null })

  assert.equal('task_id' in cuerpo, false)
})

test('sin Espacio y con Cliente viaja solo el client_id', () => {
  assert.deepEqual(cuerpoDeApertura({ tipo: 'cliente', clienteId: 3 }), { client_id: 3 })
})

/**
 * El camino con Cliente NO manda `project_id`, ni siquiera vacio. Si lo mandara, la API tomaria ese
 * campo como el destino y arrancaria un cronometro que nadie pidio — que es justo lo contrario del
 * acuerdo: la jornada corre, el cronometro no.
 */
test('abrir con Cliente no manda ningun destino contra el que medir', () => {
  const cuerpo = cuerpoDeApertura({ tipo: 'cliente', clienteId: 3 })

  assert.equal('project_id' in cuerpo, false)
  assert.equal('task_id' in cuerpo, false)
})

test('en blanco viaja un cuerpo vacio', () => {
  assert.deepEqual(cuerpoDeApertura({ tipo: 'en-blanco' }), {})
})

/**
 * Que boton se puede apretar.
 *
 * Es la guarda que impide el fallo silencioso: sin Cliente elegido, el boton de la salida con
 * Cliente mandaria un cuerpo sin `client_id`, y ese cuerpo **no falla** — abre una jornada en blanco
 * mientras la persona cree que la abrio para alguien.
 */
test('sin elegir nada solo esta disponible la salida en blanco', () => {
  assert.deepEqual(salidasDeApertura({ espacio: null, cliente: null }), {
    conEspacio: false,
    soloCliente: false,
    enBlanco: true
  })
})

test('con Cliente y sin Espacio se habilita la salida con Cliente', () => {
  assert.deepEqual(salidasDeApertura({ espacio: null, cliente: 3 }), {
    conEspacio: false,
    soloCliente: true,
    enBlanco: true
  })
})

test('con Espacio se habilita el camino principal', () => {
  assert.equal(salidasDeApertura({ espacio: 7, cliente: null }).conEspacio, true)
})

/**
 * Con Espacio elegido, el boton de "sin Espacio" se apaga aunque haya Cliente. Apretarlo abriria el
 * dia **descartando** el Espacio que la persona ya eligio, porque el cuerpo con `client_id` no lleva
 * `project_id`. En la ventana esa combinacion ni se ofrece —el combo de Cliente se esconde en cuanto
 * hay Espacio— pero la regla se afirma igual: esconder no valida.
 */
test('con Espacio elegido la salida con Cliente se apaga aunque haya Cliente', () => {
  assert.equal(salidasDeApertura({ espacio: 7, cliente: 3 }).soloCliente, false)
})

test('la salida en blanco nunca se apaga', () => {
  assert.equal(salidasDeApertura({ espacio: 7, cliente: 3 }).enBlanco, true)
  assert.equal(salidasDeApertura({ espacio: null, cliente: null }).enBlanco, true)
})

/** Un `GET /me/jornada` minimo: solo lo que las reglas del destino miran. */
const dia = ({ abierta = true, cliente = undefined, medidor = null } = {}) => ({
  open: abierta
    ? { id: 1, started_at: '2026-09-14T12:00:00Z', seconds: 3600, ...(cliente === undefined ? {} : { client: cliente }) }
    : null,
  seconds: 3600,
  measured_seconds: 0,
  uncovered_seconds: 3600,
  over_journey: false,
  timer: medidor
})

/**
 * La jornada sin destino es la que las dos salidas nuevas crean, y la cabecera tiene que delatarla:
 * el reloj del dia corre y ningun cronometro lo cubre.
 */
test('una jornada abierta sin medidor es una jornada sin destino', () => {
  assert.equal(jornadaSinDestino(dia()), true)
})

test('con el medidor corriendo la jornada ya tiene destino', () => {
  assert.equal(jornadaSinDestino(dia({ medidor: { id: 9, project: DELCO, task: null, start_time: '', seconds: 60 } })), false)
})

/**
 * Sin jornada abierta no hay nada que delatar, y con el estado sin leer tampoco: `null` es "no se
 * pudo preguntar", y afirmar desde ahi que a alguien le falta destino es inventar.
 */
test('sin jornada abierta, o sin estado leido, no hay jornada sin destino', () => {
  assert.equal(jornadaSinDestino(dia({ abierta: false })), false)
  assert.equal(jornadaSinDestino(null), false)
})

/**
 * Un Cliente no es un destino: contra el no se mide tiempo. Una jornada con Cliente y sin cronometro
 * sigue siendo tiempo sin imputar, y decir lo contrario esconderia justo el caso que hay que ver.
 */
test('tener Cliente no le da destino a la jornada', () => {
  assert.equal(jornadaSinDestino(dia({ cliente: { id: 3, name: 'DELCO' } })), true)
})

/**
 * El Cliente se lee sin confiar en que venga. Una API sin la migracion `0520` no manda el campo, y
 * `client.name` a pelo ahi tumba la cabecera entera por una palabra.
 */
test('el Cliente se lee igual venga, falte o sea null', () => {
  assert.deepEqual(clienteDeJornada(dia({ cliente: { id: 3, name: 'DELCO' } })), { id: 3, name: 'DELCO' })
  assert.equal(clienteDeJornada(dia({ cliente: null })), null)
  // Una API vieja: la clave no existe.
  assert.equal(clienteDeJornada(dia()), null)
  assert.equal(clienteDeJornada(dia({ abierta: false })), null)
  assert.equal(clienteDeJornada(null), null)
})

/**
 * Como se cuenta. El tono importa tanto como el hecho: el pedido fue que la ventana dejara de ser
 * intrusiva, asi que la frase nombra lo que queda por hacer y no lo que se hizo mal.
 */
test('la frase sin Cliente nombra las dos cosas que faltan', () => {
  const frase = fraseDeJornadaSinDestino(null)

  assert.ok(frase.includes(GLOSARIO.espacio.singular.toLowerCase()))
  assert.ok(frase.includes(GLOSARIO.cliente.singular.toLowerCase()))
})

/**
 * Con Cliente se nombra al Cliente: es la mitad que la persona SI resolvio, y darle el mismo aviso
 * que a la jornada abierta en blanco seria ignorar lo que eligio.
 */
test('la frase con Cliente lo nombra y ya no pide Cliente', () => {
  const frase = fraseDeJornadaSinDestino({ id: 3, name: 'DELCO' })

  assert.ok(frase.includes('DELCO'))
  assert.ok(frase.includes(GLOSARIO.espacio.singular.toLowerCase()))
  assert.equal(frase.includes(`ni ${GLOSARIO.cliente.singular.toLowerCase()}`), false)
})

/**
 * Las dos frases se arman con el glosario y no con las palabras escritas a mano, que es lo que hace
 * que un renombre futuro sea un archivo y no una caceria. La prueba compara contra el texto
 * reconstruido desde `GLOSARIO`: si alguien escribe "Proyecto" a mano, esto sigue pasando hoy y
 * falla el dia del renombre — que es exactamente cuando tiene que avisar.
 */
test('las frases se arman con los nombres del glosario', () => {
  const espacio = GLOSARIO.espacio.singular.toLowerCase()
  const cliente = GLOSARIO.cliente.singular.toLowerCase()

  assert.equal(fraseDeJornadaSinDestino(null), `Tu jornada corre sin ${espacio} ni ${cliente} todavía.`)
  assert.equal(
    fraseDeJornadaSinDestino({ id: 3, name: 'DELCO' }),
    `Tu jornada corre para DELCO, sin ${espacio} todavía.`
  )
})

/**
 * Los fallos del Cliente hablan de otra cosa que los de la jornada, y por eso tienen su traductor: su
 * `409` es "no tienes ninguna jornada", al reves que el de abrir, y su `422` es un Cliente que ya no
 * esta y no una Tarea que no encaja.
 */
test('el fallo del Cliente no se confunde con el de abrir la jornada', () => {
  assert.notEqual(mensajeDeFalloDeCliente(409), mensajeDeFalloDeJornada(409, true))
  assert.notEqual(mensajeDeFalloDeCliente(422), mensajeDeFalloDeJornada(422, true))
  assert.ok(mensajeDeFalloDeCliente(422).includes('Cliente'))
})

test('un fallo de red del Cliente se dice como fallo de red', () => {
  assert.equal(mensajeDeFalloDeCliente(0), 'No se pudo contactar al servidor. Revisa la conexión.')
})

test('cualquier otro codigo del Cliente da un mensaje, nunca vacio', () => {
  assert.ok(mensajeDeFalloDeCliente(500).includes('500'))
  assert.notEqual(mensajeDeFalloDeCliente(503), '')
})
