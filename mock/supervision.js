/**
 * La Supervisión diaria, en el mock.
 *
 * Replica el contrato de la API (`docs/contrato-api.md`, «Supervisión diaria»):
 *
 *  - `GET|PUT /clients/{id}/supervisores` y `GET|PUT /staff/{id}/supervision`: la asociación
 *    supervisor ↔ cliente, reemplazada entera. 422 si alguien no existe, está inactivo o su escalón
 *    no llega a `lead`.
 *  - `GET /supervision/supervisores`: los supervisores que quien pregunta puede ver (él mismo, su
 *    descendencia en el árbol, o todos si es administrador).
 *  - `GET /supervision/hoja`, `PUT /supervision/hoja/{fecha}/revisiones` y
 *    `POST /supervision/hoja/{fecha}/firma`, con los mismos 403, 409 y 422.
 *
 * Poda y valida igual que la API a propósito: un mock que dejara escribir en una hoja ajena o
 * firmada, o aceptara un `staff` como supervisor, dejaría pasar una pantalla que se cae recién en
 * producción.
 */

import { ErrorApi } from './consulta.js'
import { CLIENTES, ESPACIOS, PROCESOS, STAFF, SUPERVISORES_DE_CLIENTE } from './datos.js'

const conDatos = (data) => ({ data })

/** Orden de la escalera; supervisa quien llega a `lead`. */
const ORDEN_ESCALON = { staff: 1, lead: 2, director: 3, gerencia: 4 }

/** Tope de la nota de una revisión. */
const LARGO_MAXIMO_NOTA = 500

/** Revisiones por hoja: `fecha|staffId` → Map(taskId → revisión). */
const REVISIONES = new Map()

/** Firmas por hoja: `fecha|staffId` → firma. */
const FIRMAS = new Map()

/** La copia de la semilla, para poder volver a ella en las pruebas. */
const SEMILLA = new Map([...SUPERVISORES_DE_CLIENTE].map(([cliente, ids]) => [cliente, [...ids]]))

/** Vuelve al estado de nacimiento. Solo para las pruebas. */
export function reiniciarSupervision () {
  REVISIONES.clear()
  FIRMAS.clear()
  SUPERVISORES_DE_CLIENTE.clear()

  for (const [cliente, ids] of SEMILLA) SUPERVISORES_DE_CLIENTE.set(cliente, [...ids])
}

/** Si una persona puede supervisar: activa y de `lead` hacia arriba. */
function puedeSupervisar (persona) {
  return persona !== undefined && persona.active && (ORDEN_ESCALON[persona.escalon] ?? 0) >= ORDEN_ESCALON.lead
}

/** Hoy en Santiago, `YYYY-MM-DD`, como la API. */
function hoyEnSantiago () {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())
}

/** Si un texto es una fecha de calendario real `YYYY-MM-DD`. */
function esFecha (valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false

  return new Date(`${valor}T00:00:00Z`).toISOString().slice(0, 10) === valor
}

/** Días entre dos fechas `YYYY-MM-DD` (b − a). */
function diasEntre (a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/** El cliente de una Tarea: `customer` es el propio; `project` es el del Proyecto. */
function clienteDeLaTarea (tarea) {
  if (tarea.rel_type === 'customer') return tarea.rel_id
  if (tarea.rel_type !== 'project') return null

  const espacio = ESPACIOS.find((e) => e.id === tarea.rel_id)

  return espacio !== undefined && espacio.clientid > 0 ? espacio.clientid : null
}

/** Los ids de los clientes que supervisa una persona. */
function clientesDe (staffId) {
  return new Set([...SUPERVISORES_DE_CLIENTE].filter(([, ids]) => ids.includes(staffId)).map(([cliente]) => cliente))
}

/** La clave de una hoja en los almacenes. */
const claveDe = (fecha, staffId) => `${fecha}|${staffId}`

/** Una persona con la forma corta de la hoja. */
function referencia (persona) {
  return { staffid: persona.id, nombre: persona.full_name }
}

/** Una Tarea con la forma del contrato. */
function tareaDeLaHoja (tarea, fecha, revisiones) {
  return {
    id: tarea.id,
    patente: tarea.patente ?? null,
    name: tarea.name,
    status: tarea.status,
    duedate: tarea.due_date ?? null,
    dias_atraso: tarea.due_date ? Math.max(0, diasEntre(tarea.due_date, fecha)) : 0,
    proyecto: tarea.project ?? null,
    asignados: tarea.assignees.map((a) => ({ staffid: a.id, nombre: a.full_name })),
    revision: revisiones.get(tarea.id) ?? null
  }
}

/**
 * Las Tareas de la hoja: con cliente supervisado, no completadas y vencidas a la fecha; más toda
 * Tarea que ya tenga revisión en esta hoja, para que un día pasado no pierda filas.
 */
function tareasDeLaHoja (fecha, staffId) {
  const clientes = clientesDe(staffId)
  const revisiones = REVISIONES.get(claveDe(fecha, staffId)) ?? new Map()

  return PROCESOS.filter((tarea) => {
    const cliente = clienteDeLaTarea(tarea)

    if (cliente === null) return false
    if (revisiones.has(tarea.id)) return true

    return clientes.has(cliente) && tarea.status !== 5 && typeof tarea.due_date === 'string' && tarea.due_date <= fecha
  })
}

/** La hoja entera, agrupada por cliente y ordenada como la API. */
function hojaDe (fecha, supervisor, actual) {
  const revisiones = REVISIONES.get(claveDe(fecha, supervisor.id)) ?? new Map()
  const firma = FIRMAS.get(claveDe(fecha, supervisor.id)) ?? null
  const filas = tareasDeLaHoja(fecha, supervisor.id).map((tarea) => ({
    cliente: clienteDeLaTarea(tarea),
    tarea: tareaDeLaHoja(tarea, fecha, revisiones)
  }))

  const porCliente = new Map()

  for (const { cliente, tarea } of filas) {
    if (!porCliente.has(cliente)) {
      porCliente.set(cliente, { client_id: cliente, company: CLIENTES.find((c) => c.id === cliente)?.company ?? `#${cliente}`, tareas: [] })
    }
    porCliente.get(cliente).tareas.push(tarea)
  }

  const clientes = [...porCliente.values()].sort((a, b) => a.company.localeCompare(b.company))

  for (const cliente of clientes) cliente.tareas.sort((a, b) => (a.duedate ?? '').localeCompare(b.duedate ?? '') || a.id - b.id)

  const tareas = clientes.flatMap((c) => c.tareas)
  const marcadas = tareas.map((t) => t.revision).filter((r) => r !== null)

  return {
    fecha,
    puede_editar: actual.id === supervisor.id && firma === null,
    supervisor: { staffid: supervisor.id, nombre: supervisor.full_name, escalon: supervisor.escalon },
    firma,
    totales: {
      tareas: tareas.length,
      atrasadas: tareas.filter((t) => t.dias_atraso > 0).length,
      revisadas: marcadas.length,
      ok: marcadas.filter((r) => r.estado === 'ok').length,
      no_ok: marcadas.filter((r) => r.estado === 'no_ok').length
    },
    clientes
  }
}

/** La fecha de una ruta o parámetro, validada. */
function fechaValida (valor) {
  if (!esFecha(valor)) throw new ErrorApi(422, 'validation_failed', 'La fecha no es válida.', { fecha: ['invalid'] })

  return valor
}

/** Exige que la hoja (fecha, yo) no esté firmada. */
function exigirAbierta (fecha, actual) {
  if (FIRMAS.has(claveDe(fecha, actual.id))) {
    throw new ErrorApi(409, 'conflict', 'La hoja ya está firmada: no admite más cambios.')
  }
}

/** `PUT /supervision/hoja/{fecha}/revisiones`. */
async function guardarRevision (fecha, actual, cuerpo) {
  exigirAbierta(fecha, actual)

  const datos = await cuerpo()
  const tareaId = Number(datos?.task_id)

  if (!Number.isInteger(tareaId) || !tareasDeLaHoja(fecha, actual.id).some((t) => t.id === tareaId)) {
    throw new ErrorApi(422, 'validation_failed', 'Esa tarea no está en tu hoja de este día.', { task_id: ['invalid'] })
  }

  if (!['ok', 'no_ok', null].includes(datos.estado)) {
    throw new ErrorApi(422, 'validation_failed', 'El estado tiene que ser ok, no_ok o null.', { estado: ['invalid'] })
  }

  const nota = datos.nota === undefined || datos.nota === null ? null : datos.nota

  if (nota !== null && (typeof nota !== 'string' || nota.length > LARGO_MAXIMO_NOTA)) {
    throw new ErrorApi(422, 'validation_failed', `La nota admite hasta ${LARGO_MAXIMO_NOTA} caracteres.`, { nota: ['too_long'] })
  }

  const clave = claveDe(fecha, actual.id)
  const revisiones = REVISIONES.get(clave) ?? new Map()

  REVISIONES.set(clave, revisiones)

  if (datos.estado === null) {
    revisiones.delete(tareaId)

    return { estado: 200, cuerpo: conDatos(null) }
  }

  const revision = {
    estado: datos.estado,
    nota: nota === null || nota.trim() === '' ? null : nota.trim(),
    ...referencia(actual),
    marcado_en: new Date().toISOString()
  }

  revisiones.set(tareaId, revision)

  return { estado: 200, cuerpo: conDatos(revision) }
}

/** `POST /supervision/hoja/{fecha}/firma`. */
function firmar (fecha, actual) {
  exigirAbierta(fecha, actual)

  if (tareasDeLaHoja(fecha, actual.id).length === 0) {
    throw new ErrorApi(422, 'validation_failed', 'No se puede firmar una hoja vacía.', { fecha: ['vacia'] })
  }

  const firma = { ...referencia(actual), firmado_en: new Date().toISOString() }

  FIRMAS.set(claveDe(fecha, actual.id), firma)

  return { estado: 200, cuerpo: conDatos(firma) }
}

/** `GET /supervision/hoja`: la hoja de un día, con la compuerta del árbol. */
function leerHoja (parametros, actual, descendencia) {
  const fecha = parametros.has('fecha') ? fechaValida(parametros.get('fecha')) : hoyEnSantiago()
  const crudo = parametros.get('staff_id')
  const staffId = crudo === null ? actual.id : Number(crudo)
  const supervisor = STAFF.find((s) => s.id === staffId)

  if (supervisor === undefined) throw new ErrorApi(404, 'not_found', `No existe la persona ${crudo}.`)

  if (supervisor.id !== actual.id && !actual.is_admin && !descendencia(actual.id).has(supervisor.id)) {
    throw new ErrorApi(403, 'forbidden', 'Solo ves la hoja propia y la de quienes cuelgan de ti.')
  }

  return { estado: 200, cuerpo: conDatos(hojaDe(fecha, supervisor, actual)) }
}

/** `GET /supervision/supervisores`. */
function supervisoresVisibles (actual, descendencia) {
  const debajo = descendencia(actual.id)
  const filas = STAFF
    .filter((s) => s.id === actual.id || actual.is_admin || debajo.has(s.id))
    .map((s) => ({ staffid: s.id, nombre: s.full_name, escalon: s.escalon, clientes: clientesDe(s.id).size }))
    .filter((s) => s.clientes > 0)
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  return { estado: 200, cuerpo: conDatos(filas) }
}

/** `/supervision/...`. */
async function supervisionRuta ({ metodo, resto, parametros, actual, cuerpo, descendencia }) {
  if (resto[0] === 'supervisores' && resto.length === 1 && metodo === 'GET') return supervisoresVisibles(actual, descendencia)
  if (resto[0] !== 'hoja') throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')
  if (resto.length === 1 && metodo === 'GET') return leerHoja(parametros, actual, descendencia)

  if (resto.length === 3) {
    const fecha = fechaValida(resto[1])

    if (resto[2] === 'revisiones' && metodo === 'PUT') return await guardarRevision(fecha, actual, cuerpo)
    if (resto[2] === 'firma' && metodo === 'POST') return firmar(fecha, actual)
  }

  throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')
}

/** Los supervisores de un cliente, con la forma del contrato. */
function supervisoresDelCliente (clienteId) {
  const ids = SUPERVISORES_DE_CLIENTE.get(clienteId) ?? []

  return STAFF.filter((s) => ids.includes(s.id))
    .map((s) => ({ staffid: s.id, firstname: s.firstname, lastname: s.lastname, escalon: s.escalon }))
}

/** `GET|PUT /clients/{id}/supervisores`. */
async function supervisoresDeClienteRuta ({ metodo, clienteId, actual, cuerpo, exigirPermiso }) {
  if (!CLIENTES.some((c) => c.id === clienteId)) throw new ErrorApi(404, 'not_found', `No existe cliente con id ${clienteId}.`)

  if (metodo === 'PUT') {
    exigirPermiso(actual, 'customers', 'edit')
    const datos = await cuerpo()

    if (!Array.isArray(datos?.staff_ids)) {
      throw new ErrorApi(422, 'validation_failed', 'Falta la lista de supervisores.', { staff_ids: ['required'] })
    }

    const ids = [...new Set(datos.staff_ids.map(Number))]

    if (ids.some((id) => !puedeSupervisar(STAFF.find((s) => s.id === id)))) {
      throw new ErrorApi(422, 'validation_failed', 'Solo pueden supervisar personas activas de escalón lead o superior.', { staff_ids: ['invalid'] })
    }

    SUPERVISORES_DE_CLIENTE.set(clienteId, ids)
  } else if (metodo !== 'GET') {
    throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')
  }

  exigirPermiso(actual, 'customers', 'view')

  return { estado: 200, cuerpo: conDatos(supervisoresDelCliente(clienteId)) }
}

/** `GET|PUT /staff/{id}/supervision`. */
async function supervisionDePersonaRuta ({ metodo, personaId, actual, cuerpo, exigirPermiso }) {
  exigirPermiso(actual, 'staff', 'view')
  const persona = STAFF.find((s) => s.id === personaId)

  if (persona === undefined) throw new ErrorApi(404, 'not_found', `No existe staff con id ${personaId}.`)

  if (metodo === 'PUT') {
    exigirPermiso(actual, 'customers', 'edit')

    if (!puedeSupervisar(persona)) {
      throw new ErrorApi(422, 'validation_failed', 'Esta persona no puede supervisar: su escalón es menor que lead.', { staff_id: ['escalon'] })
    }

    const datos = await cuerpo()

    if (!Array.isArray(datos?.client_ids)) {
      throw new ErrorApi(422, 'validation_failed', 'Falta la lista de clientes.', { client_ids: ['required'] })
    }

    const ids = [...new Set(datos.client_ids.map(Number))]

    if (ids.some((id) => !CLIENTES.some((c) => c.id === id))) {
      throw new ErrorApi(422, 'validation_failed', 'Hay clientes que no existen.', { client_ids: ['unknown'] })
    }

    for (const cliente of CLIENTES) {
      const actuales = (SUPERVISORES_DE_CLIENTE.get(cliente.id) ?? []).filter((id) => id !== persona.id)

      SUPERVISORES_DE_CLIENTE.set(cliente.id, ids.includes(cliente.id) ? [...actuales, persona.id] : actuales)
    }
  } else if (metodo !== 'GET') {
    throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')
  }

  exigirPermiso(actual, 'customers', 'view')
  const suyos = clientesDe(persona.id)

  return {
    estado: 200,
    cuerpo: conDatos(CLIENTES.filter((c) => suyos.has(c.id)).map((c) => ({ client_id: c.id, company: c.company })))
  }
}

/**
 * Atiende las rutas de la Supervisión diaria, o devuelve `null` si la petición no es suya.
 *
 * @param {object} contexto `metodo`, `recurso`, `resto`, `parametros`, `cuerpo` (thunk), `actual`,
 *   `descendencia(staffId) → Set` y `exigirPermiso(staff, recurso, accion)` del servidor
 * @returns {Promise<{estado: number, cuerpo: object} | null>}
 */
export async function supervisionDelEquipo (contexto) {
  const { recurso, resto } = contexto

  if (recurso === 'supervision') return await supervisionRuta(contexto)

  if (recurso === 'clients' && resto[1] === 'supervisores' && resto.length === 2) {
    return await supervisoresDeClienteRuta({ ...contexto, clienteId: Number(resto[0]) })
  }

  if (recurso === 'staff' && resto[1] === 'supervision' && resto.length === 2) {
    return await supervisionDePersonaRuta({ ...contexto, personaId: Number(resto[0]) })
  }

  return null
}
