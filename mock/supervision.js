/**
 * La Supervisión diaria, en el mock.
 *
 * Replica el contrato de la API (`docs/contrato-api.md`, «Supervisión diaria», v2 por jerarquía):
 *
 *  - `GET|PUT /clients/{id}/supervisores` y `GET|PUT /staff/{id}/supervision`: la asociación
 *    supervisor ↔ cliente EXTRA, reemplazada entera. 422 si alguien no existe, está inactivo o su
 *    escalón no llega a `lead`.
 *  - Los clientes de un supervisor son esa asociación **más** los clientes donde es Focal.
 *  - Supervisor = escalón `lead` o superior **y** (algún cliente, o alguien a cargo en el árbol).
 *  - `GET /supervision/supervisores`: los supervisores que quien pregunta puede ver (él mismo, su
 *    descendencia en el árbol, o todos si es administrador).
 *  - `GET /supervision/hoja`, `PUT /supervision/hoja/{fecha}/revisiones`,
 *    `POST /supervision/hoja/{fecha}/firma` y `POST /supervision/hoja/{fecha}/confirmacion`, con los
 *    mismos 403, 409 y 422.
 *  - `GET /supervision/equipo`: las hojas no vacías de la descendencia de quien pregunta.
 *
 * Poda y valida igual que la API a propósito: un mock que dejara escribir en una hoja ajena o
 * firmada, confirmar la propia o aceptar un `staff` como supervisor, dejaría pasar una pantalla que
 * se cae recién en producción.
 */

import { ErrorApi } from './consulta.js'
import { CLIENTES, ESPACIOS, PROCESOS, STAFF, SUPERVISORES_DE_CLIENTE } from './datos.js'

const conDatos = (data) => ({ data })

/** Orden de la escalera; supervisa quien llega a `lead`. */
const ORDEN_ESCALON = { staff: 1, lead: 2, director: 3, gerencia: 4 }

/** Tope de la nota de una revisión y de una devolución. */
const LARGO_MAXIMO_NOTA = 500

/** El status de una Tarea completada. */
const ESTADO_COMPLETADA = 5

/** Zona del negocio: la de `datefinished` en la base y la de "hoy". */
const ZONA = 'America/Santiago'

/** Nombre del grupo de las Tareas que no cuelgan de ningún cliente. */
const SIN_CLIENTE = 'Sin cliente'

/** Revisiones por hoja: `fecha|staffId` → Map(taskId → revisión). */
const REVISIONES = new Map()

/** Firmas por hoja: `fecha|staffId` → firma. */
const FIRMAS = new Map()

/** Confirmaciones o devoluciones por hoja: `fecha|staffId` → confirmación. */
const CONFIRMACIONES = new Map()

/** La copia de la semilla, para poder volver a ella en las pruebas. */
const SEMILLA = new Map([...SUPERVISORES_DE_CLIENTE].map(([cliente, ids]) => [cliente, [...ids]]))

/** Vuelve al estado de nacimiento. Solo para las pruebas. */
export function reiniciarSupervision () {
  REVISIONES.clear()
  FIRMAS.clear()
  CONFIRMACIONES.clear()
  SUPERVISORES_DE_CLIENTE.clear()

  for (const [cliente, ids] of SEMILLA) SUPERVISORES_DE_CLIENTE.set(cliente, [...ids])
}

/** Si el escalón de una persona llega a `lead`. */
function alcanzaLead (persona) {
  return persona !== undefined && (ORDEN_ESCALON[persona.escalon] ?? 0) >= ORDEN_ESCALON.lead
}

/** Si una persona puede figurar como supervisor de un cliente: activa y de `lead` hacia arriba. */
function puedeSupervisar (persona) {
  return persona !== undefined && persona.active && alcanzaLead(persona)
}

/** El instante en Santiago con la forma `YYYY-MM-DD HH:MM:SS` de `datefinished`. */
function enSantiago (instante) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(instante)
  const parte = (tipo) => partes.find((p) => p.type === tipo)?.value ?? '00'

  return `${parte('year')}-${parte('month')}-${parte('day')} ${parte('hour')}:${parte('minute')}:${parte('second')}`
}

/** Hoy en Santiago, `YYYY-MM-DD`, como la API. */
function hoyEnSantiago () {
  return enSantiago(new Date()).slice(0, 10)
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

/** Los ids de los clientes asociados EXTRA de una persona (la tabla propia de supervisión). */
function clientesAsociadosDe (staffId) {
  return new Set([...SUPERVISORES_DE_CLIENTE].filter(([, ids]) => ids.includes(staffId)).map(([cliente]) => cliente))
}

/**
 * Los clientes de un supervisor para la hoja: los asociados más aquellos donde es Focal.
 *
 * @param {number} staffId el supervisor
 * @param {object} arbol `{ descendencia, focalesDe }` del servidor
 * @returns {Set<number>}
 */
function clientesDe (staffId, arbol) {
  const vivos = new Set(CLIENTES.map((c) => c.id))

  return new Set([...clientesAsociadosDe(staffId), ...arbol.focalesDe(staffId)].filter((id) => vivos.has(id)))
}

/** Si una persona tiene hoja: `lead` o superior y con clientes o gente a cargo. */
function esSupervisor (persona, arbol) {
  if (!alcanzaLead(persona)) return false

  return clientesDe(persona.id, arbol).size > 0 || arbol.descendencia(persona.id).size > 0
}

/** La clave de una hoja en los almacenes. */
const claveDe = (fecha, staffId) => `${fecha}|${staffId}`

/** Una persona con la forma corta de la hoja. */
function referencia (persona) {
  return { staffid: persona.id, nombre: persona.full_name }
}

/** Si `jefeId` está sobre `staffId` en el árbol (`Jerarquia::estaSobre`). */
function estaSobre (jefeId, staffId, arbol) {
  return jefeId !== staffId && arbol.descendencia(jefeId).has(staffId)
}

/**
 * El universo y la regla de entrada de la hoja (fecha, supervisor), con el origen de cada Tarea.
 *
 * Universo: Tareas de los clientes del supervisor ∪ Tareas con algún asignado en su descendencia.
 * Entra la que vence ese día (completada o no), la abierta atrasada, la completada ese día y la que
 * ya tiene revisión suya en esta hoja —esta última aunque haya salido del universo, con `origen: []`—.
 *
 * @returns {{tarea: object, origen: string[]}[]}
 */
function tareasDeLaHoja (fecha, supervisor, arbol) {
  if (!esSupervisor(supervisor, arbol)) return []

  const clientes = clientesDe(supervisor.id, arbol)
  const equipo = arbol.descendencia(supervisor.id)
  const revisiones = REVISIONES.get(claveDe(fecha, supervisor.id)) ?? new Map()
  const filas = []

  for (const tarea of PROCESOS) {
    const cliente = clienteDeLaTarea(tarea)
    const origen = []

    if (cliente !== null && clientes.has(cliente)) origen.push('cliente')
    if (tarea.assignees.some((a) => a.id !== supervisor.id && equipo.has(a.id))) origen.push('equipo')

    // Con revisión de esta hoja entra siempre, aunque ya haya salido del universo: ahí viaja con
    // `origen: []`, igual que en la API.
    if (revisiones.has(tarea.id) || (origen.length > 0 && entraEnLaHoja(tarea, fecha))) filas.push({ tarea, origen })
  }

  return filas
}

/** Las reglas (a), (b) y (c) del contrato sobre una Tarea del universo. */
function entraEnLaHoja (tarea, fecha) {
  const vence = typeof tarea.due_date === 'string' ? tarea.due_date : null
  const completada = tarea.status === ESTADO_COMPLETADA

  if (vence === fecha) return true
  if (!completada && vence !== null && vence < fecha) return true

  return completada && tarea.date_finished !== null && tarea.date_finished !== undefined &&
    enSantiago(new Date(tarea.date_finished)).slice(0, 10) === fecha
}

/** Las revisiones de esa fecha hechas por supervisores de la descendencia del supervisor. */
function revisionesDelEquipo (tareaId, fecha, supervisor, arbol) {
  const salida = []

  for (const staffId of arbol.descendencia(supervisor.id)) {
    const revision = REVISIONES.get(claveDe(fecha, staffId))?.get(tareaId)

    if (revision !== undefined) {
      salida.push({ staffid: revision.staffid, nombre: revision.nombre, estado: revision.estado, nota: revision.nota })
    }
  }

  return salida.sort((a, b) => a.nombre.localeCompare(b.nombre))
}

/** Una Tarea con la forma del contrato. */
function tareaDeLaHoja ({ tarea, origen }, fecha, supervisor, arbol) {
  const completada = tarea.status === ESTADO_COMPLETADA
  const revisiones = REVISIONES.get(claveDe(fecha, supervisor.id)) ?? new Map()

  return {
    id: tarea.id,
    patente: tarea.patente ?? null,
    name: tarea.name,
    status: tarea.status,
    duedate: tarea.due_date ?? null,
    dias_atraso: completada || !tarea.due_date ? 0 : Math.max(0, diasEntre(tarea.due_date, fecha)),
    completada,
    completada_en: completada && tarea.date_finished ? enSantiago(new Date(tarea.date_finished)) : null,
    origen,
    proyecto: tarea.project ?? null,
    asignados: tarea.assignees.map((a) => ({ staffid: a.id, nombre: a.full_name })),
    revision: revisiones.get(tarea.id) ?? null,
    revisiones_equipo: revisionesDelEquipo(tarea.id, fecha, supervisor, arbol)
  }
}

/** Las Tareas agrupadas por cliente y ordenadas como la API; "Sin cliente" al final. */
function agruparPorCliente (filas, fecha, supervisor, arbol) {
  const porCliente = new Map()

  for (const fila of filas) {
    const cliente = clienteDeLaTarea(fila.tarea)

    if (!porCliente.has(cliente)) {
      const company = cliente === null ? SIN_CLIENTE : CLIENTES.find((c) => c.id === cliente)?.company ?? `#${cliente}`

      porCliente.set(cliente, { client_id: cliente, company, tareas: [] })
    }
    porCliente.get(cliente).tareas.push(tareaDeLaHoja(fila, fecha, supervisor, arbol))
  }

  const clientes = [...porCliente.values()].sort((a, b) => {
    if ((a.client_id === null) !== (b.client_id === null)) return a.client_id === null ? 1 : -1

    return a.company.localeCompare(b.company)
  })

  for (const cliente of clientes) cliente.tareas.sort((a, b) => (a.duedate ?? '').localeCompare(b.duedate ?? '') || a.id - b.id)

  return clientes
}

/** Los totales de una hoja a partir de sus Tareas. */
function totalesDe (tareas) {
  const marcadas = tareas.map((t) => t.revision).filter((r) => r !== null)

  return {
    tareas: tareas.length,
    atrasadas: tareas.filter((t) => t.dias_atraso > 0).length,
    completadas: tareas.filter((t) => t.completada).length,
    revisadas: marcadas.length,
    ok: marcadas.filter((r) => r.estado === 'ok').length,
    no_ok: marcadas.filter((r) => r.estado === 'no_ok').length
  }
}

/** La hoja entera, con su firma, su confirmación y lo que quien mira puede hacer con ella. */
function hojaDe (fecha, supervisor, actual, arbol) {
  const clave = claveDe(fecha, supervisor.id)
  const firma = FIRMAS.get(clave) ?? null
  const confirmacion = CONFIRMACIONES.get(clave) ?? null
  const clientes = agruparPorCliente(tareasDeLaHoja(fecha, supervisor, arbol), fecha, supervisor, arbol)
  const puedeMirarComoJefe = actual.is_admin || estaSobre(actual.id, supervisor.id, arbol)

  return {
    fecha,
    puede_editar: actual.id === supervisor.id && firma === null,
    puede_confirmar: puedeMirarComoJefe && actual.id !== supervisor.id && firma !== null && confirmacion?.estado !== 'confirmada',
    supervisor: { staffid: supervisor.id, nombre: supervisor.full_name, escalon: supervisor.escalon },
    firma,
    confirmacion,
    totales: totalesDe(clientes.flatMap((c) => c.tareas)),
    clientes
  }
}

/** La fecha de una ruta o parámetro, validada. */
function fechaValida (valor) {
  if (!esFecha(valor)) throw new ErrorApi(422, 'validation_failed', 'La fecha no es válida.', { fecha: ['invalid'] })

  return valor
}

/** La fecha de `?fecha=`, u hoy si no vino. */
function fechaDeLaConsulta (parametros) {
  return parametros.has('fecha') ? fechaValida(parametros.get('fecha')) : hoyEnSantiago()
}

/** Exige que la hoja (fecha, yo) no esté firmada. */
function exigirAbierta (fecha, actual) {
  if (FIRMAS.has(claveDe(fecha, actual.id))) {
    throw new ErrorApi(409, 'conflict', 'La hoja ya está firmada: no admite más cambios.')
  }
}

/** Una nota opcional validada: recortada, `null` si quedó vacía, 422 si pasa el tope. */
function notaValida (valor) {
  if (valor === undefined || valor === null) return null

  if (typeof valor !== 'string' || valor.length > LARGO_MAXIMO_NOTA) {
    throw new ErrorApi(422, 'validation_failed', `La nota admite hasta ${LARGO_MAXIMO_NOTA} caracteres.`, { nota: ['too_long'] })
  }

  return valor.trim() === '' ? null : valor.trim()
}

/** `PUT /supervision/hoja/{fecha}/revisiones`. */
async function guardarRevision (fecha, actual, cuerpo, arbol) {
  exigirAbierta(fecha, actual)

  const datos = await cuerpo()
  const tareaId = Number(datos?.task_id)

  if (!Number.isInteger(tareaId) || !tareasDeLaHoja(fecha, actual, arbol).some((f) => f.tarea.id === tareaId)) {
    throw new ErrorApi(422, 'validation_failed', 'Esa tarea no está en tu hoja de este día.', { task_id: ['invalid'] })
  }

  if (!['ok', 'no_ok', null].includes(datos.estado)) {
    throw new ErrorApi(422, 'validation_failed', 'El estado tiene que ser ok, no_ok o null.', { estado: ['invalid'] })
  }

  const nota = notaValida(datos.nota)
  const clave = claveDe(fecha, actual.id)
  const revisiones = REVISIONES.get(clave) ?? new Map()

  REVISIONES.set(clave, revisiones)

  if (datos.estado === null) {
    revisiones.delete(tareaId)

    return { estado: 200, cuerpo: conDatos(null) }
  }

  const revision = { estado: datos.estado, nota, ...referencia(actual), marcado_en: new Date().toISOString() }

  revisiones.set(tareaId, revision)

  return { estado: 200, cuerpo: conDatos(revision) }
}

/** `POST /supervision/hoja/{fecha}/firma`. Re-firmar una hoja devuelta limpia la devolución. */
function firmar (fecha, actual, arbol) {
  exigirAbierta(fecha, actual)

  if (tareasDeLaHoja(fecha, actual, arbol).length === 0) {
    throw new ErrorApi(422, 'validation_failed', 'No se puede firmar una hoja vacía.', { fecha: ['vacia'] })
  }

  const clave = claveDe(fecha, actual.id)
  const firma = { ...referencia(actual), firmado_en: new Date().toISOString() }

  FIRMAS.set(clave, firma)
  CONFIRMACIONES.delete(clave)

  return { estado: 200, cuerpo: conDatos(firma) }
}

/**
 * `POST /supervision/hoja/{fecha}/confirmacion`: la contrafirma de la jefatura.
 *
 * 403 si quien pide no está sobre la persona (ni es admin) o es ella misma; 422 si la acción no es
 * válida o se devuelve sin nota; 409 si la hoja no está firmada o ya está confirmada. Devolver anula
 * la firma: la hoja vuelve a quedar abierta para su dueño.
 */
async function confirmar (fecha, actual, cuerpo, arbol) {
  const datos = await cuerpo()
  const staffId = Number(datos?.staff_id)
  const supervisor = STAFF.find((s) => s.id === staffId)

  if (!Number.isInteger(staffId) || supervisor === undefined) {
    throw new ErrorApi(422, 'validation_failed', 'Esa persona no existe.', { staff_id: ['invalid'] })
  }

  if (supervisor.id === actual.id || (!actual.is_admin && !estaSobre(actual.id, supervisor.id, arbol))) {
    throw new ErrorApi(403, 'forbidden', 'Solo confirma la hoja quien está sobre esa persona en el árbol.')
  }

  if (!['confirmar', 'devolver'].includes(datos.accion)) {
    throw new ErrorApi(422, 'validation_failed', 'La acción tiene que ser confirmar o devolver.', { accion: ['invalid'] })
  }

  const nota = notaValida(datos.nota)

  if (datos.accion === 'devolver' && nota === null) {
    throw new ErrorApi(422, 'validation_failed', 'Para devolver la hoja hace falta una nota.', { nota: ['required'] })
  }

  const clave = claveDe(fecha, supervisor.id)

  if (!FIRMAS.has(clave)) throw new ErrorApi(409, 'conflict', 'La hoja no está firmada.')
  if (CONFIRMACIONES.get(clave)?.estado === 'confirmada') throw new ErrorApi(409, 'conflict', 'La hoja ya está confirmada.')

  const confirmacion = {
    estado: datos.accion === 'confirmar' ? 'confirmada' : 'devuelta',
    ...referencia(actual),
    nota,
    en: new Date().toISOString()
  }

  CONFIRMACIONES.set(clave, confirmacion)

  if (confirmacion.estado === 'devuelta') FIRMAS.delete(clave)

  return { estado: 200, cuerpo: conDatos(confirmacion) }
}

/** `GET /supervision/hoja`: la hoja de un día, con la compuerta del árbol. */
function leerHoja (parametros, actual, arbol) {
  const fecha = fechaDeLaConsulta(parametros)
  const crudo = parametros.get('staff_id')
  const staffId = crudo === null ? actual.id : Number(crudo)
  const supervisor = STAFF.find((s) => s.id === staffId)

  if (supervisor === undefined) throw new ErrorApi(404, 'not_found', `No existe la persona ${crudo}.`)

  if (supervisor.id !== actual.id && !actual.is_admin && !estaSobre(actual.id, supervisor.id, arbol)) {
    throw new ErrorApi(403, 'forbidden', 'Solo ves la hoja propia y la de quienes cuelgan de ti.')
  }

  return { estado: 200, cuerpo: conDatos(hojaDe(fecha, supervisor, actual, arbol)) }
}

/** El estado de una hoja para la lista del equipo. */
function estadoDeHoja (firma, confirmacion) {
  if (confirmacion?.estado === 'confirmada') return 'confirmada'
  if (confirmacion?.estado === 'devuelta') return 'devuelta'

  return firma === null ? 'sin_firmar' : 'firmada'
}

/** `GET /supervision/equipo`: las hojas no vacías de la descendencia; directos primero. */
function hojasDelEquipo (parametros, actual, arbol) {
  const fecha = fechaDeLaConsulta(parametros)
  const debajo = arbol.descendencia(actual.id)
  const filas = STAFF
    .filter((s) => s.id !== actual.id && (actual.is_admin || debajo.has(s.id)) && esSupervisor(s, arbol))
    .map((s) => ({ persona: s, hoja: hojaDe(fecha, s, actual, arbol) }))
    .filter(({ hoja }) => hoja.totales.tareas > 0)
    .map(({ persona, hoja }) => ({
      staffid: persona.id,
      nombre: persona.full_name,
      escalon: persona.escalon,
      jefe_staffid: persona.jefe_staffid ?? null,
      estado: estadoDeHoja(hoja.firma, hoja.confirmacion),
      firmado_en: hoja.firma?.firmado_en ?? null,
      confirmacion: hoja.confirmacion,
      totales: { tareas: hoja.totales.tareas, revisadas: hoja.totales.revisadas, completadas: hoja.totales.completadas }
    }))
    .sort((a, b) => Number(b.jefe_staffid === actual.id) - Number(a.jefe_staffid === actual.id) || a.nombre.localeCompare(b.nombre))

  return { estado: 200, cuerpo: conDatos(filas) }
}

/** `GET /supervision/supervisores`. */
function supervisoresVisibles (actual, arbol) {
  const debajo = arbol.descendencia(actual.id)
  const filas = STAFF
    .filter((s) => (s.id === actual.id || actual.is_admin || debajo.has(s.id)) && esSupervisor(s, arbol))
    .map((s) => ({ staffid: s.id, nombre: s.full_name, escalon: s.escalon, clientes: clientesDe(s.id, arbol).size }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  return { estado: 200, cuerpo: conDatos(filas) }
}

/** `/supervision/...`. */
async function supervisionRuta ({ metodo, resto, parametros, actual, cuerpo, descendencia, focalesDe }) {
  const arbol = { descendencia, focalesDe }

  if (resto.length === 1 && metodo === 'GET') {
    if (resto[0] === 'supervisores') return supervisoresVisibles(actual, arbol)
    if (resto[0] === 'equipo') return hojasDelEquipo(parametros, actual, arbol)
    if (resto[0] === 'hoja') return leerHoja(parametros, actual, arbol)
  }

  if (resto[0] === 'hoja' && resto.length === 3) {
    const fecha = fechaValida(resto[1])

    if (resto[2] === 'revisiones' && metodo === 'PUT') return await guardarRevision(fecha, actual, cuerpo, arbol)
    if (resto[2] === 'firma' && metodo === 'POST') return firmar(fecha, actual, arbol)
    if (resto[2] === 'confirmacion' && metodo === 'POST') return await confirmar(fecha, actual, cuerpo, arbol)
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
  const suyos = clientesAsociadosDe(persona.id)

  return {
    estado: 200,
    cuerpo: conDatos(CLIENTES.filter((c) => suyos.has(c.id)).map((c) => ({ client_id: c.id, company: c.company })))
  }
}

/**
 * Atiende las rutas de la Supervisión diaria, o devuelve `null` si la petición no es suya.
 *
 * @param {object} contexto `metodo`, `recurso`, `resto`, `parametros`, `cuerpo` (thunk), `actual`,
 *   `descendencia(staffId) → Set`, `focalesDe(staffId) → Set` (clientes donde es Focal) y
 *   `exigirPermiso(staff, recurso, accion)` del servidor
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
