/**
 * Mock de la API v1 de wiwo-board.
 *
 * Sirve exactamente las respuestas de `docs/contrato-api.md` para que `ops-v2` avance en paralelo con
 * la construccion del modulo real en Perfex. Cuando la API exista, la integracion es cambiar
 * `API_BASE`; si eso duele, es señal de que el contrato se congelo mal.
 *
 * Sin dependencias a proposito: `json-server` no hace envelope, ni Bearer, ni 2FA, ni `filter[]`.
 *
 *   node mock/servidor.js            # escucha en :3001
 *   PORT=4000 node mock/servidor.js
 */

import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ErrorApi, aplicarConsulta, coincideEnLista, leerIncludes } from './consulta.js'
import * as sesion from './sesion.js'
import {
  ARCHIVOS, CAMPOS_PERSONALIZADOS, CHECKLIST, CLIENTES, COMENTARIOS, CRONOMETROS,
  DEPARTAMENTOS, ESPACIOS, ESTADOS_ESPACIO, ESTADOS_PROCESO, ETIQUETAS, HITOS,
  AVISOS_CONTACTO, CONTACTOS, PRIORIDADES, PROCESOS, RESERVAS, ROLES, SALAS, STAFF, VALORES_CAMPOS
} from './datos.js'

const PUERTO = Number(process.env.PORT ?? 3001)
const ORIGENES = (process.env.ORIGENES ?? 'http://localhost:3000').split(',').map((o) => o.trim())

/** Recursos sobre los que se declaran permisos, con las acciones posibles. */
const ACCIONES = ['view', 'create', 'edit', 'delete']
const RECURSOS_CON_PERMISO = ['tasks', 'projects', 'customers', 'staff', 'invoices']

// ---------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------

/**
 * Emite las cabeceras CORS. Solo para origenes de la whitelist: nunca `*`.
 *
 * Sin `Access-Control-Allow-Credentials`, porque la autenticacion es Bearer y no cookies. Eso vuelve
 * irrelevante toda la discusion de `SameSite` en produccion, donde ademas el navegador habla con el
 * BFF de Next y no con esta API.
 */
function cabecerasCors (respuesta, origen) {
  if (!origen || !ORIGENES.includes(origen)) return
  respuesta.setHeader('Access-Control-Allow-Origin', origen)
  respuesta.setHeader('Vary', 'Origin')
  respuesta.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS')
  respuesta.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With')
  respuesta.setHeader('Access-Control-Max-Age', '86400')
}

/**
 * Escribe una respuesta JSON con el envelope del contrato.
 * @param {import('node:http').ServerResponse} respuesta
 * @param {number} estado
 * @param {object|null} cuerpo
 */
function responder (respuesta, estado, cuerpo) {
  if (estado === 204 || cuerpo === null) {
    respuesta.writeHead(204)
    respuesta.end()
    return
  }
  const texto = JSON.stringify(cuerpo, null, 2)
  respuesta.writeHead(estado, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto)
  })
  respuesta.end(texto)
}

const conDatos = (data, meta) => (meta ? { data, meta } : { data })

/**
 * Lee y parsea el cuerpo JSON de la peticion.
 * @param {import('node:http').IncomingMessage} peticion
 * @returns {Promise<object>}
 * @throws {ErrorApi} 400 si el JSON es invalido
 */
async function leerCuerpo (peticion) {
  const trozos = []
  for await (const trozo of peticion) trozos.push(trozo)
  const crudo = Buffer.concat(trozos).toString('utf8').trim()
  if (crudo === '') return {}
  try {
    return JSON.parse(crudo)
  } catch {
    throw new ErrorApi(400, 'bad_request', 'El cuerpo no es JSON válido.')
  }
}

// ---------------------------------------------------------------------------
// Presentacion
// ---------------------------------------------------------------------------

/** Quita del staff los campos que la API nunca expone. */
function presentarStaff (staff) {
  const { password, two_factor: dosFactores, ...publico } = staff
  return publico
}

/**
 * La ficha de una persona: lo del listado mas los cinco bloques que solo existen en el detalle.
 *
 * Los numeros salen del propio fixture y no de constantes sueltas: si alguien agrega Procesos, la
 * ficha los cuenta, y el mock sigue siendo un contrato ejecutable en vez de una postal.
 */
function fichaDeStaff (staff) {
  const suyos = PROCESOS.filter((p) => p.assignees.some((a) => a.id === staff.id))
  const corriendo = CRONOMETROS.find((c) => c.staff_id === staff.id && c.end_time === null)
  const tarea = corriendo === undefined ? null : PROCESOS.find((p) => p.id === corriendo.task_id)
  const rol = ROLES.find((r) => r.id === staff.role_id) ?? null

  return {
    ...presentarStaff(staff),
    role: rol,
    // Solo el primero tiene departamentos: una ficha sin ellos es el caso comun y tiene que estar
    // en el fixture, porque es donde la seccion no se dibuja.
    departments: staff.id === 1 ? DEPARTAMENTOS : [],
    permissions: permisosDe(staff),
    tiempo: {
      total_segundos: staff.id * 3600,
      este_mes_segundos: staff.id * 1800,
      esta_semana_segundos: staff.id * 900,
      corriendo: corriendo === undefined
        ? null
        : {
            id: corriendo.id,
            task_id: corriendo.task_id,
            task_name: tarea?.name ?? null,
            start_time: corriendo.start_time,
            segundos: 5400
          }
    },
    counts: {
      tareas_abiertas: suyos.filter((p) => p.status !== 5).length,
      espacios: new Set(suyos.map((p) => p.project?.id).filter((id) => id !== undefined)).size
    }
  }
}

/**
 * Permisos individuales editados desde la ficha, por id de persona.
 *
 * Vive en memoria y pisa a `permisosDe()`: es lo que hace que guardar la matriz se vea al refrescar,
 * igual que en la API real, donde estos permisos son filas de `tblstaff_permissions` y no una
 * propiedad del rol.
 */
const PERMISOS_EDITADOS = new Map()

/**
 * El catalogo de `GET /roles/catalogo`: las features y capacidades que el panel sabe escribir.
 *
 * Los nombres vienen en ingles a proposito —asi los manda Perfex—, para que la traduccion del
 * frontend se ejercite de verdad.
 */
function catalogoDePermisos () {
  return RECURSOS_CON_PERMISO.map((recurso) => ({
    feature: recurso,
    name: recurso.charAt(0).toUpperCase() + recurso.slice(1),
    capabilities: ACCIONES.map((accion) => ({ key: accion, name: accion.charAt(0).toUpperCase() + accion.slice(1) }))
  }))
}

/**
 * Arma el mapa de permisos que el frontend usa para podar columnas y acciones.
 *
 * Un admin puede todo. El resto trabaja sus Procesos pero NO ve clientes ni facturas: es un recorte
 * realista en Perfex, y es lo que hace que el 403 sea alcanzable desde el mock. Sin un permiso
 * denegado de verdad, la rama de "sin permiso" del frontend nunca se ejercita hasta produccion.
 */
function permisosDe (staff) {
  const editados = PERMISOS_EDITADOS.get(staff.id)
  if (editados !== undefined) return editados

  if (staff.is_admin) {
    return Object.fromEntries(RECURSOS_CON_PERMISO.map((r) => [r, [...ACCIONES]]))
  }
  return {
    tasks: ['view', 'create', 'edit'],
    projects: ['view'],
    customers: [],
    staff: ['view'],
    invoices: []
  }
}

/** Adjunta `custom_fields` a una fila si el cliente lo pidio con `include`. */
function conCamposPersonalizados (fila, entidad, includes) {
  if (!includes.includes('custom_fields')) return fila
  return { ...fila, custom_fields: VALORES_CAMPOS[`${entidad}:${fila.id}`] ?? [] }
}

// ---------------------------------------------------------------------------
// Whitelists por recurso
// ---------------------------------------------------------------------------

/** Estado "Completado" de Perfex. Es el mismo 5 que usa `Escritura\EstadoProceso::COMPLETADO`. */
const ESTADO_COMPLETADO = 5

const CONSULTA_PROCESOS = {
  filtros: {
    status: coincideEnLista((p) => p.status),
    priority: coincideEnLista((p) => p.priority),
    project_id: coincideEnLista((p) => p.project?.id ?? null),
    milestone_id: coincideEnLista((p) => p.milestone?.id ?? null),
    assignee: coincideEnLista((p) => p.assignees.map((a) => a.id)),
    follower: coincideEnLista((p) => p.followers.map((f) => f.id)),
    tag: coincideEnLista((p) => p.tags.map((t) => t.id)),
    billable: (p, v) => String(p.billable) === v,
    date_from: (p, v) => p.due_date >= v,
    date_to: (p, v) => p.due_date <= v
  },
  orden: ['name', 'due_date', 'start_date', 'date_added', 'priority', 'status', 'completed'],
  // `completed` no es un campo: la API lo resuelve con un CASE sobre `status`
  // (`RecursoProcesos::completadaComoOrden()`). Sin esto, el orden por defecto del listado de
  // Procesos —`['completed', '-date_added']`— respondia 422 contra el mock.
  derivadas: { completed: (p) => (p.status === ESTADO_COMPLETADO ? 1 : 0) },
  busqueda: ['name']
}

const CONSULTA_ESPACIOS = {
  filtros: {
    status: coincideEnLista((e) => e.status),
    clientid: coincideEnLista((e) => e.clientid),
    // Espacios que integra una persona. Lo usan el panel de trabajo del equipo y la lista de salas
    // privadas de Teletrabajo.
    member: coincideEnLista((e) => e.miembros),
    date_from: (e, v) => e.start_date >= v,
    date_to: (e, v) => e.start_date <= v
  },
  orden: ['name', 'start_date', 'deadline', 'progress'],
  busqueda: ['name']
}

const CONSULTA_CLIENTES = {
  filtros: {
    active: (c, v) => String(c.active) === v,
    country_id: coincideEnLista((c) => c.country_id)
  },
  orden: ['company', 'datecreated'],
  busqueda: ['company']
}

const CONSULTA_STAFF = {
  filtros: {
    active: (s, v) => String(s.active) === v,
    role_id: coincideEnLista((s) => s.role_id)
  },
  orden: ['firstname', 'lastname', 'last_login'],
  busqueda: ['full_name', 'email']
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

/**
 * Presenta un Espacio con sus contadores. Los `counts` viajan siempre: sin ellos, la lista tendria
 * que hacer una consulta por fila.
 */
function presentarEspacio (espacio, includes = []) {
  const cliente = CLIENTES.find((c) => c.id === espacio.clientid)
  const suyos = PROCESOS.filter((p) => p.project?.id === espacio.id)
  const { clientid, miembros, ...resto } = espacio
  return {
    ...resto,
    client: cliente ? { id: cliente.id, company: cliente.company } : null,
    // `members` solo con `include=members`, igual que la API: quien no lo pide no debe recibirlo, o
    // el frontend se acostumbra a un campo que en produccion no va a estar.
    ...(includes.includes('members') ? { members: miembrosDe(espacio) } : {}),
    counts: {
      tasks: suyos.length,
      tasks_open: suyos.filter((p) => p.status !== 5).length,
      milestones: HITOS.filter((h) => h.project_id === espacio.id).length
    }
  }
}

/**
 * Staff que integra un espacio.
 *
 * @param {object} espacio fila de `ESPACIOS`
 * @returns {object[]} referencias de staff, en el orden del fixture
 */
function miembrosDe (espacio) {
  return STAFF.filter((s) => espacio.miembros.includes(s.id)).map(presentarStaff)
}

/** En listas se omite `description`: son `longtext` y nadie los lee desde una tabla. */
function presentarProcesoEnLista (proceso) {
  const { description, ...resto } = proceso
  return resto
}

/**
 * Alta de un Proceso, con la validacion que el contrato exige.
 *
 * `rel_type` y `rel_id` pueden quedar vacios **a proposito**: `tbltasks.rel_type` admite `''`, y
 * obligar a elegir el Espacio antes de escribir el titulo es exactamente lo que termina empujando
 * la tarea a un chat. El Espacio se asigna despues con `PATCH`.
 *
 * El estado no se acepta del cliente: nace en la primera columna del tablero, como en el panel.
 *
 * @param {Record<string, unknown>} entrada cuerpo de la peticion
 * @param {{id: number}} autor staff autenticado, que queda en `added_from`
 * @returns {object} el Proceso nuevo, en la forma del contrato
 * @throws {ErrorApi} 422 con `details` por campo
 */
function crearProceso (entrada, autor) {
  const detalles = {}
  const nombre = typeof entrada.name === 'string' ? entrada.name.trim() : ''

  if (nombre === '') detalles.name = ['requerido']

  const prioridad = entrada.priority === undefined || entrada.priority === null
    ? 2
    : Number(entrada.priority)
  if (!PRIORIDADES.some((p) => p.id === prioridad)) detalles.priority = ['no_valido']

  for (const clave of ['start_date', 'due_date']) {
    const valor = entrada[clave]
    if (valor !== undefined && valor !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) {
      detalles[clave] = ['formato_invalido']
    }
  }

  // El vinculo es opcional, pero si viene tiene que existir: un Proceso colgado de un Espacio
  // fantasma es peor que uno sin Espacio.
  const vinculo = entrada.rel_type
  const relType = vinculo === undefined || vinculo === null || vinculo === '' ? null : String(vinculo)
  let relId = null
  let espacio = null

  if (relType !== null) {
    if (relType !== 'project' && relType !== 'customer') {
      detalles.rel_type = ['no_valido']
    } else {
      relId = Number(entrada.rel_id)
      const encontrado = (relType === 'project' ? ESPACIOS : CLIENTES).find((f) => f.id === relId)
      if (!encontrado) detalles.rel_id = ['no_existe']
      else if (relType === 'project') espacio = encontrado
    }
  }

  const asignados = resolverStaff(entrada.assignees, detalles, 'assignees')
  const seguidores = resolverStaff(entrada.followers, detalles, 'followers')
  // Una etiqueta que no existe es un 422, igual que en la API: descartarla en silencio hacia que el
  // alta pareciera funcionar contra el mock y fallara contra el backend real.
  const pedidas = Array.isArray(entrada.tags) ? entrada.tags : []
  const etiquetas = pedidas
    .map((t) => ETIQUETAS.find((e) => e.id === Number(t) || e.name === t))
    .filter((e) => e !== undefined)

  if (etiquetas.length !== pedidas.length) detalles.tags = ['no_existe']

  if (Object.keys(detalles).length > 0) {
    throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden guardar.', detalles)
  }

  const primera = [...ESTADOS_PROCESO].sort((a, b) => a.order - b.order)[0]

  return {
    id: Math.max(...PROCESOS.map((p) => p.id)) + 1,
    name: nombre,
    description: typeof entrada.description === 'string' ? entrada.description : null,
    status: primera.id,
    priority: prioridad,
    start_date: entrada.start_date ?? null,
    due_date: entrada.due_date ?? null,
    date_added: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    date_finished: null,
    added_from: autor.id,
    rel_type: relType,
    rel_id: relId,
    project: espacio ? { id: espacio.id, name: espacio.name } : null,
    milestone: null,
    billable: entrada.billable === true,
    billed: false,
    hourly_rate: 0,
    is_public: false,
    visible_to_client: false,
    recurring: false,
    kanban_order: 1,
    assignees: asignados.map((s) => ({
      id: s.id,
      full_name: s.full_name,
      profile_image_url: s.profile_image_url
    })),
    followers: seguidores.map((s) => ({ id: s.id, full_name: s.full_name })),
    tags: etiquetas,
    counts: { comments: 0, checklist: 0, checklist_done: 0, attachments: 0 },
    timer_activo: null
  }
}

/**
 * Resuelve una lista de ids de staff a personas, sin repetidos.
 *
 * Un id que no existe **falla**, no se descarta en silencio: una tarea que se guarda sin el
 * asignado que se eligio es peor que un error.
 */
function resolverStaff (valor, detalles, clave) {
  if (valor === undefined || valor === null) return []
  if (!Array.isArray(valor)) {
    detalles[clave] = ['debe_ser_lista']
    return []
  }

  const personas = []

  for (const id of valor) {
    const persona = STAFF.find((s) => s.id === Number(id))
    if (!persona) {
      detalles[clave] = ['no_existe']
      continue
    }
    if (!personas.some((p) => p.id === persona.id)) personas.push(persona)
  }

  return personas
}

/** Busca una fila por id o lanza 404. */
function buscarO404 (filas, id, que) {
  const fila = filas.find((f) => f.id === id)
  if (!fila) throw new ErrorApi(404, 'not_found', `No existe ${que} con id ${id}.`)
  return fila
}

/** Exige que el staff tenga una accion sobre un recurso, o lanza 403. */
function exigirPermiso (staff, recurso, accion) {
  const permisos = permisosDe(staff)
  if (!(permisos[recurso] ?? []).includes(accion)) {
    throw new ErrorApi(403, 'forbidden', `Sin permiso para ${accion} sobre ${recurso}.`)
  }
}

/**
 * Resuelve una peticion ya enrutada.
 *
 * @param {string} metodo
 * @param {string[]} segmentos ruta bajo `/api/v1`, ya partida
 * @param {URLSearchParams} parametros
 * @param {string|null} token
 * @param {() => Promise<object>} cuerpo
 * @returns {Promise<{estado: number, cuerpo: object|null}>}
 */

// ---------------------------------------------------------------------------
// Salas de reunion
// ---------------------------------------------------------------------------

/** La sala sin su `panel_token`: solo los administradores lo ven. */
function sinToken (sala) {
  const { panel_token: _token, ...resto } = sala

  return resto
}

/** Reservas vigentes de una sala, en orden. Las canceladas no cuentan para nada. */
function vigentesDe (salaId) {
  return RESERVAS
    .filter((reserva) => reserva.room_id === salaId && reserva.cancelled_at === null)
    .sort((a, b) => a.start.localeCompare(b.start))
}

/**
 * Choque de horarios en una sala.
 *
 * Los extremos que se tocan NO chocan: 10:00-11:00 y 11:00-12:00 conviven. Es la misma regla que
 * aplica la API real, y tiene que serlo — si el mock fuera mas permisivo, el frontend se probaria
 * contra un backend que no existe.
 */
function choqueEn (salaId, inicio, fin, excluir) {
  const desde = new Date(inicio).getTime()
  const hasta = new Date(fin).getTime()

  return vigentesDe(salaId).find((reserva) => (
    reserva.id !== excluir
    && new Date(reserva.start).getTime() < hasta
    && new Date(reserva.end).getTime() > desde
  ))
}

/**
 * Resuelve los ids de participantes contra el staff activo.
 *
 * Rechaza los desconocidos con el mismo detalle que la API real (`unknown:<id>`): si el mock fuera
 * mas permisivo, el frontend se probaria contra un backend que no existe. Es exactamente el tipo de
 * divergencia que hizo que los milisegundos de `toISOString()` llegaran a produccion sin detectarse.
 */
function resolverParticipantes (ids) {
  if (ids === undefined || ids === null) return []
  if (!Array.isArray(ids)) throw new ErrorApi(422, 'validation_failed', 'Lista inválida.', { participant_ids: ['list'] })

  const unicos = [...new Set(ids.map(Number))]
  const desconocidos = unicos.filter((id) => !STAFF.some((p) => p.id === id && p.active))

  if (desconocidos.length > 0) {
    throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden escribir.', {
      participant_ids: desconocidos.map((id) => `unknown:${id}`)
    })
  }

  return unicos.map((id) => {
    const p = STAFF.find((persona) => persona.id === id)

    return { id: p.id, full_name: p.full_name, profile_image_url: p.profile_image_url }
  })
}

/** Vuelve a armar una reserva con los datos de su sala y de quien la hizo. */
function presentarReserva (reserva) {
  const sala = SALAS.find((s) => s.id === reserva.room_id)

  return { ...reserva, room_name: sala?.name ?? '', room_capacity: sala?.capacity ?? 0 }
}

/**
 * `/rooms`, `/rooms/{id}` y `/rooms/bookings`.
 *
 * Escribe sobre los fixtures en memoria: reiniciar el mock devuelve todo a su estado inicial, que es
 * lo que hace repetible una prueba manual.
 */
async function salasRuta (metodo, resto, parametros, actual, cuerpo) {
  const [primero, segundo] = resto

  if (primero === 'bookings') {
    return await reservasRuta(metodo, segundo, parametros, actual, cuerpo)
  }

  // Personas que se pueden anotar en una reserva. Cuelga de `rooms` y no de `/staff` porque ese
  // exige `staff.view`: anotar a un compañero no puede depender de ver el legajo de todo el equipo.
  if (primero === 'people') {
    if (metodo !== 'GET') throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')

    return {
      estado: 200,
      cuerpo: conDatos(
        STAFF.filter((p) => p.active).map((p) => ({
          id: p.id, full_name: p.full_name, profile_image_url: p.profile_image_url
        }))
      )
    }
  }

  if (primero === undefined) {
    if (metodo === 'POST') {
      exigirAdmin(actual)
      const datos = await cuerpo()
      const nombre = String(datos.name ?? '').trim()

      if (nombre === '') throw new ErrorApi(422, 'validation_failed', 'Falta el nombre.', { name: ['required'] })
      if (SALAS.some((s) => s.name === nombre)) throw new ErrorApi(409, 'conflict', 'Ya existe una sala con ese nombre.')

      const sala = {
        id: Math.max(0, ...SALAS.map((s) => s.id)) + 1,
        name: nombre,
        capacity: Number(datos.capacity ?? 0),
        location: datos.location ?? null,
        active: true,
        date_created: new Date().toISOString(),
        panel_token: String(Date.now()).padStart(32, '0').slice(-32)
      }

      SALAS.push(sala)

      return { estado: 201, cuerpo: conDatos(actual.is_admin ? sala : sinToken(sala)) }
    }

    const todas = parametros.get('todas') === '1'
    const visibles = SALAS.filter((sala) => todas || sala.active)

    return { estado: 200, cuerpo: conDatos(visibles.map((sala) => (actual.is_admin ? sala : sinToken(sala)))) }
  }

  const sala = buscarO404(SALAS, Number(primero), 'sala')

  if (metodo === 'PATCH') {
    exigirAdmin(actual)
    const datos = await cuerpo()

    if (datos.name !== undefined) sala.name = String(datos.name).trim()
    if (datos.capacity !== undefined) sala.capacity = Number(datos.capacity)
    if (datos.location !== undefined) sala.location = datos.location
    if (datos.active !== undefined) sala.active = Boolean(datos.active)
    if (datos.rotate_token === true) sala.panel_token = String(Date.now()).padStart(32, '0').slice(-32)

    return { estado: 200, cuerpo: conDatos(sala) }
  }

  if (metodo === 'DELETE') {
    exigirAdmin(actual)
    sala.active = false

    return { estado: 204, cuerpo: null }
  }

  return { estado: 200, cuerpo: conDatos(actual.is_admin ? sala : sinToken(sala)) }
}

/** `/rooms/bookings` y `/rooms/bookings/{id}`. */
async function reservasRuta (metodo, id, parametros, actual, cuerpo) {
  if (id === undefined) {
    if (metodo === 'POST') {
      const datos = await cuerpo()
      const salaId = Number(datos.room_id)
      const sala = SALAS.find((s) => s.id === salaId && s.active)

      if (!sala) throw new ErrorApi(404, 'not_found', 'No existe esa sala.')
      if (String(datos.title ?? '').trim() === '') {
        throw new ErrorApi(422, 'validation_failed', 'Falta el título.', { title: ['required'] })
      }
      if (new Date(datos.end).getTime() <= new Date(datos.start).getTime()) {
        throw new ErrorApi(422, 'validation_failed', 'El horario no es válido.', { end: ['min_duration'] })
      }

      const participantes = resolverParticipantes(datos.participant_ids)

      const choque = choqueEn(salaId, datos.start, datos.end, undefined)
      if (choque) {
        throw new ErrorApi(409, 'conflict', `La sala ya está reservada por ${choque.staff?.full_name ?? 'otra persona'}.`)
      }

      const reserva = presentarReserva({
        id: Math.max(0, ...RESERVAS.map((r) => r.id)) + 1,
        room_id: salaId,
        staff_id: actual.id,
        staff: {
          id: actual.id,
          full_name: actual.full_name,
          email: actual.email,
          profile_image_url: actual.profile_image_url
        },
        title: String(datos.title).trim(),
        start: datos.start,
        end: datos.end,
        participants: participantes,
        attendees: datos.attendees ?? null,
        notes: datos.notes ?? null,
        cancelled_at: null,
        date_created: new Date().toISOString()
      })

      RESERVAS.push(reserva)

      return { estado: 201, cuerpo: conDatos(reserva) }
    }

    const desde = parametros.get('from')
    const hasta = parametros.get('to')

    if (!desde || !hasta) throw new ErrorApi(400, 'bad_request', 'Hacen falta `from` y `to` en ISO-8601.')

    const inicio = new Date(desde).getTime()
    const fin = new Date(hasta).getTime()

    const dentro = RESERVAS.filter((reserva) => (
      reserva.cancelled_at === null
      && new Date(reserva.start).getTime() < fin
      && new Date(reserva.end).getTime() > inicio
    ))

    return { estado: 200, cuerpo: conDatos(dentro.map(presentarReserva)) }
  }

  const reserva = buscarO404(RESERVAS, Number(id), 'reserva')
  const puedeTocar = reserva.staff_id === actual.id || actual.is_admin

  if (metodo === 'PATCH' || metodo === 'DELETE') {
    if (!puedeTocar) throw new ErrorApi(403, 'forbidden', 'Esa reserva la hizo otra persona.')
  }

  if (metodo === 'PATCH') {
    const datos = await cuerpo()
    const salaId = datos.room_id === undefined ? reserva.room_id : Number(datos.room_id)
    const inicio = datos.start ?? reserva.start
    const fin = datos.end ?? reserva.end

    const choque = choqueEn(salaId, inicio, fin, reserva.id)
    if (choque) throw new ErrorApi(409, 'conflict', 'La sala ya está reservada en ese horario.')

    Object.assign(reserva, {
      room_id: salaId,
      start: inicio,
      end: fin,
      title: datos.title === undefined ? reserva.title : String(datos.title).trim(),
      attendees: datos.attendees === undefined ? reserva.attendees : datos.attendees,
      notes: datos.notes === undefined ? reserva.notes : datos.notes,
      // Un PATCH que no menciona la clave conserva la lista, igual que la API real.
      participants: datos.participant_ids === undefined
        ? reserva.participants
        : resolverParticipantes(datos.participant_ids)
    })

    return { estado: 200, cuerpo: conDatos(presentarReserva(reserva)) }
  }

  if (metodo === 'DELETE') {
    reserva.cancelled_at = reserva.cancelled_at ?? new Date().toISOString()

    return { estado: 204, cuerpo: null }
  }

  return { estado: 200, cuerpo: conDatos(presentarReserva(reserva)) }
}

/** Solo administradores administran salas: no es una feature de Perfex con permisos propios. */
function exigirAdmin (staff) {
  if (!staff.is_admin) {
    throw new ErrorApi(403, 'forbidden', 'Solo un administrador puede administrar las salas.')
  }
}


// ---------------------------------------------------------------------------
// Contactos de un cliente
// ---------------------------------------------------------------------------

/**
 * Adosa `contacts` cuando se pidio el include.
 *
 * El mock aceptaba `include=contacts` y no devolvia nada: la pestaña salia vacia contra el mock
 * pasara lo que pasara, que es la peor forma de probar una pantalla de contactos. La forma corta y
 * **solo activos**, igual que la API real.
 */
function conContactos (cliente, includes) {
  if (!includes.includes('contacts')) return cliente

  return {
    ...cliente,
    contacts: CONTACTOS
      .filter((c) => c.client_id === cliente.id && c.active)
      .map((c) => ({
        id: c.id,
        full_name: c.full_name,
        email: c.email,
        phonenumber: c.phonenumber,
        title: c.title,
        is_primary: c.is_primary
      }))
  }
}

/** Forma completa de un contacto: lo que consume la pestaña. */
function presentarContactoCompleto (contacto) {
  const avisos = {}
  for (const aviso of AVISOS_CONTACTO) {
    avisos[aviso] = contacto.email_notifications?.[aviso] ?? true
  }

  return {
    id: contacto.id,
    client_id: contacto.client_id,
    firstname: contacto.firstname,
    lastname: contacto.lastname,
    full_name: contacto.full_name,
    email: contacto.email,
    phonenumber: contacto.phonenumber,
    title: contacto.title,
    is_primary: contacto.is_primary,
    active: contacto.active,
    date_created: '2026-01-14T12:00:00Z',
    last_login: contacto.last_login,
    email_verified_at: contacto.email_verified ? '2026-01-14T12:00:00Z' : null,
    direction: contacto.direction,
    permissions: contacto.permissions,
    email_notifications: avisos
  }
}

/** Valida lo mismo que la API real: correo con forma de correo y unico entre todos los contactos. */
function exigirCorreoDeContacto (email, excluir) {
  const limpio = String(email ?? '').trim().toLowerCase()

  if (limpio === '' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) {
    throw new ErrorApi(422, 'validation_failed', 'Correo inválido.', { email: ['email'] })
  }

  if (CONTACTOS.some((c) => c.email === limpio && c.id !== excluir)) {
    throw new ErrorApi(409, 'conflict', 'Ya hay un contacto con ese correo.')
  }

  return limpio
}

/** Deja un solo principal por cliente. */
function despromoverAlResto (clienteId, excepto) {
  for (const otro of CONTACTOS) {
    if (otro.client_id === clienteId && otro.id !== excepto) otro.is_primary = false
  }
}

// ---------------------------------------------------------------------------
// Capa de IA
// ---------------------------------------------------------------------------
//
// Lo que estos endpoints existen para probar NO es el texto: es el ritmo. Un resumen que llega
// entero al final compila igual, pasa las pruebas igual y hace imposible ver la escritura, que es
// la funcion entera. Por eso hay `setTimeout` entre deltas y no un `write` con todo junto.
//
// Los dos interruptores por query son lo que vuelve verificables dos casos que de otro modo hay que
// esperar horas o provocar en produccion: `?falla=1` corta el stream a la mitad, `?bloqueado=1`
// responde el 429 del cupo agotado.

/** Milisegundos entre deltas. Suficiente para ver la escritura sin que el resumen tarde un minuto. */
const PAUSA_DELTA_MS = 40

/** Caracteres por delta. El proveedor real manda tokens, que son de este orden de tamaño. */
const TAMANO_DELTA = 6

/** Regeneraciones por dia, igual que la regla del backend. */
const TOPE_GENERACIONES = 2

/** Resumen del Inicio ya generado, por staff. La clave es el id; el valor, lo que devuelve el GET. */
const RESUMENES_IA = new Map()

/** Hilo del chat, por `espacioId:staffId`. El hilo es por persona, no por Espacio: es una regla de seguridad. */
const HILOS_IA = new Map()

/**
 * Corta un texto en trozos de `TAMANO_DELTA` caracteres.
 *
 * Se recorre con el spread y no con `slice` sobre el string: `slice` parte los pares subrogados y un
 * emoji cortado a la mitad llega al front como dos caracteres de reemplazo.
 *
 * @param {string} texto
 * @returns {string[]}
 */
function trozosDe (texto) {
  const letras = [...texto]
  const trozos = []

  for (let i = 0; i < letras.length; i += TAMANO_DELTA) {
    trozos.push(letras.slice(i, i + TAMANO_DELTA).join(''))
  }

  return trozos
}

/**
 * Escribe un stream SSE con la forma exacta del contrato.
 *
 * Las cabeceras son las mismas que emitira la API real, `X-Accel-Buffering` incluida: si el BFF deja
 * de reenviarla, se nota aca y no en produccion detras de Nginx.
 *
 * @param {import('node:http').ServerResponse} respuesta
 * @param {string} texto lo que se escribe, que sale troceado en `event: delta`
 * @param {{citas?: object[], fin: object, falla: boolean}} opciones
 */
function transmitirSSE (respuesta, texto, { citas, fin, falla }) {
  respuesta.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff',
    Connection: 'keep-alive'
  })
  respuesta.flushHeaders()

  const trozos = trozosDe(texto)
  // A la mitad, no al final: lo que se prueba es que el front conserve lo que llego y lo marque
  // "quedo a medias", y eso solo se ve si el corte deja texto util en pantalla.
  const corte = falla ? Math.ceil(trozos.length / 2) : trozos.length
  const emitir = (evento, datos) => respuesta.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`)

  let vivo = true
  let i = 0

  // Sin esto, abortar desde el navegador deja el temporizador corriendo y el mock sigue escribiendo
  // en un socket muerto. F2 aborta el stream cada vez que alguien cambia de pestaña.
  respuesta.on('close', () => { vivo = false })

  const siguiente = () => {
    if (!vivo) return

    if (i < corte) {
      emitir('delta', { t: trozos[i++] })
      setTimeout(siguiente, PAUSA_DELTA_MS)
      return
    }

    if (falla) {
      emitir('error', { code: 'provider_error', message: 'El proveedor cortó la respuesta.' })
    } else {
      if (citas) emitir('citas', { citas })
      emitir('fin', fin)
    }

    respuesta.end()
  }

  siguiente()
}

/**
 * Bloque `regeneracion` del contrato.
 *
 * Viaja en el GET, en el POST y en el 429 para que el frontend nunca tenga que recalcular la regla.
 *
 * @param {number} staffId
 * @param {boolean} bloqueado interruptor `?bloqueado=1`
 * @returns {{restantes_hoy: number, puede_ahora: boolean, disponible_desde: string|null, motivo: string|null}}
 */
function regeneracionIa (staffId, bloqueado) {
  const guardado = RESUMENES_IA.get(staffId)
  const usadas = bloqueado ? TOPE_GENERACIONES : (guardado?.generaciones_dia ?? 0)
  const restantes = Math.max(0, TOPE_GENERACIONES - usadas)
  const enCuatroHoras = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')

  return {
    restantes_hoy: restantes,
    puede_ahora: restantes > 0,
    disponible_desde: restantes > 0 ? null : enCuatroHoras,
    motivo: restantes > 0 ? null : 'cupo'
  }
}

/**
 * Texto del resumen, armado con los propios fixtures.
 *
 * Sale de los datos y no de una constante para que el mock siga siendo un contrato ejecutable: si
 * alguien agrega Procesos al fixture, el resumen los nombra.
 *
 * @param {object} actual el staff de la sesion
 * @returns {string}
 */
function textoDeResumenIa (actual) {
  const hoy = new Date().toISOString().slice(0, 10)
  const suyos = PROCESOS.filter((p) => p.assignees.some((a) => a.id === actual.id) && p.status !== 5)
  const vencidos = suyos.filter((p) => p.due_date !== null && p.due_date < hoy)
  const espacios = [...new Set(suyos.map((p) => p.project?.name).filter(Boolean))]

  if (suyos.length === 0) return 'No tenés tareas abiertas asignadas. Nada pendiente de tu lado hoy.'

  const primeras = suyos.slice(0, 2).map((p) => `${p.name} (vence el ${p.due_date})`).join(' y ')
  const atrasadas = vencidos.length === 0
    ? 'Ninguna quedó atrasada.'
    : `Quedaron ${vencidos.length} atrasadas, la más vieja es ${vencidos[0].name}.`

  return `Tenés ${suyos.length} tareas abiertas repartidas en ${espacios.length} proyectos. `
    + `Las dos más próximas son ${primeras}. ${atrasadas}\n\n`
    + `El proyecto con más movimiento es ${espacios[0] ?? 'ninguno'}.`
}

/**
 * `/ia/*`. Reparte entre los tres recursos de la capa.
 *
 * @param {string} metodo
 * @param {string[]} resto segmentos despues de `ia`
 * @param {URLSearchParams} parametros
 * @param {object} actual staff de la sesion
 * @param {() => Promise<object>} cuerpo
 * @param {import('node:http').IncomingMessage} peticion
 */
async function iaRuta (metodo, resto, parametros, actual, cuerpo, peticion) {
  const [seccion, ...sub] = resto

  if (seccion === 'inicio') return await resumenInicioIaRuta(metodo, parametros, actual, peticion)
  if (seccion === 'proyectos' && sub[1] === 'chat') {
    return await chatEspacioIaRuta(metodo, sub[0], parametros, actual, cuerpo, peticion)
  }
  if (seccion === 'tareas' && sub[0] === 'interpretar' && metodo === 'POST') {
    return await interpretarTareaIaRuta(actual, cuerpo)
  }

  throw new ErrorApi(404, 'not_found', `Recurso de IA desconocido: "${seccion ?? ''}".`)
}

/**
 * `GET|POST /ia/inicio`. El GET lee lo guardado y no consume cuota; el POST genera.
 *
 * El POST transmite solo si se pidio con `Accept: text/event-stream`; si no, devuelve el mismo
 * cuerpo de una vez. Las dos formas existen en la API real y el frontend usa las dos.
 */
async function resumenInicioIaRuta (metodo, parametros, actual, peticion) {
  const bloqueado = parametros.get('bloqueado') === '1'
  const guardado = RESUMENES_IA.get(actual.id) ?? null

  if (metodo === 'GET') {
    return {
      estado: 200,
      cuerpo: conDatos({
        texto: guardado?.texto ?? null,
        generado_en: guardado?.generado_en ?? null,
        regeneracion: regeneracionIa(actual.id, bloqueado)
      })
    }
  }

  if (metodo !== 'POST') throw new ErrorApi(404, 'not_found', 'Método no disponible en /ia/inicio.')

  if (bloqueado) {
    throw new ErrorApi(429, 'rate_limited', 'Ya regeneraste el resumen dos veces hoy.', {
      regeneracion: regeneracionIa(actual.id, true)
    })
  }

  const falla = parametros.get('falla') === '1'
  const texto = textoDeResumenIa(actual)
  const generadoEn = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

  // Una generacion fallida no consume cuota, igual que en el backend.
  if (!falla) {
    RESUMENES_IA.set(actual.id, {
      texto,
      generado_en: generadoEn,
      generaciones_dia: (guardado?.generaciones_dia ?? 0) + 1
    })
  }

  const fin = {
    generado_en: generadoEn,
    regeneracion: regeneracionIa(actual.id, false),
    uso: { entrada: 3120, salida: [...texto].length }
  }

  if (!aceptaStream(peticion)) {
    return { estado: 200, cuerpo: conDatos({ texto, generado_en: generadoEn, regeneracion: fin.regeneracion }) }
  }

  return { transmitir: (respuesta) => transmitirSSE(respuesta, texto, { fin, falla }) }
}

/**
 * `GET|POST|DELETE /ia/proyectos/{id}/chat`.
 *
 * El hilo se guarda por `(Espacio, persona)` y no por Espacio: dos personas del mismo Espacio pueden
 * ver distintas tareas, y un hilo compartido filtraria por el historial lo que el contexto si
 * filtra. El mock lo replica para que el frontend no se acostumbre a lo contrario.
 */
async function chatEspacioIaRuta (metodo, id, parametros, actual, cuerpo, peticion) {
  const espacio = buscarO404(ESPACIOS, Number(id), 'espacio')
  const clave = `${espacio.id}:${actual.id}`
  const hilo = HILOS_IA.get(clave) ?? []

  if (metodo === 'GET') {
    return { estado: 200, cuerpo: conDatos({ mensajes: hilo, modo: 'cache' }) }
  }

  if (metodo === 'DELETE') {
    HILOS_IA.delete(clave)

    return { estado: 204, cuerpo: null }
  }

  if (metodo !== 'POST') throw new ErrorApi(404, 'not_found', 'Método no disponible en el chat.')

  const datos = await cuerpo()
  const pregunta = String(datos.pregunta ?? '').trim()

  if (pregunta === '') {
    throw new ErrorApi(422, 'validation_failed', 'Falta la pregunta.', { pregunta: ['requerido'] })
  }
  if (parametros.get('bloqueado') === '1') {
    throw new ErrorApi(429, 'rate_limited', 'Demasiadas preguntas seguidas. Probá en un rato.', {
      regeneracion: regeneracionIa(actual.id, true)
    })
  }

  const falla = parametros.get('falla') === '1'
  const abiertas = PROCESOS.filter((p) => p.rel_type === 'project' && p.rel_id === espacio.id && p.status !== 5)
  const citas = abiertas.slice(0, 2).map((p) => ({ tipo: 'tarea', id: p.id, titulo: p.name }))
  const texto = `En ${espacio.name} quedan ${abiertas.length} tareas abiertas. `
    + `Las que empujan la fecha son ${citas.map((c, i) => `${c.titulo} [${i + 1}]`).join(' y ')}. `
    + 'El resto avanza sin bloqueos.'

  hilo.push({ rol: 'usuario', texto: pregunta })
  if (!falla) hilo.push({ rol: 'asistente', texto, citas })
  HILOS_IA.set(clave, hilo)

  const fin = {
    generado_en: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    regeneracion: null,
    uso: { entrada: 1840, salida: [...texto].length }
  }

  if (!aceptaStream(peticion)) {
    return { estado: 200, cuerpo: conDatos({ texto, citas, ...fin }) }
  }

  return { transmitir: (respuesta) => transmitirSSE(respuesta, texto, { citas, fin, falla }) }
}

/**
 * `POST /ia/tareas/interpretar`. Devuelve campos, nunca crea nada.
 *
 * Todo id sale de los fixtures: el contrato dice que el backend resuelve contra la base y manda ids
 * reales, y lo que no resuelve va a `no_resuelto`. Un mock que devolviera nombres sueltos entrenaria
 * al frontend para un contrato que no existe.
 */
async function interpretarTareaIaRuta (actual, cuerpo) {
  exigirPermiso(actual, 'tasks', 'create')

  const datos = await cuerpo()
  const texto = String(datos.texto ?? '').trim()

  if (texto === '') {
    throw new ErrorApi(422, 'validation_failed', 'Falta el texto.', { texto: ['requerido'] })
  }

  const espacio = ESPACIOS.find((e) => texto.toLowerCase().includes(e.name.toLowerCase())) ?? null
  const persona = STAFF.find((s) => texto.toLowerCase().includes(s.firstname.toLowerCase())) ?? null
  const urgente = /urgente|cuanto antes|al tiro/i.test(texto)

  return {
    estado: 200,
    cuerpo: conDatos({
      name: texto.split(/[.\n]/)[0].slice(0, 120),
      description: null,
      // Nunca se inventa un vencimiento: si el texto no lo menciona, sale `null`.
      due_date: /mañana|viernes|lunes|\d{1,2}\/\d{1,2}/i.test(texto) ? proximoLunes() : null,
      start_date: null,
      priority: urgente ? (PRIORIDADES.find((p) => p.name === 'Urgente')?.id ?? null) : null,
      rel_type: espacio === null ? null : 'project',
      rel_id: espacio?.id ?? null,
      milestone: null,
      assignees: persona === null ? [] : [persona.id],
      tags: [],
      no_resuelto: persona === null && /@\w+/.test(texto) ? [texto.match(/@\w+/)[0]] : []
    })
  }
}

/** `YYYY-MM-DD` del proximo lunes, para que el mock nunca devuelva una fecha ya pasada. */
function proximoLunes () {
  const fecha = new Date()

  fecha.setDate(fecha.getDate() + ((8 - fecha.getDay()) % 7 || 7))

  return fecha.toISOString().slice(0, 10)
}

/** `true` si el pedido acepta un stream. Es lo que decide entre SSE y JSON, igual que la API real. */
function aceptaStream (peticion) {
  return (peticion.headers.accept ?? '').includes('text/event-stream')
}

/** El principal no se borra ni se desmarca mientras el cliente tenga otros contactos. */
function exigirNoEsElPrincipalConOtros (contacto) {
  if (!contacto.is_primary) return

  const hayOtros = CONTACTOS.some((c) => c.client_id === contacto.client_id && c.id !== contacto.id)

  if (hayOtros) {
    throw new ErrorApi(409, 'conflict', 'Es el contacto principal. Marcá a otro como principal antes de borrarlo.')
  }
}

function crearContacto (clienteId, datos) {
  for (const clave of ['firstname', 'lastname']) {
    if (String(datos[clave] ?? '').trim() === '') {
      throw new ErrorApi(422, 'validation_failed', 'Falta un campo.', { [clave]: ['required'] })
    }
  }

  const email = exigirCorreoDeContacto(datos.email, undefined)
  // El primero de un cliente es principal aunque nadie marque la casilla, igual que la API real.
  const esElPrimero = !CONTACTOS.some((c) => c.client_id === clienteId)
  const principal = esElPrimero || datos.is_primary === true

  if (principal) despromoverAlResto(clienteId, undefined)

  const avisos = {}
  for (const aviso of AVISOS_CONTACTO) {
    avisos[aviso] = datos.email_notifications === undefined
      ? true
      : datos.email_notifications[aviso] === true
  }

  const contacto = {
    id: Math.max(0, ...CONTACTOS.map((c) => c.id)) + 1,
    client_id: clienteId,
    email,
    password: datos.password ?? null,
    firstname: String(datos.firstname).trim(),
    lastname: String(datos.lastname).trim(),
    full_name: `${String(datos.firstname).trim()} ${String(datos.lastname).trim()}`,
    phonenumber: datos.phonenumber ?? null,
    title: datos.title ?? null,
    is_primary: principal,
    email_verified: true,
    active: datos.active ?? true,
    direction: datos.direction ?? null,
    last_login: null,
    permissions: datos.permissions ?? [],
    email_notifications: avisos
  }

  CONTACTOS.push(contacto)

  return presentarContactoCompleto(contacto)
}

function editarContacto (contacto, datos) {
  if (datos.email !== undefined) contacto.email = exigirCorreoDeContacto(datos.email, contacto.id)

  if (datos.is_primary === true) {
    despromoverAlResto(contacto.client_id, contacto.id)
    contacto.is_primary = true
  }

  if (datos.is_primary === false && contacto.is_primary) {
    throw new ErrorApi(409, 'conflict', 'Marcá a otro contacto como principal en vez de desmarcar a este: el cliente no puede quedarse sin uno.')
  }

  for (const clave of ['firstname', 'lastname', 'phonenumber', 'title', 'direction']) {
    if (datos[clave] !== undefined) contacto[clave] = datos[clave]
  }

  contacto.full_name = `${contacto.firstname} ${contacto.lastname}`

  if (datos.active !== undefined) contacto.active = datos.active === true
  if (datos.password) contacto.password = datos.password
  if (datos.permissions !== undefined) contacto.permissions = datos.permissions ?? []

  if (datos.email_notifications !== undefined) {
    const avisos = {}
    for (const aviso of AVISOS_CONTACTO) {
      avisos[aviso] = datos.email_notifications?.[aviso] === true
    }
    contacto.email_notifications = avisos
  }

  return presentarContactoCompleto(contacto)
}

async function resolverRuta (metodo, segmentos, parametros, token, cuerpo, peticion) {
  const [recurso, ...resto] = segmentos

  // --- Publicas -----------------------------------------------------------
  if (recurso === 'health') {
    return {
      estado: 200,
      cuerpo: conDatos({
        ok: true,
        version: 'mock-1.0.0',
        // Igual que la API real: dice cual de las dos cabeceras llego de verdad. Contra el servidor
        // es lo primero a mirar tras desplegar.
        auth_header_visible: peticion.headers.authorization !== undefined,
        api_key_visible: peticion.headers['x-api-key'] !== undefined
      })
    }
  }

  // --- Pantalla de puerta: la unica ruta de salas sin sesion ---------------
  //
  // Va antes de resolver el token por la misma razon que el portal: una tablet colgada en la pared
  // no manda Authorization, y si cayera despues moriria en el 401 antes de llegar aca.
  if (recurso === 'rooms' && resto[0] === 'panel') {
    if (metodo !== 'GET') throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')

    const sala = SALAS.find((s) => s.panel_token === resto[1] && s.active)
    if (!sala) throw new ErrorApi(404, 'not_found', 'No existe esa pantalla.')

    const ahora = Date.now()
    // Solo lo que queda de HOY, igual que la API real: la pantalla de puerta no anuncia lo de mañana.
    const finDelDia = new Date(new Date(ahora).toISOString().slice(0, 10) + 'T23:59:59Z').getTime()
    const delDia = vigentesDe(sala.id)
      .filter((r) => new Date(r.end).getTime() > ahora && new Date(r.start).getTime() <= finDelDia)
    const actual = delDia.find((r) => new Date(r.start).getTime() <= ahora) ?? null

    return {
      estado: 200,
      cuerpo: conDatos({
        room: sinToken(sala),
        now: new Date(ahora).toISOString(),
        current: actual,
        upcoming: delDia.filter((r) => r !== actual).slice(0, 3)
      })
    }
  }

  if (recurso === 'auth') {
    const [accion] = resto
    const datos = await cuerpo()

    if (accion === 'login' && metodo === 'POST') {
      const staff = sesion.autenticar(datos.email, datos.password)
      if (staff.two_factor) {
        return {
          estado: 200,
          cuerpo: conDatos({
            two_factor_required: true,
            challenge_token: sesion.emitirDesafio(staff.id),
            method: staff.two_factor
          })
        }
      }
      return { estado: 201, cuerpo: conDatos({ ...sesion.emitirSesion(staff.id), staff: presentarStaff(staff) }) }
    }

    if (accion === '2fa' && metodo === 'POST') {
      const staff = sesion.resolver(datos.challenge_token ?? null, 'desafio')
      // En el mock cualquier codigo de 6 digitos sirve: validar un TOTP real no aporta nada acá, pero
      // rechazar un codigo con forma invalida sí, porque es el error que el frontend debe mostrar.
      if (!/^\d{6}$/.test(String(datos.code ?? ''))) {
        throw new ErrorApi(401, 'unauthenticated', 'Código de verificación inválido.')
      }
      sesion.revocar(datos.challenge_token)
      return { estado: 201, cuerpo: conDatos({ ...sesion.emitirSesion(staff.id), staff: presentarStaff(staff) }) }
    }

    if (accion === 'portal' && resto[1] === 'login' && metodo === 'POST') {
      const contacto = sesion.autenticarContacto(datos.email, datos.password)
      return {
        estado: 201,
        cuerpo: conDatos({
          ...sesion.emitirSesion(contacto.id, 'contacto'),
          contact: presentarContacto(contacto)
        })
      }
    }

    if (accion === 'refresh' && metodo === 'POST') {
      return { estado: 200, cuerpo: conDatos(sesion.rotar(datos.refresh_token ?? null)) }
    }

    if (accion === 'logout' && metodo === 'POST') {
      // Sirve a los dos sujetos: se prueba el del panel y, si no es, el del portal. El token ya trae
      // su tipo, asi que nadie cierra la sesion de otro.
      let sujeto = 'staff'
      let persona
      try {
        persona = sesion.resolver(token, 'acceso')
      } catch {
        persona = sesion.resolverContacto(token, 'acceso')
        sujeto = 'contacto'
      }
      if (parametros.get('all') === '1') sesion.revocarTodo(persona.id, sujeto)
      else sesion.revocar(token)
      return { estado: 204, cuerpo: null }
    }

    throw new ErrorApi(404, 'not_found', 'Acción de autenticación desconocida.')
  }

  // --- Portal del cliente: otro sujeto, otra puerta ------------------------
  //
  // Va ANTES de resolver la sesion de staff: si cayera despues, un token de contacto moriria en el
  // 401 del panel antes de llegar acá.
  if (recurso === 'portal') {
    if (metodo !== 'GET') throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')

    const contacto = sesion.resolverContacto(token, 'acceso')
    const [seccion] = resto

    // Solo /portal/me es visible sin verificar el correo: es como el frontend se entera.
    if (seccion !== 'me' && !contacto.email_verified) {
      throw new ErrorApi(403, 'email_unverified', 'Tenés que verificar tu correo antes de continuar.')
    }

    if (seccion === 'me') {
      return {
        estado: 200,
        cuerpo: conDatos({
          ...presentarContacto(contacto),
          permissions: contacto.permissions,
          secciones_habilitadas: seccionesDelPortal(contacto),
          locale: 'es'
        })
      }
    }

    if (seccion === 'company') {
      const empresa = CLIENTES.find((c) => c.id === contacto.client_id)
      if (!empresa) throw new ErrorApi(404, 'not_found', 'Cliente inexistente.')
      return {
        estado: 200,
        cuerpo: conDatos({
          id: empresa.id,
          company: empresa.company,
          vat: empresa.vat,
          phonenumber: empresa.phonenumber,
          website: empresa.website,
          address: empresa.address,
          city: empresa.city,
          state: empresa.state,
          zip: empresa.zip,
          country_id: empresa.country_id,
          default_language: null,
          date_created: null
        })
      }
    }

    throw new ErrorApi(404, 'not_found', `Recurso desconocido: "${seccion ?? ''}".`)
  }

  // --- A partir de acá, todo exige token ----------------------------------
  const actual = sesion.resolver(token, 'acceso')

  if (recurso === 'me' && metodo === 'GET') {
    return {
      estado: 200,
      cuerpo: conDatos({
        ...presentarStaff(actual),
        permissions: permisosDe(actual),
        secciones_habilitadas: ['procesos', 'espacios', 'salas'],
        locale: 'es'
      })
    }
  }

  if (recurso === 'rooms') {
    return await salasRuta(metodo, resto, parametros, actual, cuerpo)
  }

  if (recurso === 'ia') {
    return await iaRuta(metodo, resto, parametros, actual, cuerpo, peticion)
  }

  if (recurso === 'config' && resto[0] === 'realtime') {
    return {
      estado: 200,
      cuerpo: conDatos({ enabled: false, key: null, cluster: null })
    }
  }

  if (recurso === 'lookups' && metodo === 'GET') {
    return {
      estado: 200,
      cuerpo: conDatos({
        task_statuses: ESTADOS_PROCESO,
        task_priorities: PRIORIDADES,
        project_statuses: ESTADOS_ESPACIO,
        tags: ETIQUETAS,
        roles: ROLES,
        departments: DEPARTAMENTOS
      })
    }
  }

  if (recurso === 'custom-fields' && metodo === 'GET') {
    const para = parametros.get('para') ?? ''
    const definiciones = CAMPOS_PERSONALIZADOS[para]
    if (!definiciones) {
      throw new ErrorApi(422, 'validation_failed', `Entidad desconocida: "${para}".`, { para: ['unknown'] })
    }
    // `only_admin` lo decide el backend, no el frontend: si el filtro viviera en la interfaz, bastaria
    // con abrir DevTools para ver los campos reservados.
    return { estado: 200, cuerpo: conDatos(definiciones.filter((d) => !d.only_admin || actual.is_admin)) }
  }

  if (recurso === 'roles' && resto[0] === 'catalogo' && metodo === 'GET') {
    exigirPermiso(actual, 'staff', 'view')

    return { estado: 200, cuerpo: conDatos(catalogoDePermisos()) }
  }

  // Edicion de los permisos individuales de una persona. Solo `permissions`: el resto de la ficha se
  // edita con el formulario de Equipo, que el mock no necesita para probar esta pantalla.
  if (recurso === 'staff' && metodo === 'PATCH') {
    exigirPermiso(actual, 'staff', 'edit')
    const persona = buscarO404(STAFF, Number(resto[0]), 'staff')
    const datos = await cuerpo()

    if (datos.permissions !== undefined) {
      // Mismo contrato que la API real: solo se reescriben las areas nombradas; las demas quedan.
      const previos = { ...permisosDe(persona) }
      for (const [feature, capacidades] of Object.entries(datos.permissions)) {
        previos[feature] = [...capacidades]
      }
      PERMISOS_EDITADOS.set(persona.id, previos)
    }

    return { estado: 200, cuerpo: conDatos(fichaDeStaff(persona)) }
  }

  if (recurso === 'staff' && metodo === 'GET') {
    exigirPermiso(actual, 'staff', 'view')
    if (resto.length === 0) {
      const { filas, paginacion } = aplicarConsulta(STAFF.map(presentarStaff), parametros, CONSULTA_STAFF)
      return { estado: 200, cuerpo: conDatos(filas, { pagination: paginacion }) }
    }
    return { estado: 200, cuerpo: conDatos(fichaDeStaff(buscarO404(STAFF, Number(resto[0]), 'staff'))) }
  }

  // --- Contactos de un cliente ---------------------------------------------
  //
  // Va antes del bloque de `clients`, que es solo GET: sin esto, un POST de contacto caeria al 404
  // final y el frontend se probaria contra un backend que no acepta lo que la API real si acepta.
  if (recurso === 'clients' && resto[1] === 'contacts') {
    const cliente = buscarO404(CLIENTES, Number(resto[0]), 'cliente')

    if (metodo === 'POST') {
      exigirPermiso(actual, 'customers', 'edit')
      const datos = await cuerpo()

      return { estado: 201, cuerpo: conDatos(crearContacto(cliente.id, datos)) }
    }

    if (metodo !== 'GET') throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')

    const suyos = CONTACTOS
      .filter((c) => c.client_id === cliente.id && (parametros.get('activos') !== '1' || c.active))

    return { estado: 200, cuerpo: conDatos(suyos.map(presentarContactoCompleto)) }
  }

  if (recurso === 'contacts') {
    const contacto = buscarO404(CONTACTOS, Number(resto[0]), 'contacto')

    if (metodo === 'PATCH') {
      exigirPermiso(actual, 'customers', 'edit')
      const datos = await cuerpo()

      return { estado: 200, cuerpo: conDatos(editarContacto(contacto, datos)) }
    }

    if (metodo === 'DELETE') {
      exigirPermiso(actual, 'customers', 'delete')
      exigirNoEsElPrincipalConOtros(contacto)
      CONTACTOS.splice(CONTACTOS.indexOf(contacto), 1)

      return { estado: 204, cuerpo: null }
    }

    return { estado: 200, cuerpo: conDatos(presentarContactoCompleto(contacto)) }
  }

  if (recurso === 'clients' && metodo === 'GET') {
    exigirPermiso(actual, 'customers', 'view')
    const includes = leerIncludes(parametros, ['custom_fields', 'contacts'])
    if (resto.length === 0) {
      const { filas, paginacion } = aplicarConsulta(CLIENTES, parametros, CONSULTA_CLIENTES)
      return {
        estado: 200,
        cuerpo: conDatos(
          filas.map((c) => conContactos(conCamposPersonalizados(c, 'clients', includes), includes)),
          { pagination: paginacion }
        )
      }
    }
    const cliente = buscarO404(CLIENTES, Number(resto[0]), 'cliente')
    return { estado: 200, cuerpo: conDatos(conContactos(conCamposPersonalizados(cliente, 'clients', includes), includes)) }
  }

  if (recurso === 'projects' && metodo === 'GET') {
    exigirPermiso(actual, 'projects', 'view')
    const includes = leerIncludes(parametros, ['custom_fields', 'members'])

    if (resto.length === 0) {
      const { filas, paginacion } = aplicarConsulta(ESPACIOS, parametros, CONSULTA_ESPACIOS)
      return {
        estado: 200,
        cuerpo: conDatos(filas.map((e) => conCamposPersonalizados(presentarEspacio(e, includes), 'projects', includes)), {
          pagination: paginacion
        })
      }
    }

    const espacio = buscarO404(ESPACIOS, Number(resto[0]), 'espacio')
    const [, subrecurso] = resto

    if (!subrecurso) {
      return { estado: 200, cuerpo: conDatos(conCamposPersonalizados(presentarEspacio(espacio, includes), 'projects', includes)) }
    }
    if (subrecurso === 'tasks') {
      const suyos = PROCESOS.filter((p) => p.project?.id === espacio.id)
      const { filas, paginacion } = aplicarConsulta(suyos, parametros, CONSULTA_PROCESOS)
      return { estado: 200, cuerpo: conDatos(filas.map(presentarProcesoEnLista), { pagination: paginacion }) }
    }
    if (subrecurso === 'milestones') {
      return { estado: 200, cuerpo: conDatos(HITOS.filter((h) => h.project_id === espacio.id)) }
    }
    if (subrecurso === 'members') {
      return { estado: 200, cuerpo: conDatos(miembrosDe(espacio)) }
    }
    if (subrecurso === 'files') {
      const suyos = PROCESOS.filter((p) => p.project?.id === espacio.id).map((p) => p.id)
      return { estado: 200, cuerpo: conDatos(ARCHIVOS.filter((a) => suyos.includes(a.rel_id))) }
    }
    throw new ErrorApi(404, 'not_found', `Subrecurso desconocido: "${subrecurso}".`)
  }

  if (recurso === 'tasks') {
    const includes = leerIncludes(parametros, ['custom_fields', 'description'])

    if (metodo === 'GET' && resto.length === 0) {
      exigirPermiso(actual, 'tasks', 'view')

      if (parametros.get('vista') === 'tablero') {
        // Las columnas salen de `lookups`, ordenadas por `order` y no por `id`: los ids de estado de
        // Perfex no siguen el orden de visualizacion.
        const columnas = [...ESTADOS_PROCESO].sort((a, b) => a.order - b.order)
        return {
          estado: 200,
          cuerpo: conDatos(columnas.map((columna) => {
            const parametrosColumna = new URLSearchParams(parametros)
            parametrosColumna.set('filter[status]', String(columna.id))
            const { filas, paginacion } = aplicarConsulta(PROCESOS, parametrosColumna, CONSULTA_PROCESOS)
            return {
              columna: { id: columna.id, name: columna.name, color: columna.color, order: columna.order },
              tarjetas: filas.map(presentarProcesoEnLista),
              pagination: paginacion
            }
          }))
        }
      }

      const { filas, paginacion } = aplicarConsulta(PROCESOS, parametros, CONSULTA_PROCESOS)
      return { estado: 200, cuerpo: conDatos(filas.map(presentarProcesoEnLista), { pagination: paginacion }) }
    }

    if (metodo === 'POST' && resto.length === 0) {
      exigirPermiso(actual, 'tasks', 'create')
      const nuevo = crearProceso(await cuerpo(), actual)
      // Al frente: el alta se hace para verla, y el orden por defecto de la lista es por entrega.
      PROCESOS.unshift(nuevo)
      return { estado: 201, cuerpo: conDatos(nuevo) }
    }

    const proceso = buscarO404(PROCESOS, Number(resto[0]), 'proceso')
    const [, subrecurso, extra] = resto

    if (metodo === 'GET' && !subrecurso) {
      exigirPermiso(actual, 'tasks', 'view')
      return { estado: 200, cuerpo: conDatos(conCamposPersonalizados(proceso, 'tasks', includes)) }
    }
    if (metodo === 'GET' && subrecurso === 'comments') {
      return { estado: 200, cuerpo: conDatos(COMENTARIOS.filter((c) => c.task_id === proceso.id)) }
    }
    if (metodo === 'GET' && subrecurso === 'checklist') {
      return { estado: 200, cuerpo: conDatos(CHECKLIST.filter((c) => c.task_id === proceso.id)) }
    }
    if (metodo === 'GET' && subrecurso === 'timers') {
      return { estado: 200, cuerpo: conDatos(CRONOMETROS.filter((c) => c.task_id === proceso.id)) }
    }
    if (metodo === 'GET' && subrecurso === 'files') {
      return { estado: 200, cuerpo: conDatos(ARCHIVOS.filter((a) => a.rel_type === 'task' && a.rel_id === proceso.id)) }
    }

    if (metodo === 'PATCH' && !subrecurso) {
      exigirPermiso(actual, 'tasks', 'edit')
      // Parche parcial: el detalle edita bloque a bloque, nunca envia 200 campos de una.
      Object.assign(proceso, await cuerpo())
      return { estado: 200, cuerpo: conDatos(proceso) }
    }

    if (metodo === 'POST' && subrecurso === 'actions') {
      exigirPermiso(actual, 'tasks', 'edit')
      if (extra === 'mark-complete') {
        proceso.status = 5
        proceso.date_finished = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
        return { estado: 200, cuerpo: conDatos(proceso) }
      }
      if (extra === 'reopen') {
        proceso.status = 4
        proceso.date_finished = null
        return { estado: 200, cuerpo: conDatos(proceso) }
      }
      throw new ErrorApi(404, 'not_found', `Acción desconocida: "${extra}".`)
    }

    if (metodo === 'POST' && subrecurso === 'mover') {
      exigirPermiso(actual, 'tasks', 'edit')
      const { columna, posicion } = await cuerpo()
      if (!ESTADOS_PROCESO.some((e) => e.id === columna)) {
        throw new ErrorApi(409, 'conflict', `La columna ${columna} no existe.`)
      }
      proceso.status = columna
      proceso.kanban_order = Number(posicion ?? 1)
      return { estado: 200, cuerpo: conDatos(proceso) }
    }

    if (subrecurso === 'timer') {
      exigirPermiso(actual, 'tasks', 'edit')
      if (metodo === 'POST') {
        if (proceso.timer_activo) {
          throw new ErrorApi(409, 'conflict', 'Ya hay un cronómetro activo en este proceso.')
        }
        proceso.timer_activo = {
          id: 900 + proceso.id,
          staff_id: actual.id,
          start_time: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
        }
        return { estado: 201, cuerpo: conDatos(proceso.timer_activo) }
      }
      if (metodo === 'DELETE') {
        if (!proceso.timer_activo) {
          throw new ErrorApi(409, 'conflict', 'No hay ningún cronómetro activo.')
        }
        proceso.timer_activo = null
        return { estado: 204, cuerpo: null }
      }
    }

    throw new ErrorApi(404, 'not_found', 'Ruta de proceso desconocida.')
  }

  if (recurso === 'files' && metodo === 'GET' && resto[1] === 'download') {
    const archivo = buscarO404(ARCHIVOS, Number(resto[0]), 'archivo')
    // El mock no sirve binarios: devuelve la metadata para que el frontend pueda armar la interfaz
    // sin depender de un archivo real. Lo que sí replica es el 404 y el permiso.
    return { estado: 200, cuerpo: conDatos({ ...archivo, mock: true }) }
  }

  throw new ErrorApi(404, 'not_found', `Recurso desconocido: "${recurso ?? ''}".`)
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------

export const servidor = createServer((peticion, respuesta) => {
  const url = new URL(peticion.url, `http://localhost:${PUERTO}`)
  cabecerasCors(respuesta, peticion.headers.origin ?? null)

  // El preflight nunca lleva credenciales ni cuerpo: se contesta antes de cualquier chequeo de token.
  if (peticion.method === 'OPTIONS') {
    respuesta.writeHead(204)
    respuesta.end()
    return
  }

  const partes = url.pathname.split('/').filter(Boolean)
  if (partes[0] !== 'api' || partes[1] !== 'v1') {
    responder(respuesta, 404, { error: { code: 'not_found', message: 'La base de la API es /api/v1.' } })
    return
  }

  // Se aceptan las dos cabeceras, igual que la API real: detras de cPanel PHP corre como CGI y
  // Apache no propaga `Authorization` por defecto.
  const token = (peticion.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    || peticion.headers['x-api-key']
    || null

  resolverRuta(peticion.method, partes.slice(2), url.searchParams, token, () => leerCuerpo(peticion), peticion)
    .then(({ estado, cuerpo, transmitir }) => {
      // Un endpoint que transmite escribe el mismo la respuesta: no hay `{estado, cuerpo}` que
      // serializar, porque el cuerpo se va armando durante varios segundos.
      if (transmitir !== undefined) {
        transmitir(respuesta)
        return
      }

      responder(respuesta, estado, cuerpo)
    })
    .catch((error) => {
      if (error instanceof ErrorApi) {
        const cuerpo = { error: { code: error.codigo, message: error.message } }
        if (error.detalles) cuerpo.error.details = error.detalles
        responder(respuesta, error.estado, cuerpo)
        return
      }
      // Nunca se filtra el stack al cliente, ni siquiera en el mock: el frontend debe programarse
      // contra la forma real del error, no contra una que solo existe en desarrollo.
      console.error('[mock] error no controlado:', error)
      responder(respuesta, 500, { error: { code: 'server_error', message: 'Error interno del mock.' } })
    })
})

// Solo escucha si se ejecuta directamente: las pruebas lo importan y eligen su propio puerto.
// Se comparan rutas resueltas y no el final de la URL: en Windows `process.argv[1]` viene con
// barras invertidas, `split('/')` no parte nada y la comparacion fallaba siempre — el mock salia
// con codigo 0 sin escuchar.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  servidor.listen(PUERTO, () => {
    console.log(`[mock] API v1 en http://localhost:${PUERTO}/api/v1`)
    console.log(`[mock] origenes permitidos: ${ORIGENES.join(', ')}`)
    console.log('[mock] acceso: ana@wiwo.me / mock1234 (admin) · bruno@wiwo.me / mock1234 (con 2FA)')
  })
}

/** Datos publicos de un contacto, en la forma del contrato. */
function presentarContacto (contacto) {
  return {
    id: contacto.id,
    client_id: contacto.client_id,
    firstname: contacto.firstname,
    lastname: contacto.lastname,
    full_name: contacto.full_name,
    email: contacto.email,
    phonenumber: contacto.phonenumber,
    title: contacto.title,
    is_primary: contacto.is_primary,
    email_verified: contacto.email_verified,
    last_login: contacto.last_login,
    direction: contacto.direction
  }
}

/**
 * Secciones vivas del portal para un contacto.
 *
 * Mismo criterio que la API real: las que dependen de un permiso salen de `permissions`, y archivos,
 * anuncios, ayuda y perfil los ve cualquier contacto logueado.
 */
function seccionesDelPortal (contacto) {
  const conPermiso = ['projects', 'invoices', 'estimates', 'proposals', 'contracts', 'support']
    .filter((f) => contacto.permissions.includes(f))

  return [...conPermiso, 'files', 'announcements', 'kb', 'profile']
}
