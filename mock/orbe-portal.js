/**
 * Thinking Orb del portal en el mock (contrato O1): la opcion `wiwo_portal_ia_chat` y las rutas
 * `/portal/ia/*` de la sesion de contacto.
 *
 * Vive aparte de `servidor.js` para no sumar otro bloque a un archivo que tocan varios frentes a la
 * vez; `servidor.js` solo lo cablea. Lo que necesita de alla (el stream, la lista de Proyectos y de
 * tareas) le llega por parametro y no por import, porque `servidor.js` es el que arranca el mock.
 *
 * Lo que se replica de la API real, y por que:
 *   - La opcion nace apagada, igual que la migracion 0930: un mock que la trae encendida esconde el
 *     caso "sin orbe", que es el de produccion hasta que alguien lo prenda.
 *   - `capacidades` nunca contesta 404: el portal lo pregunta en cada navegacion para decidir si
 *     monta el orbe, y un 404 ahi seria ruido en todos los logs.
 *   - El chat apagado es 404; un Proyecto ajeno es 404 (no 403: no se confirma que exista).
 *   - El SSE es el mismo del chat del staff, sin `propuesta` ni `pregunta` jamas.
 *   - Tope por contacto y por hora: pasado, 429.
 */

import { ErrorApi } from './consulta.js'

/** La clave de `tbloptions` del interruptor. */
export const OPCION_ORBE_PORTAL = 'wiwo_portal_ia_chat'

/** Mensajes por contacto y por hora antes del 429. Mismo orden de magnitud que la API. */
export const TOPE_MENSAJES_HORA = 40

/** Una hora, en milisegundos. */
const HORA_MS = 60 * 60 * 1000

/** Estado del interruptor. Nace apagado, como la migracion. */
let encendido = false

/** Hilos por `contacto:proyecto`, con `global` para el hilo sin Proyecto. */
const HILOS = new Map()

/** Marcas de tiempo de los mensajes de cada contacto, para el tope por hora. */
const ENVIOS = new Map()

/**
 * La opcion tal como la publica `GET /settings` en `editable`.
 *
 * @returns {Record<string, {group: string, type: string, value: boolean}>}
 */
export function opcionDelOrbePortal () {
  return { [OPCION_ORBE_PORTAL]: { group: 'ia', type: 'bool', value: encendido } }
}

/**
 * `PATCH /settings` del mock: solo escribe el interruptor del orbe del portal.
 *
 * Una clave que no sea esa es 422 `no_editable` y no escribe nada, como el PATCH real, que es
 * atomico: el mock no conoce el resto de las opciones y aceptarlas en silencio seria mentir.
 *
 * @param {Record<string, unknown>} cambios el cuerpo del PATCH
 * @throws {ErrorApi} 422 si trae una clave ajena o un valor que no es booleano
 */
export function escribirAjustesDelOrbePortal (cambios) {
  const entrada = cambios !== null && typeof cambios === 'object' ? cambios : {}
  const ajenas = Object.keys(entrada).filter((clave) => clave !== OPCION_ORBE_PORTAL)

  if (ajenas.length > 0) {
    throw new ErrorApi(422, 'validation_failed', 'Hay ajustes que no se pueden escribir.',
      Object.fromEntries(ajenas.map((clave) => [clave, ['no_editable']])))
  }

  if (!(OPCION_ORBE_PORTAL in entrada)) return

  const valor = entrada[OPCION_ORBE_PORTAL]
  const booleano = valor === true || valor === 1 || valor === '1' ? true : valor === false || valor === 0 || valor === '0' ? false : null

  if (booleano === null) {
    throw new ErrorApi(422, 'validation_failed', 'Hay ajustes que no se pueden escribir.', { [OPCION_ORBE_PORTAL]: ['invalid'] })
  }

  encendido = booleano
}

/**
 * Vuelve el mock al estado de fabrica. Solo para las pruebas.
 */
export function reiniciarOrbePortal () {
  encendido = false
  HILOS.clear()
  ENVIOS.clear()
}

/**
 * El Proyecto pedido por `?proyecto_id=`, o `null` para el hilo general.
 *
 * @param {URLSearchParams} parametros
 * @param {object[]} suyos los Proyectos del contacto
 * @returns {object|null}
 * @throws {ErrorApi} 404 si el id no es un entero positivo o no es de este contacto
 */
function proyectoPedido (parametros, suyos) {
  const crudo = parametros.get('proyecto_id')

  return proyectoPorId(crudo === null || crudo === '' ? null : crudo, suyos)
}

/**
 * Resuelve un id de Proyecto contra los del contacto.
 *
 * @param {unknown} crudo el id tal como vino, o `null`
 * @param {object[]} suyos los Proyectos del contacto
 * @returns {object|null}
 * @throws {ErrorApi} 404 si no es un id valido o no es de este contacto
 */
function proyectoPorId (crudo, suyos) {
  if (crudo === null || crudo === undefined) return null

  const id = Number(crudo)
  const proyecto = Number.isSafeInteger(id) && id > 0 ? suyos.find((p) => p.id === id) : undefined

  if (proyecto === undefined) throw new ErrorApi(404, 'not_found', 'Proyecto inexistente.')

  return proyecto
}

/**
 * Registra un envio y dice si el contacto ya paso el tope de la hora.
 *
 * @param {number} contactoId
 * @param {number} ahora milisegundos
 * @returns {boolean} `true` si este envio pasa el tope y no se registra
 */
function pasaElTope (contactoId, ahora) {
  const recientes = (ENVIOS.get(contactoId) ?? []).filter((marca) => ahora - marca < HORA_MS)

  if (recientes.length >= TOPE_MENSAJES_HORA) {
    ENVIOS.set(contactoId, recientes)

    return true
  }

  ENVIOS.set(contactoId, [...recientes, ahora])

  return false
}

/**
 * La respuesta del asistente, armada con los fixtures: nombra lo que el contacto ve y lo cita.
 *
 * @param {object|null} proyecto el Proyecto de la conversacion, o `null`
 * @param {object[]} suyos los Proyectos del contacto
 * @param {(espacioId: number) => object[]} tareasVisibles tareas abiertas y visibles al cliente
 * @returns {{texto: string, citas: object[]}}
 */
function respuestaDelOrbe (proyecto, suyos, tareasVisibles) {
  if (proyecto === null) {
    const citas = suyos.slice(0, 3).map((p) => ({ tipo: 'espacio', id: p.id, titulo: p.name }))
    const lista = citas.map((c, i) => `${c.titulo} [${i + 1}]`).join(', ')

    return {
      texto: citas.length === 0
        ? 'Todavía no tienes proyectos compartidos en el portal.'
        : `Tienes ${suyos.length} proyectos en el portal: ${lista}. Pregúntame por uno para ver el detalle.`,
      citas
    }
  }

  const abiertas = tareasVisibles(proyecto.id)
  const citas = [
    { tipo: 'espacio', id: proyecto.id, titulo: proyecto.name },
    ...abiertas.slice(0, 2).map((t) => ({ tipo: 'tarea', id: t.id, titulo: t.name, espacio_id: proyecto.id }))
  ]
  const tareas = citas.slice(1).map((c, i) => `${c.titulo} [${i + 2}]`).join(' y ')

  return {
    texto: `En ${proyecto.name} [1] hay ${abiertas.length} tareas abiertas que puedes ver.`
      + (tareas === '' ? '' : ` Las más próximas son ${tareas}.`),
    citas
  }
}

/**
 * `/portal/ia/*` con la sesion de contacto.
 *
 * @param {string} metodo
 * @param {string[]} resto segmentos despues de `portal/ia`
 * @param {URLSearchParams} parametros
 * @param {object} contacto el contacto de la sesion
 * @param {() => Promise<object>} cuerpo thunk del cuerpo: hay que `await cuerpo()`
 * @param {import('node:http').IncomingMessage} peticion
 * @param {{
 *   proyectosDelContacto: (contacto: object) => object[],
 *   tareasVisibles: (espacioId: number) => object[],
 *   aceptaStream: (peticion: object) => boolean,
 *   transmitirSSE: (respuesta: object, texto: string, opciones: object) => void
 * }} dependencias lo que el mock principal presta
 * @returns {Promise<object>} la respuesta en la forma de `resolverRuta`
 * @throws {ErrorApi} 404, 422 o 429 segun el contrato
 */
export async function orbePortalRuta (metodo, resto, parametros, contacto, cuerpo, peticion, dependencias) {
  const [seccion, ...sub] = resto

  if (!contacto.email_verified) {
    throw new ErrorApi(403, 'email_unverified', 'Tenés que verificar tu correo antes de continuar.')
  }

  if (seccion === 'capacidades' && sub.length === 0 && metodo === 'GET') {
    return { estado: 200, cuerpo: { data: { habilitado: encendido } } }
  }

  if (seccion !== 'chat' || sub.length > 0) throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')
  if (!encendido) throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')

  const suyos = dependencias.proyectosDelContacto(contacto)

  if (metodo === 'GET' || metodo === 'DELETE') {
    const proyecto = proyectoPedido(parametros, suyos)
    const clave = `${contacto.id}:${proyecto?.id ?? 'global'}`

    if (metodo === 'DELETE') {
      HILOS.delete(clave)

      return { estado: 204, cuerpo: null }
    }

    return { estado: 200, cuerpo: { data: { mensajes: HILOS.get(clave) ?? [], modo: 'cache' } } }
  }

  if (metodo !== 'POST') throw new ErrorApi(404, 'not_found', 'Método no disponible en el chat.')

  const datos = await cuerpo()
  const texto = String(datos?.mensaje ?? datos?.pregunta ?? '').trim()

  if (texto === '') {
    throw new ErrorApi(422, 'validation_failed', 'Falta el mensaje.', { mensaje: ['requerido'] })
  }

  const proyecto = proyectoPorId(datos?.proyecto_id ?? null, suyos)

  if (pasaElTope(contacto.id, Date.now())) {
    throw new ErrorApi(429, 'rate_limited', 'Hiciste muchas preguntas seguidas. Prueba de nuevo en un rato.')
  }

  const clave = `${contacto.id}:${proyecto?.id ?? 'global'}`
  const hilo = HILOS.get(clave) ?? []
  const falla = parametros.get('falla') === '1'
  const respuesta = respuestaDelOrbe(proyecto, suyos, dependencias.tareasVisibles)

  hilo.push({ rol: 'usuario', texto })
  if (!falla) hilo.push({ rol: 'asistente', texto: respuesta.texto, citas: respuesta.citas })
  HILOS.set(clave, hilo)

  const fin = {
    generado_en: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    regeneracion: null,
    uso: { entrada: 1200, salida: [...respuesta.texto].length }
  }

  if (!dependencias.aceptaStream(peticion)) {
    return { estado: 200, cuerpo: { data: { texto: respuesta.texto, citas: respuesta.citas, ...fin } } }
  }

  return {
    transmitir: (salida) => dependencias.transmitirSSE(salida, respuesta.texto, { citas: respuesta.citas, fin, falla })
  }
}
