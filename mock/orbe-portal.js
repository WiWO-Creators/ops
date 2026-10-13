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
 *   - El SSE es el mismo del chat del staff. `pregunta` no existe nunca; `propuesta` solo aparece si el
 *     cliente del contacto tiene encendida la creacion de Tareas (`puede_proponer_tareas`).
 *   - Tope por contacto y por hora: pasado, 429.
 *
 * Las propuestas calcan a las del staff (`IA\HerramientasDeEscritura`): en el stream solo se guarda la
 * propuesta, con el resumen escrito por el servidor y los argumentos congelados; crear la Tarea ocurre
 * en otra peticion, `POST /portal/ia/acciones/{id}`, con una decision humana y revalidando todo. Una
 * propuesta es de UN contacto: otro contacto recibe 404, no 403. Caduca a las 24 horas (409).
 */

import { ErrorApi } from './consulta.js'
import { validarAlta } from './tareas-del-portal.js'

/** La clave de `tbloptions` del interruptor. */
export const OPCION_ORBE_PORTAL = 'wiwo_portal_ia_chat'

/** Mensajes por contacto y por hora antes del 429. Mismo orden de magnitud que la API. */
export const TOPE_MENSAJES_HORA = 40

/** Una hora, en milisegundos. */
const HORA_MS = 60 * 60 * 1000

/** Cuanto vive una propuesta sin decidir, como el default de la API. */
const VIDA_PROPUESTA_MS = 24 * HORA_MS

/** Estado del interruptor. Nace apagado, como la migracion. */
let encendido = false

/** Las propuestas del orbe del portal por id (`tblapi_ia_portal_acciones`). */
const ACCIONES = new Map()

/** Siguiente id de propuesta. Arranca alto para no confundirse con los ids del orbe del equipo. */
let siguienteAccion = 7001

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
  ACCIONES.clear()
  siguienteAccion = 7001
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

/** El pedido de crear una Tarea: «crea una tarea para revisar el brief», «nueva tarea: ...». */
const PIDE_TAREA = /\b(?:cre[ao]r?|crea|agrega|agregar|a[ñn]ade|a[ñn]adir|nueva)\b[^.?!]*\btarea\b/i

/**
 * El nombre de la Tarea que pidio la persona: lo que sigue a «tarea para/de/sobre».
 *
 * @param {string} texto el mensaje
 * @returns {string}
 */
function nombreDePedido (texto) {
  const resto = texto.replace(/^[\s\S]*?\btarea\b\s*(?:para|de|sobre|que|:)?\s*/i, '').replace(/[.!?\s]+$/, '').trim()

  if (resto === '') return 'Nueva tarea'

  return resto.charAt(0).toUpperCase() + resto.slice(1, 150)
}

/**
 * Fecha ISO `YYYY-MM-DD` a `DD/MM/AAAA`, para el detalle de la tarjeta.
 *
 * @param {string} iso
 * @returns {string}
 */
function fechaLegible (iso) {
  const [anio, mes, dia] = iso.split('-')

  return `${dia}/${mes}/${anio}`
}

/**
 * La propuesta como la publica la API: sin los argumentos congelados ni el dueño.
 *
 * Pasadas las 24 horas la lee como `expirada`, que es lo que hace la API al leer.
 *
 * @param {object} accion
 * @param {number} ahora milisegundos
 * @returns {object}
 */
function presentarAccion (accion, ahora = Date.now()) {
  if (accion.estado === 'pendiente' && ahora >= Date.parse(accion.expira_en)) accion.estado = 'expirada'

  const { id, herramienta, resumen, detalle, supuestos, estado, resultado, expira_en: expiraEn } = accion

  return { id, herramienta, resumen, detalle, supuestos, estado, resultado, expira_en: expiraEn }
}

/**
 * Prepara la propuesta de crear una Tarea, o `null` si el mensaje no la pide o no se puede.
 *
 * Valida con la MISMA regla que el alta del portal y no escribe nada: lo que se congela son los
 * argumentos ya normalizados. Si el Proyecto exige vencimiento y la persona no lo dio, el servidor
 * completa uno a una semana y lo dice en `supuestos`, que es donde la tarjeta lo muestra aparte.
 *
 * @param {string} texto el mensaje de la persona
 * @param {object|null} proyecto el Proyecto de la conversacion, o `null` en la general
 * @param {object[]} suyos los Proyectos del contacto
 * @param {object} contacto
 * @param {object} dependencias
 * @returns {object|null} la propuesta guardada, o `null`
 */
function proponerTarea (texto, proyecto, suyos, contacto, dependencias) {
  if (!PIDE_TAREA.test(texto) || !dependencias.puedeProponerTareas(contacto)) return null

  const destino = proyecto ?? suyos.find((p) => dependencias.altaDelProyecto(contacto, p) !== null)
  const alta = destino === undefined || destino === null ? null : dependencias.altaDelProyecto(contacto, destino)

  if (alta === null) return null

  const datos = { name: nombreDePedido(texto) }
  const supuestos = []

  if (alta.vencimiento_requerido) {
    datos.due_date = new Date(Date.now() + 7 * 24 * HORA_MS).toISOString().slice(0, 10)
    supuestos.push(`Vence el ${fechaLegible(datos.due_date)}: no indicaste fecha y tu empresa la exige.`)
  }

  let normalizada

  try {
    normalizada = validarAlta(datos, alta)
  } catch (error) {
    if (error instanceof ErrorApi) return null
    throw error
  }

  const accion = {
    id: siguienteAccion++,
    contactid: contacto.id,
    proyecto_id: destino.id,
    args: datos,
    herramienta: 'proponer_tarea',
    resumen: `Crear la Tarea «${normalizada.name}» en el Proyecto «${destino.name}»`,
    detalle: normalizada.due_date === null ? ['Sin fecha de vencimiento'] : [`Vence: ${fechaLegible(normalizada.due_date)}`],
    supuestos,
    estado: 'pendiente',
    resultado: null,
    expira_en: new Date(Date.now() + VIDA_PROPUESTA_MS).toISOString().replace(/\.\d{3}Z$/, 'Z')
  }

  ACCIONES.set(accion.id, accion)

  return accion
}

/**
 * `POST /portal/ia/acciones/{id}`: confirmar o rechazar una propuesta.
 *
 * @param {string} id el segmento de la ruta
 * @param {unknown} datos el cuerpo `{ decision }`
 * @param {object} contacto el contacto de la sesion
 * @param {object[]} suyos sus Proyectos
 * @param {object} dependencias
 * @returns {{estado: number, cuerpo: object}}
 * @throws {ErrorApi} 404 (ajena o inexistente), 409 con codigo `ya_resuelta` o `expirada`, 422 (decision
 *         invalida o la revalidacion fallo), 429 (tope; la propuesta sigue pendiente)
 */
function resolverPropuesta (id, datos, contacto, suyos, dependencias) {
  const accion = ACCIONES.get(Number(id))

  if (accion === undefined || accion.contactid !== contacto.id) throw new ErrorApi(404, 'not_found', 'Acción inexistente.')

  const decision = datos?.decision

  if (decision !== 'confirmar' && decision !== 'rechazar') {
    throw new ErrorApi(422, 'validation_failed', 'Falta la decisión.', { decision: ['no_valido'] })
  }

  if (presentarAccion(accion).estado === 'expirada') {
    throw new ErrorApi(409, 'expirada', 'La propuesta caducó. Pídela de nuevo.')
  }

  if (accion.estado !== 'pendiente') {
    throw new ErrorApi(409, 'ya_resuelta', 'Esta propuesta ya se resolvió.')
  }

  if (decision === 'rechazar') {
    accion.estado = 'rechazada'

    return { estado: 200, cuerpo: { data: { id: accion.id, estado: 'rechazada' } } }
  }

  const proyecto = suyos.find((p) => p.id === accion.proyecto_id)

  try {
    if (proyecto === undefined) throw new ErrorApi(404, 'not_found', 'Proyecto inexistente.')

    const { proceso } = dependencias.crearTarea(contacto, proyecto, accion.args)

    accion.estado = 'ejecutada'
    accion.resultado = `Tarea creada: ${proceso.patente}`

    return { estado: 200, cuerpo: { data: { id: accion.id, estado: 'ejecutada', tarea_id: proceso.id } } }
  } catch (error) {
    // Un 429 no resuelve nada: el tope se levanta con el tiempo y la propuesta sigue pendiente.
    if (error instanceof ErrorApi && error.estado !== 429) {
      accion.estado = 'fallida'
      accion.resultado = error.message
    }

    throw error
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
 *   puedeProponerTareas: (contacto: object) => boolean,
 *   altaDelProyecto: (contacto: object, proyecto: object) => object | null,
 *   crearTarea: (contacto: object, proyecto: object, datos: object) => { estado: number, proceso: object },
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
    return {
      estado: 200,
      cuerpo: { data: { habilitado: encendido, puede_proponer_tareas: encendido && dependencias.puedeProponerTareas(contacto) } }
    }
  }

  if (seccion === 'acciones' && sub.length === 1 && metodo === 'POST') {
    if (!encendido) throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')

    return resolverPropuesta(sub[0], await cuerpo(), contacto, dependencias.proyectosDelContacto(contacto), dependencias)
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

    // Las propuestas se leen frescas en cada GET: la tarjeta de un mensaje viejo ya puede estar
    // resuelta o caducada, y el hilo guarda solo el id.
    const mensajes = (HILOS.get(clave) ?? []).map(({ propuestas, ...mensaje }) => propuestas === undefined
      ? mensaje
      : { ...mensaje, acciones: propuestas.map((accion) => presentarAccion(accion)) })

    return { estado: 200, cuerpo: { data: { mensajes, modo: 'cache' } } }
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
  const propuesta = falla ? null : proponerTarea(texto, proyecto, suyos, contacto, dependencias)
  const respuesta = propuesta === null
    ? respuestaDelOrbe(proyecto, suyos, dependencias.tareasVisibles)
    : {
        texto: 'Preparé esta tarea para que la revises. No se crea hasta que la confirmes.',
        citas: [{ tipo: 'espacio', id: propuesta.proyecto_id, titulo: suyos.find((p) => p.id === propuesta.proyecto_id).name }]
      }
  const propuestas = propuesta === null ? [] : [presentarAccion(propuesta)]

  hilo.push({ rol: 'usuario', texto })
  if (!falla) {
    hilo.push({
      rol: 'asistente',
      texto: respuesta.texto,
      citas: respuesta.citas,
      ...(propuesta === null ? {} : { propuestas: [propuesta] })
    })
  }
  HILOS.set(clave, hilo)

  const fin = {
    generado_en: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    regeneracion: null,
    uso: { entrada: 1200, salida: [...respuesta.texto].length }
  }

  if (!dependencias.aceptaStream(peticion)) {
    return { estado: 200, cuerpo: { data: { texto: respuesta.texto, citas: respuesta.citas, acciones: propuestas, ...fin } } }
  }

  return {
    transmitir: (salida) => dependencias.transmitirSSE(salida, respuesta.texto, { citas: respuesta.citas, fin, falla, propuestas })
  }
}
