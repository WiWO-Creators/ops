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
import { ErrorApi, aplicarConsulta, campoFiltrable, coincideEnLista, leerIncludes } from './consulta.js'
import * as sesion from './sesion.js'
import {
  ADMINS_DE_CLIENTE, AREAS, ARCHIVOS, CAMPOS_PERSONALIZADOS, CHECKLIST, CLIENTES, COMENTARIOS, CRONOMETROS,
  DEPARTAMENTOS, EMPRESAS_DEL_GRUPO, ESPACIOS, ESTADOS_ESPACIO, ESTADOS_PROCESO, ETIQUETAS, HITOS,
  AVISOS_CONTACTO, CONTACTOS, OPCIONES_AREA_EN_TAREAS, PRIORIDADES, PROCESOS, PROCESOS_POR_AREA,
  RESERVAS, ROLES, SALAS, STAFF, VALORES_CAMPOS
} from './datos.js'

const PUERTO = Number(process.env.PORT ?? 3001)
/** Un tipo por espacio permite comprobar pertenencia sin duplicar catálogos de producción. */
const TIPOS_PROCESO = ESPACIOS.map((espacio) => ({
  id: espacio.id, project_id: espacio.id, name: 'General', label_color: '#64748b',
  text_color: '#ffffff', order: 1, eta_dias: null
}))
const ORIGENES = (process.env.ORIGENES ?? 'http://localhost:3000').split(',').map((o) => o.trim())

/** Recursos sobre los que se declaran permisos, con las acciones posibles. */
const ACCIONES = ['view', 'create', 'edit', 'delete']
const RECURSOS_CON_PERMISO = ['tasks', 'projects', 'customers', 'staff', 'leads', 'invoices']

/** Las capacidades de un recurso. Solo los Espacios tienen una fuera de las cuatro de siempre. */
function capacidadesDe (recurso) {
  return recurso === 'projects' ? [...ACCIONES, 'edit_milestones'] : [...ACCIONES]
}

/**
 * Lo que puede cualquiera que no sea administrador, que ahora es lo mismo para todo el mundo.
 *
 * El modelo nuevo no reparte casillas por persona: quien no es admin trabaja con este juego fijo, y
 * lo que cambia entre dos personas es CUANTAS filas ve, que sale del arbol y no de aca.
 */
const PERMISOS_DE_PERSONA = {
  tasks: ['view', 'create', 'edit', 'delete'],
  projects: ['view', 'create', 'edit', 'delete', 'edit_milestones'],
  customers: ['view', 'create', 'edit', 'delete'],
  staff: ['view'],
  leads: ['view', 'delete']
}

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
  return { ...publico, area_ids: areasDePersona(staff) }
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
  const empresa = EMPRESAS_DEL_GRUPO.find((e) => e.id === staff.empresa_id) ?? null

  return {
    ...presentarStaff(staff),
    role: rol,
    empresa,
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
      espacios: new Set(suyos.map((p) => p.project?.id).filter((id) => id !== undefined)).size,
      // Un contador por estado que la persona efectivamente tiene, igual que la API real. Faltaba, y
      // sin el la ficha reventaba en `ResumenTareasPersona`: el contrato lo declara obligatorio.
      por_estado: [...suyos.reduce(
        (cuenta, p) => cuenta.set(p.status, (cuenta.get(p.status) ?? 0) + 1),
        new Map()
      )].map(([status, total]) => ({ status, total }))
    }
  }
}

/**
 * Arma el mapa de permisos que el frontend usa para podar columnas y acciones.
 *
 * Un admin puede todo, incluidas las facturas. El resto recibe siempre `PERMISOS_DE_PERSONA`: no
 * ve facturas, y de las personas solo el listado. Esas dos son las que dejan alcanzable el 403
 * desde el mock; sin un permiso denegado de verdad, la rama de "sin permiso" del frontend no se
 * ejercita hasta produccion.
 */
function permisosDe (staff) {
  if (staff.is_admin === true || staff.is_superadmin === true) {
    return Object.fromEntries(RECURSOS_CON_PERMISO.map((recurso) => [recurso, capacidadesDe(recurso)]))
  }

  return Object.fromEntries(Object.entries(PERMISOS_DE_PERSONA).map(([recurso, capacidades]) => [recurso, [...capacidades]]))
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
  // La whitelist de `RecursoProcesos::consulta()`, campo por campo: la interfaz ofrece filtrar por
  // todo lo que la Tarea tiene, y si el mock conoce la mitad, la mitad de los filtros falla aca y
  // funciona en produccion —o al reves—.
  filtros: {
    status: coincideEnLista((p) => p.status),
    priority: coincideEnLista((p) => p.priority),
    project_id: coincideEnLista((p) => p.project?.id ?? null),
    milestone_id: coincideEnLista((p) => p.milestone?.id ?? null),
    clientid: coincideEnLista((p) => (
      p.rel_type === 'customer' ? p.rel_id : ESPACIOS.find((e) => e.id === p.project?.id)?.clientid ?? null
    )),
    // Los dos sueltos, por id, que la API conserva de la interfaz vieja.
    follower: coincideEnLista((p) => p.followers.map((f) => f.id)),
    tag: coincideEnLista((p) => p.tags.map((t) => t.id)),
    // Los cuatro rangos: dos sobre el vencimiento y dos sobre el inicio.
    date_from: (p, v) => p.due_date >= v,
    date_to: (p, v) => p.due_date <= v,
    start_from: (p, v) => p.start_date >= v,
    start_to: (p, v) => p.start_date <= v,

    id: campoFiltrable((p) => p.id, 'numero'),
    name: campoFiltrable((p) => p.name),
    patente: campoFiltrable((p) => p.patente),
    description: campoFiltrable((p) => p.description),
    // Por id acepta varios; por nombre es texto y va de a uno, igual que en la API.
    assignee: campoFiltrable((p) => p.assignees.map((a) => a.id), 'numero'),
    assignees: campoFiltrable((p) => p.assignees.map((a) => a.full_name)),
    followers: campoFiltrable((p) => p.followers.map((f) => f.full_name)),
    tags: campoFiltrable((p) => p.tags.map((t) => t.name)),
    task_type: campoFiltrable((p) => p.task_type?.id ?? null, 'numero'),
    task_type_name: campoFiltrable((p) => p.task_type?.name ?? null),
    added_from: campoFiltrable((p) => p.added_from, 'numero'),
    // `completed` no es una columna ni aca ni alla: sale del estado.
    completed: campoFiltrable((p) => (p.status === ESTADO_COMPLETADO ? 1 : 0), 'numero'),
    billable: campoFiltrable((p) => Number(p.billable), 'numero'),
    billed: campoFiltrable((p) => Number(p.billed), 'numero'),
    is_public: campoFiltrable((p) => Number(p.is_public), 'numero'),
    visible_to_client: campoFiltrable((p) => Number(p.visible_to_client), 'numero'),
    recurring: campoFiltrable((p) => Number(p.recurring), 'numero'),
    hourly_rate: campoFiltrable((p) => p.hourly_rate, 'numero'),
    estimated_hours: campoFiltrable((p) => p.estimated_hours, 'numero'),
    comments: campoFiltrable((p) => p.counts.comments, 'numero'),
    checklist: campoFiltrable((p) => p.counts.checklist, 'numero'),
    checklist_done: campoFiltrable((p) => p.counts.checklist_done, 'numero'),
    attachments: campoFiltrable((p) => p.counts.attachments, 'numero'),
    // Los cinco de `wiwo_core`: el fixture no los trae, asi que responden como lo que son —vacios—
    // en vez de con un 422 que haria creer que el filtro no existe.
    iterations: campoFiltrable((p) => p.counts.iterations ?? null, 'numero'),
    n_iteraciones: campoFiltrable((p) => p.counts.iterations ?? null, 'numero'),
    eta: campoFiltrable((p) => p.eta ?? null, 'fecha'),
    desviacion: campoFiltrable((p) => p.desviacion_dias ?? null, 'numero'),
    estado_sla: campoFiltrable((p) => p.estado_sla ?? null),
    aprobacion: campoFiltrable((p) => p.aprobacion?.estado ?? null),
    start_date: campoFiltrable((p) => p.start_date, 'fecha'),
    due_date: campoFiltrable((p) => p.due_date, 'fecha'),
    date_added: campoFiltrable((p) => p.date_added, 'fecha'),
    date_finished: campoFiltrable((p) => p.date_finished, 'fecha')
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

/**
 * Meeting Papers. Sin filtros: la pestaña lista las del Espacio y nada mas.
 *
 * Las claves de orden son las del contrato (`date_added`, `meeting_date`), no los nombres de columna
 * del backend: el frontend nunca ve `creada_en`.
 */
const CONSULTA_ACTAS = {
  filtros: {},
  orden: ['title', 'date_added', 'meeting_date'],
  busqueda: ['title', 'client']
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
 * El estado inicial, cierre, tarifa y recurrencia siguen el contrato del alta completa.
 *
 * @param {Record<string, unknown>} entrada cuerpo de la peticion
 * @param {{id: number}} autor staff autenticado, que queda en `added_from`
 * @returns {object} el Proceso nuevo, en la forma del contrato
 * @throws {ErrorApi} 422 con `details` por campo
 */
function crearProceso (entrada, autor) {
  if (entrada === null || typeof entrada !== 'object' || Array.isArray(entrada)) {
    throw new ErrorApi(422, 'validation_failed', 'El cuerpo debe ser un objeto.')
  }
  const detalles = {}
  const aceptados = new Set([
    'name', 'description', 'start_date', 'due_date', 'priority', 'billable', 'estimated_hours',
    'milestone', 'task_type', 'rel_type', 'rel_id', 'assignees', 'followers', 'tags', 'status',
    'hourly_rate', 'is_public', 'visible_to_client', 'recurring', 'repeat_every', 'recurring_type',
    'cycles', 'completed_at'
  ])
  for (const clave of Object.keys(entrada)) {
    if (!aceptados.has(clave)) detalles[clave] = ['no_editable']
  }
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

  const inicio = entrada.start_date ?? new Date().toISOString().slice(0, 10)
  if (entrada.due_date && entrada.due_date < inicio) detalles.due_date = ['anterior_al_inicio']
  const estado = entrada.status ?? 1
  if (typeof estado === 'boolean' || !ESTADOS_PROCESO.some((e) => e.id === Number(estado))) {
    detalles.status = ['fuera_de_rango']
  }
  const booleanos = {}
  for (const clave of ['billable', 'is_public', 'visible_to_client']) {
    const valor = entrada[clave] ?? false
    if (![true, false, 0, 1, '0', '1'].includes(valor)) detalles[clave] = ['no_booleano']
    booleanos[clave] = [true, 1, '1'].includes(valor)
  }
  const tarifa = Number(entrada.hourly_rate ?? 0)
  if ((entrada.hourly_rate != null && !['string', 'number'].includes(typeof entrada.hourly_rate)) || !Number.isFinite(tarifa) || tarifa < 0 || tarifa > 999999999.99) {
    detalles.hourly_rate = ['invalid']
  }
  const horas = entrada.estimated_hours == null || entrada.estimated_hours === '' ? null : Number(entrada.estimated_hours)
  if (horas !== null && (!['string', 'number'].includes(typeof entrada.estimated_hours) || !Number.isFinite(horas) || horas < 0)) {
    detalles.estimated_hours = ['invalid']
  }
  const ahora = new Date().toISOString()
  let cierre = Number(estado) === 5 ? ahora : null
  if (Object.hasOwn(entrada, 'completed_at')) {
    cierre = entrada.completed_at || null
    if (Number(estado) !== 5) detalles.completed_at = ['no_completado']
    if (cierre !== null && (typeof cierre !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(cierre) || !Number.isFinite(Date.parse(cierre)))) {
      detalles.completed_at = ['invalid']
    }
  }
  if (cierre !== null && !detalles.completed_at) {
    cierre = new Date(cierre).toISOString()
    if (cierre > ahora) detalles.completed_at = ['futura']
    else if (cierre.slice(0, 10) < inicio) detalles.completed_at = ['anterior_al_inicio']
  }
  const recurrente = [true, 1, '1'].includes(entrada.recurring)
  const frecuencia = Number(entrada.repeat_every)
  const ciclos = Number(entrada.cycles ?? 0)
  const clavesRecurrencia = ['recurring', 'repeat_every', 'recurring_type', 'cycles']
  if (clavesRecurrencia.some((clave) => Object.hasOwn(entrada, clave))) {
    if (!Object.hasOwn(entrada, 'recurring')) detalles.recurring = ['requerido']
    else if (![true, false, 0, 1, '0', '1'].includes(entrada.recurring)) detalles.recurring = ['no_booleano']
    if (process.env.WIWO_PROCESOS_RECURRENTES === '0') detalles.recurring = ['recurrencia_apagada']
    if (recurrente) {
      if (!['string', 'number'].includes(typeof entrada.repeat_every) || !Number.isInteger(frecuencia) || frecuencia < 1 || frecuencia > 365) detalles.repeat_every = ['fuera_de_rango']
      if (!['day', 'week', 'month', 'year'].includes(entrada.recurring_type)) detalles.recurring_type = ['no_soportado']
      if ((Object.hasOwn(entrada, 'cycles') && !['string', 'number'].includes(typeof entrada.cycles)) || !Number.isInteger(ciclos) || ciclos < 0 || ciclos > 365) detalles.cycles = ['fuera_de_rango']
    } else {
      for (const clave of clavesRecurrencia.slice(1)) {
        if (Object.hasOwn(entrada, clave)) detalles[clave] = ['sobra_sin_recurrencia']
      }
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

  const hito = entrada.milestone == null || Number(entrada.milestone) === 0
    ? null : HITOS.find((h) => h.id === Number(entrada.milestone))
  if (entrada.milestone != null && Number(entrada.milestone) !== 0 && (!hito || hito.project_id !== espacio?.id)) {
    detalles.milestone = ['no_pertenece_al_espacio']
  }
  const tipo = entrada.task_type == null ? null : TIPOS_PROCESO.find((t) => t.id === Number(entrada.task_type))
  if (entrada.task_type != null && (!tipo || tipo.project_id !== espacio?.id)) detalles.task_type = ['no_pertenece_al_espacio']

  const asignados = resolverStaff(entrada.assignees, detalles, 'assignees')
  const seguidores = resolverStaff(entrada.followers, detalles, 'followers')
  // Igual que la API: un numero es un id del catalogo y tiene que existir (si no, 422); un nombre
  // que no existe se crea, que es la etiqueta personalizada.
  const pedidas = Array.isArray(entrada.tags) ? entrada.tags : []
  const etiquetas = []
  const nuevas = []
  for (const pedida of pedidas) {
    if (typeof pedida === 'number') {
      const delCatalogo = ETIQUETAS.find((e) => e.id === pedida)
      if (!delCatalogo) detalles.tags = ['no_existe']
      else etiquetas.push(delCatalogo)
      continue
    }

    const nombre = String(pedida).trim()
    const existente = [...ETIQUETAS, ...nuevas].find((e) => e.name.toLowerCase() === nombre.toLowerCase())
    if (existente) {
      etiquetas.push(existente)
      continue
    }

    const nueva = { id: Math.max(0, ...ETIQUETAS.map((e) => e.id), ...nuevas.map((e) => e.id)) + 1, name: nombre }
    nuevas.push(nueva)
    etiquetas.push(nueva)
  }

  if (Object.keys(detalles).length > 0) {
    throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden guardar.', detalles)
  }

  ETIQUETAS.push(...nuevas)

  const id = Math.max(...PROCESOS.map((p) => p.id)) + 1

  return {
    id,
    // El backend la asigna al leer, no al crear, pero la respuesta del alta ya sale por el mismo
    // presentador: para quien consume, un Proceso recien creado ya trae patente.
    patente: patenteDeAlta(espacio),
    name: nombre,
    description: typeof entrada.description === 'string' ? entrada.description : null,
    status: Number(estado),
    priority: prioridad,
    start_date: inicio,
    due_date: entrada.due_date ?? null,
    date_added: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    date_finished: cierre,
    added_from: autor.id,
    rel_type: relType,
    rel_id: relId,
    project: espacio ? { id: espacio.id, name: espacio.name } : null,
    milestone: hito ? { id: hito.id, name: hito.name } : null,
    task_type: tipo ? { id: tipo.id, name: tipo.name, label_color: tipo.label_color, text_color: tipo.text_color } : null,
    estimated_hours: horas,
    ...booleanos,
    billed: false,
    hourly_rate: Math.round(tarifa * 100) / 100,
    recurring: recurrente,
    repeat_every: recurrente ? frecuencia : 0,
    recurring_type: recurrente ? entrada.recurring_type : null,
    cycles: recurrente ? ciclos : 0,
    kanban_order: Math.max(0, ...PROCESOS.filter((p) => p.status === Number(estado)).map((p) => p.kanban_order)) + 1,
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
 * Patente del Proceso que se acaba de crear, con el correlativo que sigue dentro de su Espacio.
 *
 * Cuenta sobre `PROCESOS` en vez de llevar un contador aparte: el mock se reinicia con el proceso y
 * un contador propio quedaria desfasado apenas alguien borre una tarea.
 */
function patenteDeAlta (espacio) {
  const clave = espacio === null ? 'WIW' : `ESP-${String(espacio.id).padStart(3, '0')}`
  const digitos = espacio === null ? 4 : 2
  const usados = PROCESOS.filter((p) => typeof p.patente === 'string' && p.patente.startsWith(`${clave}-`))
    .map((p) => Number(p.patente.slice(clave.length + 1)))

  return `${clave}-${String(Math.max(0, ...usados) + 1).padStart(digitos, '0')}`
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

/**
 * Descripcion de un item de la lista de control, como la guarda la API.
 *
 * Replica `ChecklistProceso::descripcion()`: sin HTML salvo los saltos, nunca vacia y con los saltos
 * de linea convertidos a `<br />` (`nl2br()`). Ese HTML no es un detalle del servidor: el panel lo
 * vuelve a texto plano al pintarlo, y un mock que devolviera el texto crudo no probaria ese paso.
 */
function descripcionDeItem (valor) {
  const texto = typeof valor === 'string' ? valor.replace(/<[^>]*>/g, '').trim() : ''

  if (texto === '' || texto.length > 5000) {
    throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden guardar.', { description: ['invalid'] })
  }

  return texto.replace(/\n/g, '<br />\n')
}

/** Exige que el staff tenga una accion sobre un recurso, o lanza 403. */
function exigirPermiso (staff, recurso, accion) {
  const permisos = permisosDe(staff)
  if (!(permisos[recurso] ?? []).includes(accion)) {
    throw new ErrorApi(403, 'forbidden', `Sin permiso para ${accion} sobre ${recurso}.`)
  }
}

/**
 * Los incidentes que este mock lleva en memoria.
 *
 * Dos filas de semilla con los dos origenes que se ven distinto en la pantalla: uno de la API, con
 * archivo, linea y traza de PHP, y uno del panel, sin nada de eso. Un listado con un solo origen no
 * distingue "muestra el origen" de "siempre dice lo mismo".
 */
const INCIDENTES = [
  {
    incidente: 'a1b2c3d4',
    origen: 'api',
    tipo: 'PDOException',
    mensaje: 'SQLSTATE[42S22]: Column not found: 1054 Unknown column x',
    archivo: 'Recursos/RecursoTareas.php',
    linea: 412,
    metodo: 'GET',
    uri: '/api/v1/tasks?page=1',
    sujeto_tipo: 'staff',
    sujeto_id: 1,
    sujeto_nombre: 'Dev Prueba',
    traza: '#0 Nucleo/Bd.php(88): PDO->prepare()\n#1 Recursos/RecursoTareas.php(412)',
    creado_en: '2026-09-13T10:12:00-04:00'
  },
  {
    incidente: 'b2c3d4e5',
    origen: 'panel',
    tipo: 'TypeError',
    mensaje: "Cannot read properties of undefined (reading 'nombre')",
    archivo: '',
    linea: 0,
    metodo: 'VISTA',
    uri: '/procesos/tablero',
    sujeto_tipo: 'staff',
    sujeto_id: 1,
    sujeto_nombre: 'Dev Prueba',
    traza: 'TypeError: Cannot read properties of undefined\n    at Tablero (page-abc.js:1:2)',
    creado_en: '2026-09-13T11:40:00-04:00'
  }
]

/** Tope de reportes por sujeto y hora, igual que `RecursoIncidentes::exigirMargen()`. */
const TOPE_REPORTES = 30

/** Origenes que el alta acepta: la API no se reporta a si misma desde afuera. */
const ORIGENES_REPORTABLES = ['panel', 'portal']

/**
 * `GET /incidentes`, `GET /incidentes/{codigo}` y `POST /incidentes`.
 *
 * La lectura exige superadministrador —trae el mensaje crudo y la traza— y el alta solo sesion:
 * quien sufre el error es cualquiera, y pedirle permisos para poder reportarlo seria dejar sin
 * codigo justo a quien mas lo necesita.
 */
async function incidentesRuta (metodo, resto, parametros, actual, cuerpo) {
  if (metodo === 'POST') {
    if (resto.length > 0) throw new ErrorApi(404, 'not_found', 'Subrecurso desconocido.')

    // `cuerpo` es perezoso en este mock: se lee cuando la ruta lo pide, no antes.
    return { estado: 201, cuerpo: conDatos({ incidente: registrarReporte(await cuerpo(), actual) }) }
  }

  if (metodo !== 'GET') throw new ErrorApi(404, 'not_found', 'Subrecurso desconocido.')

  exigirSuperadmin(actual, 'puede ver los incidentes de la API')

  if (resto.length === 0) {
    const { filas, paginacion } = aplicarConsulta(
      INCIDENTES.map(({ traza, ...fila }) => fila),
      parametros,
      { orden: ['creado_en'], busqueda: ['mensaje', 'tipo', 'uri'] }
    )

    return { estado: 200, cuerpo: conDatos(filas, { pagination: paginacion }) }
  }

  const fila = INCIDENTES.find((incidente) => incidente.incidente === resto[0])

  if (fila === undefined) {
    throw new ErrorApi(404, 'not_found', 'No existe ese incidente. Los de más de 30 días ya se borraron.')
  }

  return { estado: 200, cuerpo: conDatos(fila) }
}

/**
 * Guarda un reporte del navegador y devuelve su codigo.
 *
 * Valida lo mismo que la API y con los mismos codigos, porque el panel muestra esos `details` tal
 * cual: un mock mas permisivo dejaria pasar un cuerpo que en produccion vuelve 422.
 */
function registrarReporte (cuerpo, actual) {
  const errores = {}
  const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '')

  if (texto(cuerpo.origen) === '') errores.origen = ['required']
  else if (!ORIGENES_REPORTABLES.includes(cuerpo.origen)) errores.origen = ['invalid']

  if (texto(cuerpo.mensaje) === '') errores.mensaje = ['required']

  for (const [campo, tope] of [['tipo', 190], ['uri', 255], ['metodo', 10], ['traza', 8000]]) {
    if (texto(cuerpo[campo]).length > tope) errores[campo] = ['too_long']
  }

  if (Object.keys(errores).length > 0) {
    throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden guardar.', errores)
  }

  const mios = INCIDENTES.filter((fila) => fila.origen !== 'api' && fila.sujeto_id === actual.id)

  if (mios.length >= TOPE_REPORTES) {
    throw new ErrorApi(429, 'rate_limited', 'Ya se reportaron demasiados errores desde esta sesión. Probá de nuevo en un rato.')
  }

  const incidente = [...crypto.getRandomValues(new Uint8Array(4))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  INCIDENTES.unshift({
    incidente,
    origen: cuerpo.origen,
    tipo: texto(cuerpo.tipo) === '' ? 'ErrorDelPanel' : cuerpo.tipo,
    mensaje: texto(cuerpo.mensaje).slice(0, 2000),
    archivo: '',
    linea: 0,
    metodo: texto(cuerpo.metodo) === '' ? 'VISTA' : cuerpo.metodo,
    uri: texto(cuerpo.uri),
    sujeto_tipo: 'staff',
    sujeto_id: actual.id,
    sujeto_nombre: `${actual.firstname} ${actual.lastname}`.trim(),
    traza: texto(cuerpo.traza) === '' ? null : cuerpo.traza,
    creado_en: new Date().toISOString()
  })

  return incidente
}

/** Exige superadministrador, o lanza 403. Mismo texto que `Acceso\\Permisos::exigirSuperadmin()`. */
function exigirSuperadmin (staff, queProtege) {
  if (staff.is_superadmin !== true) {
    throw new ErrorApi(403, 'forbidden', `Solo un superadministrador ${queProtege}.`)
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

/** Largo maximo del nombre de un area, tomado de `tblareas.name`. */
const LARGO_NOMBRE_AREA = 191

/** Mensaje del 409 al intentar renombrar, redactado para mostrarse tal cual en la pantalla. */
const RENOMBRE_BLOQUEADO = 'El nombre de un área no se puede cambiar acá: los Procesos guardan el nombre, no el id, y renombrarla los desconectaría en silencio. Pedilo si hace falta.'

/** Mensaje del 403 de `/jerarquia`, redactado para mostrarse tal cual en la pantalla. */
const SIN_JERARQUIA = 'No diriges ningún área, así que no hay organigrama que mostrarte. Si deberías dirigir una, pídeselo a quien administre el sistema.'

/**
 * Devuelve las membresías, incluyendo fixtures anteriores con solo área principal.
 * @param {object} persona la fila de staff
 * @returns {number[]} identificadores de sus áreas
 */
function areasDePersona (persona) {
  return persona.area_ids ?? (persona.area_id == null ? [] : [persona.area_id])
}

/**
 * Guarda membresías únicas y conserva la principal mientras siga asignada.
 * @param {object} persona la fila que se actualiza
 * @param {number[]} areas membresías validadas
 * @returns {void}
 */
function guardarAreasDePersona (persona, areas) {
  persona.area_ids = [...new Set(areas)]
  if (!persona.area_ids.includes(persona.area_id)) persona.area_id = persona.area_ids[0] ?? null
}

/**
 * Valida la edición de membresías antes de cualquier escritura de la persona.
 * @param {object} datos campos recibidos por ficha o administración
 * @returns {number[]|undefined} pertenencias propuestas, o undefined si no se editan
 * @throws {ErrorApi} 422 para campos inválidos o principal fuera de la lista
 */
function validarAreasDePersona (datos) {
  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) {
    throw new ErrorApi(422, 'validation_failed', 'Revisá los campos de la persona.')
  }
  let areasNuevas
  if (datos.area_ids !== undefined || datos.area_id !== undefined) {
    const entrada = datos.area_ids !== undefined ? datos.area_ids : datos.area_id === null ? [] : [datos.area_id]
    const campo = datos.area_ids !== undefined ? 'area_ids' : 'area_id'
    if (!Array.isArray(entrada) || entrada.some((id) =>
      !((typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id))) &&
        Number.isInteger(Number(id)) && AREAS.some((area) => area.id === Number(id))))) {
      throw new ErrorApi(422, 'validation_failed', 'Revisá los campos de la persona.', {
        [campo]: ['no_existe']
      })
    }
    areasNuevas = entrada.map(Number)
    if (datos.area_ids !== undefined && datos.area_id !== undefined) {
      const principalValida = datos.area_id === null ? areasNuevas.length === 0
        : (typeof datos.area_id === 'number' || (typeof datos.area_id === 'string' && /^\d+$/.test(datos.area_id))) &&
          areasNuevas.includes(Number(datos.area_id))
      if (!principalValida) {
        throw new ErrorApi(422, 'validation_failed', 'Revisá los campos de la persona.', {
          area_id: ['no_pertenece']
        })
      }
    }
  }
  return areasNuevas
}

/**
 * Una persona, con lo unico que la jerarquia necesita de ella.
 *
 * `active` viaja porque una baja puede seguir colgada de un area: la pantalla la marca en vez de
 * esconderla, que es lo que deja un area "con 3 personas" donde solo trabajan 2.
 */
function personaDeJerarquia (staff) {
  return { id: staff.id, full_name: staff.full_name, active: staff.active }
}

/**
 * Un area con la forma que sirve `/jerarquia`.
 *
 * @param {object} area la fila cruda de `AREAS`
 * @param {object} actual quien pide, para resolver `editable`
 */
function areaDeJerarquia (area, actual) {
  return {
    id: area.id,
    name: area.name,
    area_superior_id: area.area_superior_id,
    jefe_staffid: area.jefe_staffid,
    editable: puedeEditarArea(actual, area),
    // `false` = ese nombre no figura entre las opciones de los Procesos, asi que el area no cruza con
    // ninguno. No es un error: simplemente no trae nada, y por eso hay que hacerlo visible.
    en_tareas: OPCIONES_AREA_EN_TAREAS.some((opcion) => mismoNombre(opcion, area.name)),
    // Todo el mundo, no solo quien esta activo: una baja puede seguir colgada del area y el contrato
    // la emite con `active: false` para que la pantalla la marque en vez de esconderla.
    personas: STAFF.filter((persona) => !persona.is_not_staff && areasDePersona(persona).includes(area.id))
      .map(personaDeJerarquia)
  }
}

/** Compara dos nombres de area como los compara la API: sin mayusculas ni espacios de los bordes. */
function mismoNombre (uno, otro) {
  return String(uno).trim().toLowerCase() === String(otro).trim().toLowerCase()
}

/** El staff activo que se reparte entre las areas. */
function staffActivo () {
  return STAFF.filter((persona) => persona.active && !persona.is_not_staff)
}

/**
 * Los ids del area dada y de todo lo que cuelga de ella, a cualquier profundidad.
 *
 * @param {number} id el area de la que se parte
 * @returns {Set<number>} el id propio incluido
 */
function descendenciaDeArea (id) {
  const dentro = new Set([id])
  let crecio = true

  // Barridos sucesivos en vez de recursion: el arbol viene plano y asi un dato con un ciclo ya
  // guardado termina igual en vez de desbordar la pila.
  while (crecio) {
    crecio = false

    for (const area of AREAS) {
      if (area.area_superior_id !== null && dentro.has(area.area_superior_id) && !dentro.has(area.id)) {
        dentro.add(area.id)
        crecio = true
      }
    }
  }

  return dentro
}

/**
 * Que areas ve esta persona, y cuales puede editar.
 *
 * Quien administra ve el organigrama entero y lo edita entero. Quien no, ve **su rama** —las areas
 * que dirige y todo lo que cuelga de ellas— pero solo edita las que dirige: puede reorganizar lo
 * suyo sin poder tocar el area de al lado.
 *
 * @param {object} actual la persona que pide
 * @returns {{visibles: object[], esAdmin: boolean}}
 */
function alcanceDeJerarquia (actual) {
  const esAdmin = actual.is_superadmin === true || actual.is_admin === true

  if (esAdmin) return { visibles: AREAS, esAdmin }

  const propias = AREAS.filter((area) => area.jefe_staffid === actual.id)
  const suRama = new Set(propias.flatMap((area) => [...descendenciaDeArea(area.id)]))

  return { visibles: AREAS.filter((area) => suRama.has(area.id)), esAdmin }
}

/**
 * Todo lo que sirve `GET /jerarquia`, para quien pide.
 *
 * Vive aparte porque el `DELETE` devuelve exactamente esto: borrar un area puede dejar huerfanas a
 * las que colgaban de ella, y la pantalla necesita el estado completo para repintarse bien.
 */
function arbolCompleto (actual) {
  const { visibles, esAdmin } = alcanceDeJerarquia(actual)
  const activos = staffActivo()

  return {
    hay_organigrama: AREAS.length > 0,
    es_admin: esAdmin,
    areas: visibles.map((area) => areaDeJerarquia(area, actual)),
    sin_area: activos.filter((persona) => areasDePersona(persona).length === 0).map(personaDeJerarquia),
    asignables: activos.map(personaDeJerarquia)
  }
}

/**
 * Lanza el 409 si el area esta en uso, con las tres cuentas ya redactadas.
 *
 * La tercera es la que sorprende: un area puede verse vacia en la pantalla —sin gente y sin hijas— y
 * aun asi no poder borrarse, porque hay Procesos marcados con ese nombre. Por eso el mensaje las dice
 * las tres aunque dos esten en cero: quien lo lee tiene que entender cual de las tres lo frena.
 *
 * @param {object} area el area que se quiere borrar
 * @throws {ErrorApi} 409 si algo la retiene
 */
function exigirAreaLibre (area) {
  const gente = staffActivo().filter((persona) => areasDePersona(persona).includes(area.id)).length
  const hijas = AREAS.filter((otra) => otra.area_superior_id === area.id).length
  const procesos = PROCESOS_POR_AREA[area.name] ?? 0

  if (gente === 0 && hijas === 0 && procesos === 0) return

  throw new ErrorApi(409, 'conflict',
    `El área "${area.name}" está en uso: ${gente} persona(s) asignada(s), ${hijas} área(s) que ` +
    `dependen de ella y ${procesos} Proceso(s) marcado(s) con ese nombre. Movelos antes de borrarla.`)
}

/** `true` si esta persona puede escribir sobre esa area. */
function puedeEditarArea (actual, area) {
  return actual.is_superadmin === true || actual.is_admin === true || area.jefe_staffid === actual.id
}

/**
 * Valida el cuerpo de un alta o una edicion de area y devuelve los campos ya normalizados.
 *
 * Junta TODOS los motivos antes de lanzar: un formulario con dos campos mal completados tiene que
 * enterarse de los dos de una vez, no de a uno por viaje.
 *
 * `area_superior_id` y `jefe_staffid` distinguen "no vino" de "vino en null": lo primero es no
 * tocar el campo y lo segundo es soltarlo. Por eso el retorno usa la ausencia de la clave para la
 * ausencia del campo, y el llamador solo escribe lo que esta presente.
 *
 * @param {object} datos cuerpo crudo de la peticion
 * @param {object|null} areaEditada el area que se esta editando, o `null` en un alta
 * @returns {{name?:string, area_superior_id?:number|null, jefe_staffid?:number|null}}
 * @throws {ErrorApi} 422 con un motivo por campo
 */
function validarArea (datos, areaEditada) {
  const detalles = {}
  const salida = {}

  if (datos.name !== undefined || areaEditada === null) {
    const nombre = String(datos.name ?? '').trim()

    // Renombrar esta bloqueado: los Procesos guardan el NOMBRE del area y no su id, asi que
    // cambiarlo los desconectaria en silencio. Reenviar el mismo nombre no es renombrar —la
    // comparacion ignora mayusculas y bordes—, asi que el formulario puede mandar el cuerpo entero.
    if (areaEditada !== null && nombre !== '' && !mismoNombre(nombre, areaEditada.name)) {
      throw new ErrorApi(409, 'conflict', RENOMBRE_BLOQUEADO)
    }

    if (nombre === '') detalles.name = ['requerido']
    else if (nombre.length > LARGO_NOMBRE_AREA) detalles.name = ['length']
    else if (AREAS.some((otra) => otra.id !== areaEditada?.id && mismoNombre(otra.name, nombre))) {
      detalles.name = ['duplicado']
    } else if (areaEditada === null) {
      // Solo el alta escribe el nombre. En una edicion ya se comprobo que es el mismo, y volver a
      // escribirlo cambiaria la caja o los espacios de un texto que las Tareas tienen guardado.
      salida.name = nombre
    }
  }

  if (datos.area_superior_id !== undefined) {
    const superior = datos.area_superior_id === null ? null : Number(datos.area_superior_id)

    if (superior !== null && !AREAS.some((otra) => otra.id === superior)) {
      detalles.area_superior_id = ['no_existe']
    } else if (areaEditada !== null && superior !== null && descendenciaDeArea(areaEditada.id).has(superior)) {
      // Colgarla de si misma o de una que ya cuelga de ella dejaria un ciclo, y el arbol entero se
      // volveria irrecorrible: la comprobacion es del backend justamente porque es el que sabe.
      detalles.area_superior_id = ['ciclo']
    } else salida.area_superior_id = superior
  }

  if (datos.jefe_staffid !== undefined) {
    const jefe = datos.jefe_staffid === null ? null : Number(datos.jefe_staffid)

    if (jefe !== null && !STAFF.some((persona) => persona.id === jefe && persona.active)) {
      detalles.jefe_staffid = ['no_existe']
    } else salida.jefe_staffid = jefe
  }

  if (Object.keys(detalles).length > 0) {
    throw new ErrorApi(422, 'validation_failed', 'Revisá los campos del área.', detalles)
  }

  return salida
}

/**
 * `/jerarquia`, `/jerarquia/areas` y `/jerarquia/personas/{id}`.
 *
 * Una sola lectura sirve la pantalla entera —el arbol, la gente de cada area, quien no tiene area y
 * el catalogo de asignables— porque las cuatro cosas cambian juntas: mover a alguien saca una fila
 * de una lista y la pone en otra, y pedirlas por separado deja la pantalla mostrando dos momentos
 * distintos del mismo dato.
 */
async function jerarquiaRuta (metodo, resto, cuerpo, actual) {
  const [seccion, id] = resto

  if (seccion === undefined) {
    if (metodo !== 'GET') throw new ErrorApi(404, 'not_found', 'Verbo no soportado en /jerarquia.')

    const { visibles, esAdmin } = alcanceDeJerarquia(actual)

    // Quien no dirige nada y no administra no tiene organigrama que mirar. Es 403 y no una respuesta
    // vacia: vacia se lee como "todavia no hay areas", que es otra cosa y llevaria a crearlas.
    if (!esAdmin && visibles.length === 0) throw new ErrorApi(403, 'forbidden', SIN_JERARQUIA)

    return { estado: 200, cuerpo: conDatos(arbolCompleto(actual)) }
  }

  if (seccion === 'areas') {
    if (id === undefined) {
      if (metodo !== 'POST') throw new ErrorApi(404, 'not_found', 'Verbo no soportado en /jerarquia/areas.')

      const { esAdmin } = alcanceDeJerarquia(actual)

      if (!esAdmin) throw new ErrorApi(403, 'forbidden', 'Solo quien administra puede crear un área.')

      const campos = validarArea(await cuerpo(), null)
      const area = {
        id: Math.max(0, ...AREAS.map((otra) => otra.id)) + 1,
        name: campos.name,
        area_superior_id: campos.area_superior_id ?? null,
        jefe_staffid: campos.jefe_staffid ?? null
      }

      AREAS.push(area)

      // El alta sincroniza el nombre con las opciones de los Procesos: por eso un area recien creada
      // nace alineada y no con la insignia de desalineada puesta desde el minuto cero.
      if (!OPCIONES_AREA_EN_TAREAS.some((opcion) => mismoNombre(opcion, area.name))) {
        OPCIONES_AREA_EN_TAREAS.push(area.name)
      }

      return { estado: 201, cuerpo: conDatos(arbolCompleto(actual)) }
    }

    const area = buscarO404(AREAS, Number(id), 'área')

    if (metodo === 'DELETE') {
      const { esAdmin } = alcanceDeJerarquia(actual)

      if (!esAdmin) throw new ErrorApi(403, 'forbidden', 'Solo quien administra puede borrar un área.')

      exigirAreaLibre(area)

      for (const persona of STAFF) {
        guardarAreasDePersona(persona, areasDePersona(persona).filter((areaId) => areaId !== area.id))
      }
      AREAS.splice(AREAS.indexOf(area), 1)

      // Devuelve el arbol entero y no un 204: borrar un area puede dejar huerfanas a las que
      // colgaban de ella, asi que la pantalla necesita el estado completo y no solo la confirmacion.
      return { estado: 200, cuerpo: conDatos(arbolCompleto(actual)) }
    }

    // `PUT` y no `PATCH`: asi lo expone la API, y exige las tres claves presentes aunque dos vengan
    // en `null`. Un cuerpo parcial desenganchaba el area del arbol en silencio.
    if (metodo !== 'PUT') throw new ErrorApi(404, 'not_found', 'Verbo no soportado en /jerarquia/areas/{id}.')

    if (!puedeEditarArea(actual, area)) {
      throw new ErrorApi(403, 'forbidden', 'Solo se puede editar un área que diriges.')
    }

    const datos = await cuerpo()
    const faltantes = {}

    for (const clave of ['name', 'area_superior_id', 'jefe_staffid']) {
      if (datos[clave] === undefined) faltantes[clave] = ['required']
    }

    if (Object.keys(faltantes).length > 0) {
      throw new ErrorApi(422, 'validation_failed', 'Faltan campos del área.', faltantes)
    }

    Object.assign(area, validarArea(datos, area))

    return { estado: 200, cuerpo: conDatos(arbolCompleto(actual)) }
  }

  if (seccion === 'personas') {
    if (metodo !== 'PUT') throw new ErrorApi(404, 'not_found', 'Verbo no soportado en /jerarquia/personas/{id}.')

    const persona = buscarO404(STAFF, Number(id), 'persona')
    const datos = await cuerpo()
    if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) {
      throw new ErrorApi(422, 'validation_failed', 'Revisá los campos.', { area_id: ['required'] })
    }
    const accion = datos.accion ?? 'mover'
    if (!['agregar', 'quitar'].includes(accion) && datos.accion !== undefined) {
      throw new ErrorApi(422, 'validation_failed', 'Revisá los campos.', { accion: ['invalid'] })
    }
    const destino = datos.area_id === null ? null : Number(datos.area_id)
    const valido = typeof datos.area_id === 'number' || (typeof datos.area_id === 'string' && /^\d+$/.test(datos.area_id))
    if ((destino === null && accion !== 'mover') ||
        (destino !== null && (!valido || !Number.isInteger(destino) || !AREAS.some((area) => area.id === destino)))) {
      throw new ErrorApi(422, 'validation_failed', 'Revisá los campos.', { area_id: ['no_existe'] })
    }

    const actuales = areasDePersona(persona)
    const afectadas = accion === 'mover' ? [...actuales, destino] : [destino]
    for (const areaId of afectadas) {
      const area = AREAS.find((otra) => otra.id === areaId)
      if (area !== undefined && !puedeEditarArea(actual, area)) {
        throw new ErrorApi(403, 'forbidden', `No puedes modificar integrantes de «${area.name}».`)
      }
    }
    const nuevas = accion === 'agregar' ? [...actuales, destino]
      : accion === 'quitar' ? actuales.filter((areaId) => areaId !== destino)
        : destino === null ? [] : [destino]
    guardarAreasDePersona(persona, nuevas)

    // El arbol entero y no la persona: moverla cambia quien cuelga de quien y que se puede editar, y
    // recalcularlo en el navegador seria una segunda copia de las reglas de la API.
    return { estado: 200, cuerpo: conDatos(arbolCompleto(actual)) }
  }

  throw new ErrorApi(404, 'not_found', 'Subrecurso de jerarquía desconocido.')
}

// ---------------------------------------------------------------------------
// Organigrama: el mapa de areas y el arbol de personas (`GET /organigrama`)
// ---------------------------------------------------------------------------
//
// Contesta lo que describe `contrato-organigrama.md`, y se apoya en el MISMO `STAFF`/`AREAS` que
// administran `/jerarquia` y `/accesos`: el organigrama no es un dato aparte, es otra lectura del
// arbol de personas. Una semilla propia seria una segunda verdad sobre `jefe_staffid`, y mover a
// alguien desde esta pantalla dejaria de verse en las otras dos.
//
// Ver el organigrama NO da acceso a los datos de nadie: eso lo sigue decidiendo el alcance. Esta
// pregunta es a proposito la mas permisiva de las dos, porque un organigrama que esconde media casa
// no sirve para orientarse.
//
// La pertenencia se lee por el area PRINCIPAL (`area_id`) y no por las membresias multiples, porque
// el contrato emite un solo `area_id` por persona: contar por una cosa y emitir la otra haria que la
// cuenta de la tarjeta y lo que aparece al entrar se contradigan, que es justo lo que el contrato
// pide evitar.

/** El area principal de una persona, que es la unica que el contrato del organigrama emite. */
function areaPrincipalDe (persona) {
  const areas = areasDePersona(persona)

  return areas.includes(persona.area_id) ? persona.area_id : areas[0] ?? null
}

/** Los ids de quienes cuelgan de `staffId`, a cualquier profundidad. Sin el propio. */
function descendenciaDePersona (staffId) {
  const dentro = new Set()
  let crecio = true

  // Barridos sucesivos sobre la lista plana en vez de recursion: un `jefe_staffid` ya ciclado
  // termina igual en vez de desbordar la pila.
  while (crecio) {
    crecio = false

    for (const persona of STAFF) {
      if (persona.jefe_staffid === null || persona.jefe_staffid === undefined) continue
      if ((persona.jefe_staffid === staffId || dentro.has(persona.jefe_staffid)) && !dentro.has(persona.id)) {
        dentro.add(persona.id)
        crecio = true
      }
    }
  }

  return dentro
}

/** Los ids de la cadena de jefes de `staffId` hacia arriba, hasta la raiz. Sin el propio. */
function cadenaHaciaArriba (staffId) {
  const arriba = new Set()
  let actual = STAFF.find((persona) => persona.id === staffId)?.jefe_staffid ?? null

  while (actual !== null && actual !== undefined && !arriba.has(actual)) {
    arriba.add(actual)
    actual = STAFF.find((persona) => persona.id === actual)?.jefe_staffid ?? null
  }

  return arriba
}

/**
 * Que gente ve quien pregunta, segun la regla del contrato.
 *
 * Administracion ve la casa entera. El resto ve la union de cinco cosas: ella misma, su cadena
 * hacia arriba, su rama hacia abajo, las areas que dirige alguien de su rama —con las que cuelgan
 * de esas— y su propia area con todas sus ramas.
 *
 * @param {object} actual quien pregunta
 * @returns {{personas: Set<number>, areas: Set<number>}} ids de gente y de areas visibles
 */
function alcanceDeOrganigrama (actual) {
  if (actual.is_superadmin === true || actual.is_admin === true) {
    return { personas: new Set(STAFF.map((persona) => persona.id)), areas: new Set(AREAS.map((area) => area.id)) }
  }

  const suRama = descendenciaDePersona(actual.id)
  const personas = new Set([actual.id, ...cadenaHaciaArriba(actual.id), ...suRama])

  // (4) las areas que dirige ella o alguien que cuelga de ella, y todo lo que cuelga de esas.
  // (5) las areas que lleva puesta, tambien con sus ramas.
  const jefaturas = new Set([actual.id, ...suRama])
  const areas = new Set()

  for (const area of AREAS) {
    const dirigida = area.jefe_staffid !== null && jefaturas.has(area.jefe_staffid)
    const propia = areasDePersona(actual).includes(area.id)

    if (dirigida || propia) descendenciaDeArea(area.id).forEach((id) => areas.add(id))
  }

  for (const persona of STAFF) {
    const suArea = areaPrincipalDe(persona)

    if (suArea !== null && areas.has(suArea)) personas.add(persona.id)
  }

  // Las areas de la gente que ya se ve por el arbol: sin esto, una tarjeta del mapa podria faltar
  // aunque su gente aparezca al entrar en otra.
  for (const id of personas) {
    const suArea = areaPrincipalDe(STAFF.find((persona) => persona.id === id) ?? {})

    if (suArea !== null) areas.add(suArea)
  }

  return { personas, areas }
}

/** Una persona con la forma que emite `GET /organigrama`. */
function personaDeOrganigrama (persona) {
  return {
    staffid: persona.id,
    nombre: persona.full_name,
    correo: persona.email,
    avatar: persona.profile_image_url,
    escalon: persona.escalon,
    jefe_staffid: persona.jefe_staffid ?? null,
    area_id: areaPrincipalDe(persona),
    activo: persona.active
  }
}

/**
 * `GET /organigrama`: el mapa de areas y la gente, recortado a lo que quien pregunta puede ver.
 *
 * `personas` y `leads` de cada area cuentan **solo lo visible**, para que la cuenta de la tarjeta y
 * lo que aparece al entrar digan lo mismo.
 */
function organigramaDe (actual) {
  const { personas: visibles, areas: areasVisibles } = alcanceDeOrganigrama(actual)
  const gente = STAFF.filter((persona) => !persona.is_not_staff && visibles.has(persona.id))

  return {
    yo: {
      staffid: actual.id,
      // Editar el arbol es cosa de superadministracion, igual que el resto de `/accesos`.
      puede_editar: actual.is_superadmin === true,
      areas: areasDePersona(actual)
    },
    areas: AREAS.filter((area) => areasVisibles.has(area.id)).map((area) => {
      const suya = gente.filter((persona) => areaPrincipalDe(persona) === area.id)

      return {
        id: area.id,
        nombre: area.name,
        area_superior_id: area.area_superior_id,
        jefe_staffid: area.jefe_staffid,
        personas: suya.length,
        leads: suya.filter((persona) => persona.escalon === 'lead').length
      }
    }),
    personas: gente.map(personaDeOrganigrama)
  }
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
 * Meeting Papers, por Espacio.
 *
 * Vive en memoria y no en `datos.js` porque el caso que interesa probar es el ciclo completo
 * —generar, guardar, corregir, borrar— y para eso las actas tienen que nacer durante la sesion.
 */
const ACTAS = []

/** Autoincremental de actas. Arranca alto para que un id de acta no se confunda con uno de tarea. */
let PROXIMA_ACTA = 900

/** Autoincremental de adjuntos del acta. */
let PROXIMO_ADJUNTO = 7000

/**
 * El unico binario que el mock sirve: un PNG liso de 640x360.
 *
 * Es lo que devuelve la descarga de CUALQUIER adjunto de acta, sin importar que se haya subido: el
 * mock no guarda los bytes, solo los nombres. Mide 640x360 y no 1x1 a proposito — con un pixel la
 * miniatura carga pero no se ve, y entonces no hay forma de mirar si el titulo y el boton quedaron
 * bien puestos respecto de la imagen, que es justo lo que esta pantalla hay que revisar a ojo.
 */
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAoAAAAFoCAIAAABIUN0GAAAEg0lEQVR42u3VMQ0AAAgEsdeCLNQhlWCCqUkV3HKpHgDgWSQAAAMGAAMGAAwYAAwYADBgADBgAMCAAcCAAQADBgADBgADBgAMGAAMGAAwYAAwYADAgAHAgAEAAwYAAwYAAwYADBgADBgAMGAAMGAAwIABwIABAAMGAAMGAAMGAAwYAAwYADBgADBgAMCAAcCAAQADBgADBgADBgAMGAAMGAAwYAAwYADAgAHAgAEAAwYAAwYAAwYADBgADBgAMGAAMGAAwIABwIABAAMGAAMGAAMGAAwYAAwYADBgADBgAMCAAcCAAQADBgADBgADBgAMGAAMGAAwYAAwYADAgAHAgAEAAwYAAwYAAwYADBgADBgAMGAAMGAAwIABwIABAAMGAAMGAANWAQAMGAAMGAAwYAAwYADAgAHAgAEAAwYAAwYADBgADBgADBgAMGAAMGAAwIABwIABAAMGAAMGAAwYAAwYAAwYADBgADBgAMCAAcCAAQADBgADBgAMGAAMGAAMGAAwYAAwYADAgAHAgAEAAwYAAwYADBgADBgADBgAMGAAMGAAwIABwIABAAMGAAMGAAwYAAwYAAwYADBgADBgAMCAAcCAAQADBgADBgAMGAAMGAAMGAAwYAAwYADAgAHAgAEAAwYAAwYADBgADBgADBgAMGAAMGAAwIABwIABAAMGAAMGAAwYAAwYAAwYADBgADBgAMCAAcCAAQADBgADBgAMGAAMGAAMWAUAMGAAMGAAwIABwIABAAMGAAMGAAwYAAwYADBgADBgADBgAMCAAcCAAQADBgADBgAMGAAMGAAwYAAwYAAwYADAgAHAgAEAAwYAAwYADBgADBgAMGAAMGAAMGAAwIABwIABAAMGAAMGAAwYAAwYADBgADBgADBgAMCAAcCAAQADBgADBgAMGAAMGAAwYAAwYAAwYADAgAHAgAEAAwYAAwYADBgADBgAMGAAMGAAMGAAwIABwIABAAMGAAMGAAwYAAwYADBgADBgADBgAMCAAcCAAQADBgADBgAMGAAMGAAwYAAwYAAwYADAgAHAgAEAAwYAAwYADBgADBgAMGAAMGAAMGAAwIABwIABAAMGAAMGAAwYAAwYADBgADBgADBgCQDAgAHAgAEAAwYAAwYADBgADBgAMGAAMGAAwIABwIABwIABAAMGAAMGAAwYAAwYADBgADBgAMCAAcCAAcCAAQADBgADBgAMGAAMGAAwYAAwYADAgAHAgAHAgAEAAwYAAwYADBgADBgAMGAAMGAAwIABwIABwIABAAMGAAMGAAwYAAwYADBgADBgAMCAAcCAAcCAAQADBgADBgAMGAAMGAAwYAAwYADAgAHAgAHAgAEAAwYAAwYADBgADBgAMGAAMGAAwIABwIABwIABAAMGAAMGAAwYAAwYADBgADBgAMCAAcCAAcCAAQADBgADBgAMGAAMGAAwYAAwYADAgAHAgAHAgFUAAAMGAAMGAAwYAAwYADBgADBgAMCAAcCAAQADBgADBgADBgAMGAAMGAAwYAAwYADAgAHAgAGAs2zlqnsqBR5hAAAAAElFTkSuQmCC',
  'base64'
)

/** Firma de correo por marca, igual que la constante del backend. */
const FIRMAS_MARCA = {
  mgc: 'https://www.meetwiwo.com/assets/logos/Materiales/firmamgc.jpg',
  wiwo: 'https://www.meetwiwo.com/assets/logos/Materiales/firmawiwo.jpg',
  palta: 'https://www.meetwiwo.com/assets/logos/Materiales/firmapalta.jpg'
}

/**
 * Un acta como la devuelve la API. El listado omite `content`, igual que el backend.
 *
 * `attachments` y `project_name` viajan SOLO en el detalle, por lo mismo que `content`: el listado
 * pinta una tabla de titulos y no necesita ni los archivos ni el nombre del Espacio repetido.
 */
function presentarActa (acta, { conContenido }) {
  const autor = STAFF.find((s) => s.id === acta.staff_id) ?? null
  const publica = {
    id: acta.id,
    project_id: acta.project_id,
    title: acta.title,
    client: acta.client,
    meeting_date: acta.meeting_date,
    place: acta.place,
    modality: acta.modality,
    attendees: acta.attendees,
    brand: acta.brand,
    brand_sign_url: FIRMAS_MARCA[acta.brand] ?? null,
    source: acta.source,
    staff_id: acta.staff_id,
    author: autor === null ? null : { id: autor.id, full_name: autor.full_name, profile_image_url: autor.profile_image_url ?? null },
    date_added: acta.date_added,
    date_updated: acta.date_updated,
    updated_by: acta.updated_by
  }

  if (!conContenido) return publica

  const espacio = ESPACIOS.find((e) => e.id === acta.project_id) ?? null

  return {
    ...publica,
    content: acta.content,
    project_name: espacio?.name ?? '',
    attachments: acta.attachments ?? []
  }
}

/** El HTML que "genera" el modelo, con la estructura real del Meeting Paper. */
function actaGenerada (espacio) {
  return `<h1>Meeting Paper - Avance de ${espacio.name}</h1>`
    + '<p><strong>#No especificado</strong></p><hr />'
    + '<p><strong>Cliente:</strong> Acme SpA</p>'
    + '<p><strong>Fecha:</strong> 2026-09-08</p>'
    + '<p><strong>Lugar:</strong> No especificado</p>'
    + '<p><strong>Modalidad:</strong> Online</p>'
    + '<p><strong>Objetivo:</strong> Revisar el avance del proyecto.</p>'
    + '<h2>Asistentes</h2><ul><li><strong>wiwo:</strong> Ana Pérez</li>'
    + '<li><strong>Cliente:</strong> No especificado</li></ul>'
    + '<h2>Temas Discutidos y Acuerdos</h2>'
    + '<h3>Diseño de la home</h3><p>Se revisó el estado actual y se fijó la fecha de entrega.</p>'
    + '<p><strong>Acción:</strong> Entregar el diseño el 30 de septiembre.</p>'
    + '<p><strong>Responsable:</strong> Ana Pérez</p>'
    + '<h3>Proveedor de hosting</h3><p>Sigue pendiente la elección del alojamiento.</p>'
    + '<p><strong>Acción:</strong> Definir el proveedor.</p>'
    + '<p><strong>Responsable:</strong> No especificado</p>'
    + '<h2>Próximos Pasos:</h2><ul><li>Entregar el diseño - <strong>Responsable:</strong> Ana Pérez</li></ul>'
}

/** Titulo del acta: el del `<h1>`, sin el prefijo, igual que hace el backend. */
function tituloDeHtml (html) {
  const encontrado = /<h1[^>]*>(.*?)<\/h1>/is.exec(html)
  if (encontrado === null) return 'Meeting Paper'

  return encontrado[1].replace(/<[^>]+>/g, '').replace(/^Meeting Paper\s*-\s*/i, '').trim() || 'Meeting Paper'
}

/**
 * Crea el acta y la deja al frente de la lista.
 *
 * @param {Array<{name: string, size: number, type: string}>} adjuntos los archivos que se subieron
 */
function guardarActa (espacio, actual, campos, html, origen, adjuntos = []) {
  const ahora = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const acta = {
    id: (PROXIMA_ACTA += 1),
    project_id: espacio.id,
    title: campos.title ?? tituloDeHtml(html),
    content: html,
    client: campos.client ?? '',
    meeting_date: campos.meeting_date ?? null,
    place: campos.place ?? '',
    modality: campos.modality ?? '',
    attendees: campos.attendees ?? [],
    brand: campos.brand ?? '',
    source: origen,
    staff_id: actual.id,
    date_added: ahora,
    date_updated: ahora,
    updated_by: null,
    attachments: adjuntos.map((adjunto) => ({
      id: (PROXIMO_ADJUNTO += 1),
      acta_id: PROXIMA_ACTA,
      name: adjunto.name,
      // El de disco lo desambigua el backend; el mock imita el sufijo para que el frontend no se
      // acostumbre a que los dos nombres sean iguales.
      file_name: `${PROXIMA_ACTA}-${adjunto.name}`,
      filetype: adjunto.type,
      size: adjunto.size,
      staff_id: actual.id,
      url: `/api/v1/files/acta/${PROXIMO_ADJUNTO}/download`,
      date_added: ahora
    }))
  }
  ACTAS.unshift(acta)

  return acta
}

/**
 * Un acta tal como la ve el cliente.
 *
 * Es la del equipo menos lo que `FormasDelPortal::ACTAS` no publica. Se deriva de `presentarActa` y
 * quita claves en vez de volver a armar el objeto: asi un campo nuevo del acta llega a los dos lados
 * y la unica decision que se toma aca es cual se le esconde al cliente.
 *
 * `file_name` del adjunto tampoco sale: es el nombre en disco, y al cliente lo nombra `name`.
 */
function presentarActaPortal (acta, opciones) {
  const completa = presentarActa(acta, opciones)
  const publica = {}

  for (const [clave, valor] of Object.entries(completa)) {
    if (!FUERA_DEL_PORTAL_ACTA.includes(clave)) publica[clave] = valor
  }

  if (Array.isArray(publica.attachments)) {
    publica.attachments = publica.attachments.map((adjunto) => ({
      id: adjunto.id,
      acta_id: adjunto.acta_id,
      name: adjunto.name,
      filetype: adjunto.filetype,
      size: adjunto.size,
      url: adjunto.url,
      date_added: adjunto.date_added
    }))
  }

  return publica
}

/** Como se escribio el acta y quien la toco es vocabulario interno: no viaja al portal. */
const FUERA_DEL_PORTAL_ACTA = ['source', 'staff_id', 'updated_by']

/**
 * Dos Meeting Papers ya escritos en el Espacio 1.
 *
 * El resto de las actas nace durante la sesion —ese es el ciclo que interesa probar del lado del
 * equipo—, pero el portal es de SOLO lectura: sin una escrita de antemano, la pestaña del cliente
 * solo se puede mirar vacia. Son dos y no una porque el caso "acta sin adjuntos" se lee distinto y
 * hay que poder verlo al lado del que si los tiene.
 */
function sembrarActas () {
  const espacio = ESPACIOS.find((e) => e.id === 1)
  const autora = STAFF.find((s) => s.id === 1) ?? STAFF[0]

  if (espacio === undefined || autora === undefined) return

  guardarActa(
    espacio,
    autora,
    {
      title: 'Kickoff del rediseño',
      client: 'Acme SpA',
      meeting_date: '2026-08-20',
      place: 'Oficina de Acme',
      modality: 'presencial',
      attendees: ['Ana Pérez', 'Renata Ferreyra'],
      brand: 'wiwo'
    },
    actaGenerada(espacio),
    'ia',
    [
      { name: 'reunion-kickoff.m4a', size: 8_412_000, type: 'audio/mp4' },
      { name: 'pizarra.png', size: 412_000, type: 'image/png' }
    ]
  )

  guardarActa(
    espacio,
    autora,
    {
      title: 'Revisión semanal',
      client: 'Acme SpA',
      meeting_date: '2026-09-03',
      place: '',
      modality: 'online',
      attendees: ['Ana Pérez'],
      brand: 'mgc'
    },
    actaGenerada(espacio),
    'manual'
  )
}

sembrarActas()

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
  return `Tienes ${suyos.length} tareas abiertas asignadas, ${vencidos.length} vencidas. Revisa las tareas seleccionadas a continuación.`
}

/** Referencias actuales de tareas asignadas para probar los enlaces del resumen. */
function tareasDeResumenIa (actual) {
  return PROCESOS.filter((p) => p.assignees.some((a) => a.id === actual.id) && p.status !== 5)
    .slice(0, 6).map((p) => ({
      id: p.id,
      name: p.name,
      project_name: p.project?.name ?? null,
      due_date: p.due_date,
      recomendacion: 'Revisa si sigue pendiente. Si ya está resuelta, márcala como completada; si sigue vigente, acuerda una fecha realista.'
    }))
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
  if (seccion === 'proyectos' && sub[1] === 'estado' && metodo === 'POST') {
    return estadoDeEspacioIaRuta(sub[0])
  }
  if (seccion === 'proyectos' && sub[1] === 'chat') {
    return await chatEspacioIaRuta(metodo, sub[0], parametros, actual, cuerpo, peticion)
  }
  if (seccion === 'tareas' && sub[0] === 'interpretar' && metodo === 'POST') {
    return await interpretarTareaIaRuta(actual, cuerpo)
  }
  if (seccion === 'proyectos' && sub[1] === 'acta' && sub[2] === 'prefill' && metodo === 'GET') {
    return prefillActaIaRuta(sub[0])
  }
  if (seccion === 'proyectos' && sub[1] === 'acta' && metodo === 'POST') {
    return await generarActaIaRuta(sub[0], parametros, actual, peticion)
  }
  if (seccion === 'proyectos' && sub[1] === 'acta-transformar' && metodo === 'POST') {
    return await transformarActaIaRuta(cuerpo)
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
        texto: guardado ? textoDeResumenIa(actual) : null,
        tareas: guardado ? tareasDeResumenIa(actual) : [],
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
    tareas: tareasDeResumenIa(actual),
    generado_en: generadoEn,
    regeneracion: regeneracionIa(actual.id, false),
    uso: { entrada: 3120, salida: [...texto].length }
  }

  if (!aceptaStream(peticion)) {
    return { estado: 200, cuerpo: conDatos({ texto, tareas: fin.tareas, generado_en: generadoEn, regeneracion: fin.regeneracion }) }
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

/** `GET /ia/proyectos/{id}/acta/prefill`. Lo que ya se sabe, para no pedirlo dos veces. */
function prefillActaIaRuta (id) {
  const espacio = buscarO404(ESPACIOS, Number(id), 'espacio')
  const cliente = CLIENTES.find((c) => c.userid === espacio.clientid) ?? null
  const hoy = new Date().toISOString().slice(0, 10)

  return {
    estado: 200,
    cuerpo: conDatos({
      client: cliente?.company ?? '',
      attendees: STAFF.filter((s) => (espacio.miembros ?? []).includes(s.id)).map((s) => s.full_name),
      meeting_date: hoy,
      title: `Meeting Paper - ${espacio.name} - ${hoy}`
    })
  }
}

/**
 * `POST /ia/proyectos/{id}/acta`. Genera el Meeting Paper y **lo guarda**.
 *
 * El cuerpo llega como `multipart/form-data` —el audio no entra en un JSON— y el mock no lo parsea:
 * lo drena y responde. Lo que el frontend tiene que poder probar acá es el stream y que el acta
 * quede guardada, no que el mock sepa leer un multipart.
 *
 * Guarda al terminar, igual que el backend: es lo que hace que cambiar de pestaña a mitad de una
 * generacion no tire el trabajo, y el frontend se programa contra eso.
 */
async function generarActaIaRuta (id, parametros, actual, peticion) {
  const espacio = buscarO404(ESPACIOS, Number(id), 'espacio')

  // Drenar el cuerpo antes de responder: sin esto el socket queda con bytes sin leer y el navegador
  // ve la conexion cortada en vez de la respuesta. De paso se anotan los archivos que venian, que es
  // lo que el frontend espera ver listado en la ficha del acta.
  const adjuntos = await adjuntosDelMultipart(peticion)

  const falla = parametros.get('falla') === '1'
  const html = actaGenerada(espacio)
  const campos = { client: 'Acme SpA', brand: 'wiwo' }

  if (!aceptaStream(peticion)) {
    if (falla) throw new ErrorApi(502, 'provider_error', 'El proveedor cortó la respuesta.')
    const acta = guardarActa(espacio, actual, campos, html, 'ia', adjuntos)

    return { estado: 201, cuerpo: conDatos(presentarActa(acta, { conContenido: true })) }
  }

  const fin = falla
    ? null
    : { acta: presentarActa(guardarActa(espacio, actual, campos, html, 'ia', adjuntos), { conContenido: true }) }

  return { transmitir: (respuesta) => transmitirSSE(respuesta, html, { fin, falla }) }
}

/** Extension a MIME, lo justo para que la ficha del acta sepa cual adjunto es una imagen. */
const MIME_DE_ADJUNTO = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  heic: 'image/heic', heif: 'image/heif',
  m4a: 'audio/aac', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm',
  mp4: 'audio/aac', mov: 'audio/quicktime',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', html: 'text/html',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

/**
 * Los archivos que venian en el multipart, sacados del propio flujo mientras se drena.
 *
 * El mock NO parsea multipart, y no deberia: eso seria reimplementar PHP para probar el frontend.
 * Lo que hace es leer los `filename="..."` de las cabeceras de cada parte, que son ASCII y viajan
 * antes de los bytes del archivo. Alcanza para lo unico que esta pantalla necesita del mock: que el
 * acta quede con tantos adjuntos como archivos se eligieron, con sus nombres reales.
 *
 * El tamaño es un REPARTO del cuerpo entre los archivos, no el de cada uno: medirlo de verdad es
 * parsear los limites. Sirve para que la ficha muestre un peso creible y nada mas.
 *
 * La memoria no crece con el archivo: se mira trozo a trozo y solo se arrastran los ultimos bytes,
 * por si una cabecera quedo partida entre dos. El desplazamiento absoluto evita contar dos veces el
 * `filename` que cae justo en ese arrastre.
 */
async function adjuntosDelMultipart (peticion) {
  const ARRASTRE = 512
  const patron = /filename="([^"\r\n]*)"/g
  const nombres = []
  let cola = ''
  let base = 0
  let ultimo = -1
  let bytes = 0

  for await (const trozo of peticion) {
    bytes += trozo.length
    const texto = cola + trozo.toString('latin1')

    patron.lastIndex = 0
    let encontrado = patron.exec(texto)
    while (encontrado !== null) {
      const absoluto = base + encontrado.index
      if (absoluto > ultimo && encontrado[1] !== '') {
        nombres.push(encontrado[1])
        ultimo = absoluto
      }
      encontrado = patron.exec(texto)
    }

    cola = texto.slice(-ARRASTRE)
    base += texto.length - cola.length
  }

  if (nombres.length === 0) return []

  const reparto = Math.max(1, Math.round(bytes / nombres.length))

  return nombres.map((name) => ({
    name,
    size: reparto,
    type: MIME_DE_ADJUNTO[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
  }))
}

/** `POST /ia/proyectos/{id}/acta-transformar`. Reescribe un fragmento con una de las cuatro acciones. */
async function transformarActaIaRuta (cuerpo) {
  const datos = await cuerpo()
  const accion = String(datos.accion ?? '')
  const texto = String(datos.texto ?? '').trim()

  if (!['alargar', 'acortar', 'complejizar', 'simplificar'].includes(accion)) {
    throw new ErrorApi(422, 'validation_failed', 'No se puede reescribir ese fragmento.', { accion: ['invalid'] })
  }
  if (texto === '') {
    throw new ErrorApi(422, 'validation_failed', 'No se puede reescribir ese fragmento.', { texto: ['required'] })
  }

  const plano = texto.replace(/<[^>]+>/g, '').trim()
  const reescrito = accion === 'acortar' || accion === 'simplificar'
    ? plano.split(' ').slice(0, 8).join(' ') + '.'
    : `${plano} Además, se dejó constancia del acuerdo para la próxima sesión de trabajo.`

  return { estado: 200, cuerpo: conDatos({ html: `<p>${reescrito}</p>` }) }
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

  const sinResolver = persona === null && /@\w+/.test(texto) ? [texto.match(/@\w+/)[0]] : []

  // La API anida: `campos` es el cuerpo listo para `POST /tasks`, y `resueltos`, `no_resuelto` y
  // `faltantes` cuelgan del padre. El mock servia una forma plana y el front la leia asi, con lo
  // que contra el back verdadero todo caia a `null` sin dar error. Ver `leerCamposTarea()`.
  return {
    estado: 200,
    cuerpo: conDatos({
      campos: {
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
        // Las etiquetas viajan por NOMBRE: `POST /tasks` las busca asi, no por id.
        tags: []
      },
      resueltos: {
        assignees: persona === null ? [] : [{ id: persona.id, nombre: `${persona.firstname} ${persona.lastname}`, desde: persona.firstname }],
        followers: [],
        rel_id: espacio === null ? null : { id: espacio.id, nombre: espacio.name, desde: espacio.name },
        tags: []
      },
      no_resuelto: sinResolver,
      faltantes: ['description']
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

// ---------------------------------------------------------------------------
// Accesos: escalones, personas, arbol, areas, cargos e interruptores
// ---------------------------------------------------------------------------
//
// Sirve `/accesos` tal como lo describe el contrato del modulo, para que la pantalla
// `/administracion/accesos` se pueda ver y ejercitar antes de que el modulo exista en Perfex.
//
// Los dos ejes son independientes y no se mezclan aca: el rol de sistema vive en las banderas de
// Perfex (`is_admin`/`is_superadmin`) y no se escribe por estas rutas; el escalon jerarquico y el
// jefe directo si, y son lo unico que esta pantalla edita de una persona.
//
// El escalon NO otorga capacidades: nombra el puesto. Quien ve que, sale del arbol de personas
// —la cadena de `jefe_staffid` y la jefatura de area—, que es el mismo `jefe_staffid` que administra
// `/jerarquia`. Dos verdades sobre el mismo dato es como el mock deja de ser un contrato ejecutable.
//
// El estado vive en memoria del proceso: mover a alguien de jefe y recargar la pagina lo sigue
// mostrando, y reiniciar el mock devuelve la semilla.

/** Los cuatro escalones jerarquicos. Son fijos: no se crean, no se borran y no se renombran. */
const ESCALONES = [
  { clave: 'staff', nombre: 'Staff', orden: 1 },
  { clave: 'lead', nombre: 'Lead', orden: 2 },
  { clave: 'director', nombre: 'Director', orden: 3 },
  { clave: 'gerencia', nombre: 'Gerencia', orden: 4 }
]

/** Las claves validas para escribir un escalon, en el orden en que la pantalla las muestra. */
const CLAVES_DE_ESCALON = ESCALONES.map((escalon) => escalon.clave)

/** Los cargos. Los dos primeros son los por defecto de la instalacion: la API los protege del borrado. */
const CARGOS_ACCESOS = [
  { id: 1, nombre: 'Director', porDefecto: true },
  { id: 2, nombre: 'Colaborador', porDefecto: true },
  { id: 3, nombre: 'Practicante', porDefecto: false }
]

/**
 * El unico interruptor que queda del modelo de permisos, con su valor actual.
 *
 * Es tambien la lista blanca del PUT: cualquier otra clave vuelve con 422. Los del modelo viejo
 * —reglas por escalon, alcance, roles de administracion— se fueron con el, y dejarlos serviria una
 * pantalla que ya no existe.
 */
const INTERRUPTORES = [
  {
    clave: 'wiwo_permisos_jerarquia',
    valor: '1',
    nombre: 'Alcance por jerarquía',
    descripcion: 'Encendido, cada persona ve lo suyo y lo de quienes cuelgan de ella en el árbol. Apagado, el alcance deja de recortar filas.'
  }
]

/** Cargos iniciales y editados desde administración. */
const CARGOS_POR_PERSONA = new Map([[1, 1], [2, 2]])

/** Siguiente id de una lista con ids numericos. */
function siguienteId (filas) {
  return filas.reduce((mayor, fila) => Math.max(mayor, fila.id), 0) + 1
}

/** El escalon con cuanta gente lo tiene puesto. */
function presentarEscalon (escalon) {
  return { ...escalon, personas: STAFF.filter((persona) => persona.escalon === escalon.clave).length }
}

/**
 * Si una persona tiene gente a cargo: alguien cuelga de ella, o dirige un area.
 *
 * Las dos vias cuentan porque son las dos que el alcance real mira. Mirar solo una deja jefaturas
 * de area sin subordinados directos pareciendo hojas del arbol.
 */
function esJefatura (staff) {
  return STAFF.some((otra) => otra.jefe_staffid === staff.id) || AREAS.some((area) => area.jefe_staffid === staff.id)
}

/** Cuantas personas usan un area o un cargo. */
function contarPersonas (predicado) {
  return STAFF.filter(predicado).length
}

/** La pertenencia de una persona, con el default del fixture. */
function pertenenciaDe (staff) {
  return { area_id: staff.area_id, area_ids: areasDePersona(staff), cargo_id: CARGOS_POR_PERSONA.has(staff.id) ? CARGOS_POR_PERSONA.get(staff.id) : staff.cargo_id }
}

/** El catalogo entero: lo que la pantalla necesita en una sola llamada. */
function catalogoDeAccesos () {
  return {
    escalones: ESCALONES.map(presentarEscalon),
    areas: AREAS.map(presentarAreaDeAccesos),
    cargos: CARGOS_ACCESOS.map(({ porDefecto: _porDefecto, ...cargo }) => ({
      ...cargo,
      personas: contarPersonas((s) => pertenenciaDe(s).cargo_id === cargo.id)
    })),
    features: Object.fromEntries(RECURSOS_CON_PERMISO.map((recurso) => [recurso, capacidadesDe(recurso)])),
    interruptores: INTERRUPTORES.map((uno) => ({ ...uno }))
  }
}

/** Rutas de `/accesos`. Todas exigen superadministrador, igual que la API real. */
async function accesosRuta (metodo, resto, parametros, actual, cuerpo) {
  if (actual.is_superadmin !== true) {
    throw new ErrorApi(403, 'forbidden', 'Solo un superadministrador administra los accesos.')
  }

  const [seccion, id] = resto

  if (seccion === 'catalogo' && metodo === 'GET') {
    return { estado: 200, cuerpo: conDatos(catalogoDeAccesos()) }
  }

  // El arbol entero y plano: la pantalla lo arma sola con `jefe_staffid`. Solo gente activa, porque
  // una baja no manda a nadie.
  if (seccion === 'arbol' && metodo === 'GET') {
    return {
      estado: 200,
      cuerpo: conDatos(STAFF.filter((persona) => persona.active).map((persona) => ({
        staffid: persona.id,
        nombre: persona.full_name,
        escalon: persona.escalon,
        jefe_staffid: persona.jefe_staffid ?? null
      })))
    }
  }

  if (seccion === 'personas') return await personasDeAccesos(metodo, id, parametros, actual, cuerpo)
  if (seccion === 'areas') return await areasDeAccesos(metodo, id, cuerpo)
  if (seccion === 'cargos') return await cargosDeAccesos(metodo, id, cuerpo)

  if (seccion === 'interruptores' && metodo === 'PUT') {
    const datos = await cuerpo()

    for (const [clave, valor] of Object.entries(datos)) {
      const interruptor = INTERRUPTORES.find((uno) => uno.clave === clave)

      if (!interruptor) {
        throw new ErrorApi(422, 'validation_failed', `"${clave}" no es un interruptor.`, { [clave]: ['desconocido'] })
      }

      interruptor.valor = valor === '1' || valor === true ? '1' : '0'
    }

    return { estado: 200, cuerpo: conDatos(catalogoDeAccesos().interruptores) }
  }

  throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')
}

/** El listado paginado de personas y la escritura de su escalon, jefe, area y cargo. */
async function personasDeAccesos (metodo, id, parametros, actual, cuerpo) {
  if (metodo === 'GET' && id === undefined) {
    const buscar = (parametros.get('buscar') ?? '').toLowerCase()
    const escalon = parametros.get('escalon')
    const area = parametros.get('area')
    // `pagina` es el nombre del contrato; `page` se acepta porque es el que manda la pantalla vieja.
    const pagina = Math.max(1, Number(parametros.get('pagina') ?? parametros.get('page') ?? 1) || 1)
    const porPagina = 25

    const filas = STAFF
      .filter((s) => buscar === '' || s.full_name.toLowerCase().includes(buscar) || s.email.toLowerCase().includes(buscar))
      .filter((s) => escalon === null || s.escalon === escalon)
      .filter((s) => area === null || areasDePersona(s).includes(Number(area)))
      .map((s) => {
        const { area_id: areaId, cargo_id: cargoId } = pertenenciaDe(s)

        return {
          staffid: s.id,
          nombre: s.full_name,
          correo: s.email,
          escalon: s.escalon,
          jefe_staffid: s.jefe_staffid ?? null,
          jefe_nombre: STAFF.find((otra) => otra.id === s.jefe_staffid)?.full_name ?? null,
          area_id: areaId,
          area_ids: areasDePersona(s),
          cargo_id: cargoId,
          activo: s.active
        }
      })

    const desde = (pagina - 1) * porPagina

    return {
      estado: 200,
      cuerpo: conDatos(filas.slice(desde, desde + porPagina), {
        pagination: {
          page: pagina,
          per_page: porPagina,
          total: filas.length,
          total_pages: Math.max(1, Math.ceil(filas.length / porPagina))
        }
      })
    }
  }

  if (metodo !== 'PUT' || id === undefined) throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')

  const persona = STAFF.find((s) => s.id === Number(id))

  if (!persona) throw new ErrorApi(404, 'not_found', 'No existe esa persona.')

  const datos = await cuerpo()
  const areasNuevas = validarAreasDePersona(datos)

  if (datos.escalon !== undefined) {
    if (persona.id === actual.id) {
      throw new ErrorApi(409, 'conflict', 'No puedes cambiarte el escalón a ti mismo.')
    }

    if (!CLAVES_DE_ESCALON.includes(datos.escalon)) {
      throw new ErrorApi(422, 'validation_failed',
        `El escalón tiene que ser uno de: ${CLAVES_DE_ESCALON.join(', ')}.`, { escalon: ['invalid'] })
    }

    persona.escalon = datos.escalon
  }

  if (datos.jefe_staffid !== undefined) {
    persona.jefe_staffid = jefeValidado(persona, datos.jefe_staffid)
  }

  if (areasNuevas !== undefined) {
    guardarAreasDePersona(persona, areasNuevas)
    if (datos.area_id !== undefined) persona.area_id = datos.area_id === null ? null : Number(datos.area_id)
  }
  if (datos.cargo_id !== undefined) CARGOS_POR_PERSONA.set(persona.id, datos.cargo_id)

  return { estado: 200, cuerpo: conDatos({ staffid: persona.id }) }
}

/**
 * Valida el jefe que se le quiere poner a alguien y devuelve el id ya normalizado.
 *
 * @param {object} persona la fila de staff que se esta editando
 * @param {number|null} propuesto el `jefe_staffid` del cuerpo; `null` la desengancha
 * @returns {number|null} el id del jefe, o `null` si queda sin jefe
 * @throws {ErrorApi} 422 si el jefe no existe, es ella misma, o cierra un ciclo en el arbol
 */
function jefeValidado (persona, propuesto) {
  if (propuesto === null) return null

  const jefeId = Number(propuesto)

  if (!STAFF.some((otra) => otra.id === jefeId)) {
    throw new ErrorApi(422, 'validation_failed', 'Esa persona no existe.', { jefe_staffid: ['unknown'] })
  }
  if (jefeId === persona.id) {
    throw new ErrorApi(422, 'validation_failed', 'Nadie puede ser su propio jefe.', { jefe_staffid: ['propio'] })
  }
  if (cuelgaDe(jefeId, persona.id)) {
    throw new ErrorApi(422, 'validation_failed', 'Ese jefe haría un ciclo en el árbol.', { jefe_staffid: ['ciclo'] })
  }

  return jefeId
}

/**
 * Si `staffId` esta en la rama que cuelga de `posibleJefeId`, subiendo por `jefe_staffid`.
 *
 * El `Set` corta un arbol ya ciclado —que el fixture no tiene, pero una escritura a medias si podria
 * dejar— en vez de colgar el proceso.
 *
 * @param {number} staffId de quien se quiere saber si desciende
 * @param {number} posibleJefeId la raiz de la rama
 * @returns {boolean}
 */
function cuelgaDe (staffId, posibleJefeId) {
  const vistos = new Set()
  let actual = staffId

  while (actual !== null && actual !== undefined) {
    if (actual === posibleJefeId) return true
    if (vistos.has(actual)) return false

    vistos.add(actual)
    actual = STAFF.find((otra) => otra.id === actual)?.jefe_staffid ?? null
  }

  return false
}

/**
 * Presenta el catálogo compartido con el nombre y conteo esperados por administración.
 * @param {object} area fila del catálogo de jerarquía
 * @returns {object} área con sus integrantes de todas las membresías
 */
function presentarAreaDeAccesos (area) {
  const { name, ...datos } = area
  return { ...datos, nombre: name, personas: contarPersonas((persona) => areasDePersona(persona).includes(area.id)) }
}

/** Alta, edicion y borrado de areas, con el rechazo de ciclos. */
async function areasDeAccesos (metodo, id, cuerpo) {
  if (metodo === 'POST' && id === undefined) {
    const datos = await cuerpo()
    const nombre = String(datos.nombre ?? '').trim()

    if (nombre === '') {
      throw new ErrorApi(422, 'validation_failed', 'El nombre es obligatorio.', { nombre: ['required'] })
    }

    const area = {
      id: siguienteId(AREAS),
      name: nombre,
      area_superior_id: datos.area_superior_id ?? null,
      jefe_staffid: datos.jefe_staffid ?? null
    }

    AREAS.push(area)

    return { estado: 201, cuerpo: conDatos(presentarAreaDeAccesos(area)) }
  }

  const area = AREAS.find((una) => una.id === Number(id))

  if (!area) throw new ErrorApi(404, 'not_found', 'No existe esa área.')

  if (metodo === 'PUT') {
    const datos = await cuerpo()
    const nombre = String(datos.nombre ?? '').trim()

    if (nombre === '') {
      throw new ErrorApi(422, 'validation_failed', 'El nombre es obligatorio.', { nombre: ['required'] })
    }

    const superior = datos.area_superior_id ?? null

    if (superior !== null && haceCiclo(area.id, superior)) {
      throw new ErrorApi(422, 'validation_failed', 'Esa área superior haría un ciclo.', { area_superior_id: ['ciclo'] })
    }

    area.name = nombre
    area.area_superior_id = superior
    area.jefe_staffid = datos.jefe_staffid ?? null

    return {
      estado: 200,
      cuerpo: conDatos(presentarAreaDeAccesos(area))
    }
  }

  if (metodo !== 'DELETE') throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')

  const personas = contarPersonas((s) => areasDePersona(s).includes(area.id))

  if (personas > 0) {
    throw new ErrorApi(409, 'conflict', `Esa área tiene ${personas} persona(s) dentro. Muévelas antes de borrarla.`)
  }

  AREAS.splice(AREAS.indexOf(area), 1)

  return { estado: 204, cuerpo: null }
}

/** Si poner `superiorId` encima de `areaId` cerraria el arbol sobre si mismo. */
function haceCiclo (areaId, superiorId) {
  const vistas = new Set()
  let actual = superiorId

  while (actual !== null && actual !== undefined) {
    if (actual === areaId) return true
    if (vistas.has(actual)) return false

    vistas.add(actual)
    actual = AREAS.find((una) => una.id === actual)?.area_superior_id ?? null
  }

  return false
}

/** Alta, renombre y borrado de cargos. Los dos por defecto no se borran. */
async function cargosDeAccesos (metodo, id, cuerpo) {
  if (metodo === 'POST' && id === undefined) {
    const datos = await cuerpo()
    const nombre = String(datos.nombre ?? '').trim()

    if (nombre === '') {
      throw new ErrorApi(422, 'validation_failed', 'El nombre es obligatorio.', { nombre: ['required'] })
    }

    const cargo = { id: siguienteId(CARGOS_ACCESOS), nombre, porDefecto: false }
    CARGOS_ACCESOS.push(cargo)

    return { estado: 201, cuerpo: conDatos({ id: cargo.id, nombre: cargo.nombre, personas: 0 }) }
  }

  const cargo = CARGOS_ACCESOS.find((uno) => uno.id === Number(id))

  if (!cargo) throw new ErrorApi(404, 'not_found', 'No existe ese cargo.')

  if (metodo === 'PUT') {
    const datos = await cuerpo()
    const nombre = String(datos.nombre ?? '').trim()

    if (nombre === '') {
      throw new ErrorApi(422, 'validation_failed', 'El nombre es obligatorio.', { nombre: ['required'] })
    }

    cargo.nombre = nombre

    return {
      estado: 200,
      cuerpo: conDatos({
        id: cargo.id,
        nombre: cargo.nombre,
        personas: contarPersonas((s) => pertenenciaDe(s).cargo_id === cargo.id)
      })
    }
  }

  if (metodo !== 'DELETE') throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')

  if (cargo.porDefecto) {
    throw new ErrorApi(409, 'conflict', 'Ese cargo es uno de los por defecto de la instalación: no se borra.')
  }

  const personas = contarPersonas((s) => pertenenciaDe(s).cargo_id === cargo.id)

  if (personas > 0) {
    throw new ErrorApi(409, 'conflict', `Ese cargo lo tienen ${personas} persona(s).`)
  }

  CARGOS_ACCESOS.splice(CARGOS_ACCESOS.indexOf(cargo), 1)

  return { estado: 204, cuerpo: null }
}

/**
 * La jornada propia, con sus tres formas de abrirse.
 *
 * El mock no la servia, y por eso el modal de apertura no se podia probar sin levantar el board: sin
 * `GET /me/jornada` el control de la cabecera no llega a saber si falta abrirla y la ventana nunca
 * se asoma. Con esto el camino nuevo —abrir con Cliente, abrir en blanco, y ponerle el Cliente
 * despues— se recorre entero contra el mock.
 *
 * El estado vive en memoria y muere con el proceso, igual que el resto del mock: es un contrato
 * ejecutable, no una base de datos.
 */

/** La jornada abierta de cada persona, por `staff_id`. Como mucho una por cabeza. */
const JORNADAS = new Map()

/** De donde salen los ids de jornada y de cronometro. Basta con que no se repitan. */
let SIGUIENTE_JORNADA = 7000

/** Cuantos segundos pasaron desde un instante ISO. Nunca negativo. */
function segundosDesde (iso) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
}

/** El instante de ahora con la misma forma que usa el resto del mock. */
function ahoraIso () {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Lee un id opcional del cuerpo, con la misma regla que la API real.
 *
 * Ausente, `null`, `''` y `0` son "no elegi"; cualquier otra cosa que no sea un entero positivo es
 * 422. Tragarse la basura seria peor que rechazarla: dejaria la jornada sin destino mientras quien
 * la mando cree que eligio uno.
 */
function idOpcional (valor, campo) {
  if (valor === undefined || valor === null || valor === '' || valor === 0) return null

  if (!Number.isInteger(valor) || valor <= 0) {
    throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden guardar.', { [campo]: ['invalido'] })
  }

  return valor
}

/** El Cliente existe y no esta en la papelera, o 422. Devuelve su id. */
function exigirCliente (id) {
  const cliente = CLIENTES.find((c) => c.id === id)

  if (!cliente) {
    throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden guardar.', { client_id: ['no_encontrado'] })
  }

  return cliente.id
}

/** El Cliente de una jornada, ya con su nombre. Degrada a `null` si lo borraron despues. */
function clienteDeJornada (jornada) {
  if (jornada.client_id === null) return null

  const cliente = CLIENTES.find((c) => c.id === jornada.client_id)

  return cliente ? { id: cliente.id, name: cliente.company } : null
}

/** La jornada como viaja: con el Cliente resuelto y los segundos calculados por el servidor. */
function presentarJornada (jornada) {
  return {
    id: jornada.id,
    started_at: jornada.started_at,
    seconds: segundosDesde(jornada.started_at),
    client: clienteDeJornada(jornada)
  }
}

/** El cronometro corriendo, en la forma anidada que usan las dos rutas que lo devuelven. */
function presentarMedidor (medidor) {
  if (!medidor) return null

  const espacio = ESPACIOS.find((e) => e.id === medidor.project_id) ?? null
  const proceso = medidor.task_id === null ? null : PROCESOS.find((p) => p.id === medidor.task_id) ?? null

  return {
    id: medidor.id,
    project: espacio ? { id: espacio.id, name: espacio.name } : null,
    task: proceso ? { id: proceso.id, name: proceso.name, status: proceso.status } : null,
    start_time: medidor.start_time,
    seconds: segundosDesde(medidor.start_time)
  }
}

/** El cuerpo de `GET /me/jornada`, que es tambien lo que devuelven el POST y el PATCH. */
function estadoDelDia (staffId) {
  const jornada = JORNADAS.get(staffId) ?? null

  if (jornada === null) {
    return { open: null, seconds: 0, measured_seconds: 0, uncovered_seconds: 0, over_journey: false, timer: null }
  }

  const segundos = segundosDesde(jornada.started_at)
  const medidos = jornada.medidos + (jornada.timer ? segundosDesde(jornada.timer.start_time) : 0)

  return {
    open: presentarJornada(jornada),
    seconds: segundos,
    measured_seconds: medidos,
    uncovered_seconds: Math.max(0, segundos - medidos),
    // Ocho horas. El mock no las va a alcanzar en una sesion de prueba, pero la bandera existe igual.
    over_journey: segundos > 8 * 3600,
    timer: presentarMedidor(jornada.timer)
  }
}

/** Arranca el cronometro de la jornada abierta. 409 sin jornada, o con uno ya corriendo. */
function arrancarMedidor (staffId, { espacioId, procesoId }) {
  const jornada = JORNADAS.get(staffId)

  if (!jornada) throw new ErrorApi(409, 'conflict', 'No tienes ninguna jornada abierta.')
  if (jornada.timer) throw new ErrorApi(409, 'conflict', 'Ya tienes un cronómetro corriendo.')

  jornada.timer = {
    id: ++SIGUIENTE_JORNADA,
    project_id: espacioId,
    task_id: procesoId,
    start_time: ahoraIso()
  }

  return jornada.timer
}

/** Detiene el cronometro y acumula lo medido. 409 si no hay ninguno corriendo. */
function detenerMedidor (staffId) {
  const jornada = JORNADAS.get(staffId)

  if (!jornada || !jornada.timer) throw new ErrorApi(409, 'conflict', 'No tienes ningún cronómetro corriendo.')

  jornada.medidos += segundosDesde(jornada.timer.start_time)
  jornada.timer = null
}

/**
 * El Espacio y el Proceso del destino, comprobados igual que en la API real.
 *
 * El orden de las comprobaciones importa: el `task_id` huerfano se rechaza ANTES de mirar si el
 * Espacio existe, porque sin `project_id` no hay Espacio contra el que mirar nada.
 */
function resolverDestino (cuerpo) {
  const espacioId = idOpcional(cuerpo.project_id, 'project_id')
  const procesoId = idOpcional(cuerpo.task_id, 'task_id')

  if (procesoId !== null && espacioId === null) {
    throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden guardar.', {
      project_id: ['requerido_con_proceso']
    })
  }

  if (espacioId === null) return { espacioId: null, procesoId: null }

  const espacio = ESPACIOS.find((e) => e.id === espacioId)
  if (!espacio) throw new ErrorApi(404, 'not_found', 'Ese Espacio no existe o no lo puedes ver.')

  if (procesoId !== null) {
    const proceso = PROCESOS.find((p) => p.id === procesoId)
    if (!proceso) throw new ErrorApi(404, 'not_found', 'Ese Proceso no existe o no lo puedes ver.')

    if (proceso.rel_type !== 'project' || proceso.rel_id !== espacioId) {
      throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden guardar.', {
        task_id: ['no_pertenece_al_espacio']
      })
    }
  }

  return { espacioId, procesoId }
}

/** `/me/jornada`, `/me/jornada/resumen` y `/me/jornada/cierre`. */
async function jornadaRuta (metodo, resto, actual, cuerpo) {
  const sub = resto[1] ?? null

  if (sub === 'resumen') {
    if (metodo !== 'GET') throw new ErrorApi(404, 'not_found', 'Ruta de jornada desconocida.')

    const jornada = JORNADAS.get(actual.id)
    if (!jornada) throw new ErrorApi(404, 'not_found', 'No tienes ninguna jornada abierta.')

    const estado = estadoDelDia(actual.id)
    const medidor = presentarMedidor(jornada.timer)

    return {
      estado: 200,
      cuerpo: conDatos({
        jornada: presentarJornada(jornada),
        measured_seconds: estado.measured_seconds,
        uncovered_seconds: estado.uncovered_seconds,
        // Un item por cronometro corriendo. El mock no guarda el historico de cronometros
        // detenidos: lo que esta pantalla tiene que poder dibujar es el resumen vacio y el resumen
        // con una linea, y las dos formas salen de aca.
        items: medidor === null
          ? []
          : [{ project: medidor.project, task: medidor.task, seconds: medidor.seconds, corriendo: true }]
      })
    }
  }

  if (sub === 'cierre') {
    if (metodo !== 'POST') throw new ErrorApi(404, 'not_found', 'Ruta de jornada desconocida.')

    const jornada = JORNADAS.get(actual.id)
    if (!jornada) throw new ErrorApi(409, 'conflict', 'No tienes ninguna jornada abierta.')

    const detenidos = jornada.timer ? 1 : 0
    const segundos = segundosDesde(jornada.started_at)

    JORNADAS.delete(actual.id)

    return {
      estado: 200,
      cuerpo: conDatos({
        id: jornada.id,
        started_at: jornada.started_at,
        ended_at: ahoraIso(),
        seconds: segundos,
        auto_closed: false,
        timers_stopped: detenidos
      })
    }
  }

  if (sub !== null) throw new ErrorApi(404, 'not_found', 'Ruta de jornada desconocida.')

  if (metodo === 'GET') return { estado: 200, cuerpo: conDatos(estadoDelDia(actual.id)) }

  if (metodo === 'POST') {
    if (JORNADAS.has(actual.id)) throw new ErrorApi(409, 'conflict', 'Ya tienes una jornada abierta.')

    const entrada = (await cuerpo()) ?? {}
    // Todo se valida ANTES de crear nada: un Cliente invalido no abre la jornada.
    const { espacioId, procesoId } = resolverDestino(entrada)
    const clienteId = idOpcional(entrada.client_id, 'client_id')
    const cliente = clienteId === null ? null : exigirCliente(clienteId)

    JORNADAS.set(actual.id, {
      id: ++SIGUIENTE_JORNADA,
      started_at: ahoraIso(),
      client_id: cliente,
      medidos: 0,
      timer: null
    })

    // La jornada corre; el cronometro no. Solo el camino con Espacio arranca algo.
    if (espacioId !== null) arrancarMedidor(actual.id, { espacioId, procesoId })

    return { estado: 201, cuerpo: conDatos(estadoDelDia(actual.id)) }
  }

  if (metodo === 'PATCH') {
    const jornada = JORNADAS.get(actual.id)
    if (!jornada) throw new ErrorApi(409, 'conflict', 'No tienes ninguna jornada abierta.')

    const entrada = (await cuerpo()) ?? {}

    // La clave tiene que venir: un PATCH sin `client_id` es un error de quien lo manda, no un
    // borrado silencioso. Para quitarlo se manda `client_id: null` explicito.
    if (!('client_id' in entrada)) {
      throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden guardar.', { client_id: ['requerido'] })
    }

    const clienteId = idOpcional(entrada.client_id, 'client_id')
    jornada.client_id = clienteId === null ? null : exigirCliente(clienteId)

    return { estado: 200, cuerpo: conDatos(estadoDelDia(actual.id)) }
  }

  throw new ErrorApi(404, 'not_found', 'Ruta de jornada desconocida.')
}

// ---------------------------------------------------------------------------
// Semaforo de cuentas y Proyectos (`/scores`)
// ---------------------------------------------------------------------------

/**
 * Quien responde por cada cuenta (`tblwiwo_focales`), por id de cliente.
 *
 * No sale de `ADMINS_DE_CLIENTE` porque no son lo mismo: administrar la ficha de un cliente es un
 * permiso, y ser su focal es una responsabilidad. Dos cuentas quedan sin nadie a proposito —un
 * cliente sin focal es un estado normal, no un error, y es lo unico que deja probar el filtro "Sin
 * focal"—, y la primera persona cubre los cuatro tramos del semaforo para que la pantalla propia no
 * se vea entera de un solo color.
 */
const FOCALES_DE_CLIENTE = new Map([
  [1, [1]], [2, [1, 3]], [3, []], [4, [1]], [5, [2]], [6, []], [7, [1, 4]]
])

/** Estado "Terminado" de un Espacio. La foto diaria no puntua lo que ya se cerro. */
const ESTADO_ESPACIO_TERMINADO = 4

/** Los pesos del contrato, en puntos sobre 100: plazos 45, carga 30, vencimientos 25. */
const PESOS_DEL_SCORE = { plazos: 45, carga: 30, vencimientos: 25 }

/** Dias hacia atras que cuentan como "se movio" en la señal de carga. */
const DIAS_DE_VENTANA = 14

/**
 * Los estados de salud ya redactados, por id de Proyecto.
 *
 * En memoria y no en el fixture: lo que la pantalla tiene que poder mirar es la diferencia entre el
 * primer pedido —que redacta— y el segundo —que devuelve lo mismo sin pagar el modelo—, y eso solo
 * existe si el mock recuerda lo que ya escribio.
 */
const ESTADOS_DE_SALUD = new Map()

/**
 * El score de una fila, estable entre reinicios y repartido entre los cuatro tramos.
 *
 * Sale del id y no de los Procesos porque el calculo real es un promedio ponderado que corre en el
 * cron: replicarlo aca seria mantener dos formulas y que ninguna sea la verdadera. Lo que el mock si
 * tiene que garantizar es que la pantalla vea rojos, amarillos y verdes a la vez, y eso lo da el
 * reparto — nada de `Math.random()`, que cambiaria el semaforo en cada recarga.
 */
function scoreDeterminista (id) {
  return 18 + ((id * 23) % 83)
}

/** Los mismos cortes del contrato: verde >= 75, amarillo >= 50, rojo < 50, y `sin_datos` sin score. */
function semaforoDe (score) {
  if (score === null) return 'sin_datos'
  if (score >= 75) return 'verde'

  return score >= 50 ? 'amarillo' : 'rojo'
}

/** Puntos contra la foto anterior. Tambien derivada del id, con ganadores y perdedores. */
function variacionDeterminista (id) {
  return ((id * 11) % 15) - 7
}

/** El dia de la foto. El cron corre una vez al dia, asi que todas las filas comparten fecha. */
function fechaDeLaFoto () {
  return new Date().toISOString().slice(0, 10)
}

/** Dias enteros entre dos fechas `YYYY-MM-DD`, en signo positivo si la segunda es posterior. */
function diasEntre (desde, hasta) {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000)
}

/** Deja un sub-score dentro del rango del contrato: de 1 a 100, porque el 0 no existe. */
function acotarScore (valor) {
  return Math.min(100, Math.max(1, valor))
}

/**
 * Las tres señales de una fila, con los contadores sacados de los Procesos de verdad.
 *
 * Los contadores viajan siempre porque son lo que permite escribir "sin datos porque no hay un solo
 * Proceso con vencimiento" en vez de un guion. Los sub-scores, en cambio, se reparten alrededor del
 * total en vez de recalcularse: el promedio ponderado es del backend, y lo que el frontend necesita
 * es que las tres señales cuenten la misma historia que el semaforo.
 *
 * Una señal sin universo vale `null` —no cero—: su peso sale del divisor en el calculo real.
 *
 * @param {object[]} procesos los Procesos que la fila abarca
 * @param {number|null} score el total ya resuelto de la fila
 * @returns {object} las tres señales en la forma de `ScoreCliente['senales']`
 */
function senalesDe (procesos, score) {
  const hoy = fechaDeLaFoto()
  const abiertos = procesos.filter((p) => p.status !== ESTADO_COMPLETADO)
  const medibles = procesos.filter((p) => p.due_date !== null)
  const incumplidos = medibles.filter((p) => p.due_date < hoy && p.status !== ESTADO_COMPLETADO)
  const porVencer = abiertos.filter((p) => p.due_date !== null && p.due_date >= hoy && diasEntre(hoy, p.due_date) <= 7)
  // El fixture no guarda la ultima actividad de un Proceso, asi que el movimiento se reparte de
  // forma estable por id: si no, "estancados" seria siempre el total y la señal no diria nada.
  const conMovimiento = abiertos.filter((p) => p.id % 2 === 0)

  return {
    plazos: {
      peso: PESOS_DEL_SCORE.plazos,
      score: medibles.length === 0 ? null : acotarScore(score - 8),
      medibles: medibles.length,
      incumplidos: incumplidos.length,
      en_riesgo: porVencer.length,
      atraso_promedio: incumplidos.length === 0
        ? null
        : Math.round(incumplidos.reduce((suma, p) => suma + diasEntre(p.due_date, hoy), 0) * 10 / incumplidos.length) / 10
    },
    carga: {
      peso: PESOS_DEL_SCORE.carga,
      score: abiertos.length === 0 ? null : acotarScore(score),
      abiertos: abiertos.length,
      con_movimiento: conMovimiento.length,
      estancados: abiertos.length - conMovimiento.length,
      dias_ventana: DIAS_DE_VENTANA
    },
    vencimientos: {
      peso: PESOS_DEL_SCORE.vencimientos,
      score: abiertos.length === 0 ? null : acotarScore(score + 9),
      por_vencer: porVencer.length,
      criticos: porVencer.filter((p) => diasEntre(hoy, p.due_date) <= 2).length,
      vencidos: incumplidos.length
    }
  }
}

/** Los Espacios que entran en la foto del dia. Lo terminado ya no se puntua: no hay nada que cuidar. */
function espaciosDeLaFoto () {
  return ESPACIOS.filter((espacio) => espacio.status !== ESTADO_ESPACIO_TERMINADO)
}

/** Los Procesos que cuelgan de un Espacio. Los sueltos no son de nadie y no entran en ningun score. */
function procesosDeEspacio (espacio) {
  return PROCESOS.filter((p) => p.project?.id === espacio.id)
}

/**
 * La foto de un Proyecto, en la forma de `ScoreEspacio`.
 *
 * Un Proyecto sin un solo Proceso queda en `sin_datos` y no en 1: es ausencia de universo, no un
 * desastre, y la pantalla los pinta distinto.
 */
function scoreDeEspacio (espacio) {
  const procesos = procesosDeEspacio(espacio)
  const cliente = CLIENTES.find((c) => c.id === espacio.clientid) ?? null
  const score = procesos.length === 0 ? null : scoreDeterminista(espacio.id)

  return {
    project_id: espacio.id,
    espacio: espacio.name,
    client_id: cliente?.id ?? null,
    cliente: cliente?.company ?? null,
    fecha: fechaDeLaFoto(),
    score,
    semaforo: semaforoDe(score),
    variacion: score === null ? null : variacionDeterminista(espacio.id),
    procesos: procesos.length,
    senales: senalesDe(procesos, score),
    estado: ESTADOS_DE_SALUD.get(espacio.id) ?? null
  }
}

/**
 * La foto de una cuenta, en la forma de `ScoreCliente`.
 *
 * El score NO es el promedio de sus Proyectos: el backend lo calcula sobre las Tareas, y promediar
 * aca ensañaria a la pantalla una relacion que en produccion no se cumple.
 */
function scoreDeCliente (cliente) {
  const espacios = espaciosDeLaFoto().filter((espacio) => espacio.clientid === cliente.id)
  const procesos = espacios.flatMap(procesosDeEspacio)
  const score = espacios.length === 0 ? null : scoreDeterminista(cliente.id)

  return {
    client_id: cliente.id,
    cliente: cliente.company,
    fecha: fechaDeLaFoto(),
    score,
    semaforo: semaforoDe(score),
    variacion: score === null ? null : variacionDeterminista(cliente.id),
    espacios: espacios.length,
    procesos: procesos.length,
    senales: senalesDe(procesos, score),
    focales: (FOCALES_DE_CLIENTE.get(cliente.id) ?? [])
      .map((id) => STAFF.find((persona) => persona.id === id))
      .filter((persona) => persona !== undefined)
      .map((persona) => ({ id: persona.id, full_name: persona.full_name }))
  }
}

/**
 * Del peor score al mejor, y lo que no se puede puntuar al final.
 *
 * El orden lo pone el servidor, no la pantalla: un `sin_datos` arriba ocuparia el lugar de lo
 * urgente sin ser urgente. Los empates conservan el orden del fixture, que es el de alta.
 */
function ordenDelSemaforo (uno, otro) {
  return (uno.score ?? Infinity) - (otro.score ?? Infinity)
}

/**
 * `GET /scores` y `GET /scores/espacios`: el semaforo de las cuentas y el de sus Proyectos.
 *
 * Solo lectura: la foto la saca el cron una vez al dia y no hay forma de pedir un recalculo.
 * `?focal=me` recorta a las cuentas de quien pregunta; sin el parametro viaja la cartera entera, que
 * es la MISMA ruta y no un permiso aparte.
 *
 * @param {string[]} resto segmentos despues de `scores`
 * @param {URLSearchParams} parametros
 * @param {object} actual staff de la sesion
 * @returns {{estado: number, cuerpo: object}}
 * @throws {ErrorApi} 404 si el subrecurso no existe
 */
function scoresRuta (resto, parametros, actual) {
  const soloMias = parametros.get('focal') === 'me'
  const cuentas = CLIENTES.filter((cliente) => (
    !soloMias || (FOCALES_DE_CLIENTE.get(cliente.id) ?? []).includes(actual.id)
  ))

  if (resto.length === 0) {
    return { estado: 200, cuerpo: conDatos(cuentas.map(scoreDeCliente).sort(ordenDelSemaforo)) }
  }

  if (resto.length === 1 && resto[0] === 'espacios') {
    const suyos = new Set(cuentas.map((cliente) => cliente.id))

    return {
      estado: 200,
      cuerpo: conDatos(
        espaciosDeLaFoto().filter((espacio) => suyos.has(espacio.clientid))
          .map(scoreDeEspacio).sort(ordenDelSemaforo)
      )
    }
  }

  throw new ErrorApi(404, 'not_found', `Recurso de semáforo desconocido: "${resto.join('/')}".`)
}

/**
 * `POST /ia/proyectos/{id}/estado`: el parrafo con que la IA explica el semaforo de un Proyecto.
 *
 * Un Proyecto fuera de la foto del dia responde 409 y no 404, porque la pantalla distingue "todavia
 * no hay nada que explicar" de "la IA esta apagada" —esa es la rama del 404— y sin un caso asi en el
 * mock ese mensaje no se mira nunca.
 *
 * El segundo pedido sobre el mismo Proyecto devuelve lo ya escrito con `reutilizado: true`: es el
 * unico modo de ver que la pantalla no vuelve a cobrar el modelo por lo mismo.
 *
 * @param {string} id el Proyecto, tal como vino en la ruta
 * @returns {{estado: number, cuerpo: object}}
 * @throws {ErrorApi} 404 si el Proyecto no existe, 409 si no tiene foto de hoy
 */
function estadoDeEspacioIaRuta (id) {
  const espacio = buscarO404(ESPACIOS, Number(id), 'Espacio')

  if (espacio.status === ESTADO_ESPACIO_TERMINADO) {
    throw new ErrorApi(409, 'conflict', 'Todavía no hay foto de hoy de este Proyecto.')
  }

  const guardado = ESTADOS_DE_SALUD.get(espacio.id)

  if (guardado !== undefined) return { estado: 200, cuerpo: conDatos({ ...guardado, reutilizado: true }) }

  const { plazos, vencimientos } = scoreDeEspacio(espacio).senales
  const redactado = {
    texto: `El semáforo de ${espacio.name} lo explica el cumplimiento de plazos: ` +
      `${plazos.incumplidos} de ${plazos.medibles} Procesos con vencimiento llegaron tarde, y quedan ` +
      `${vencimientos.por_vencer} por vencer esta semana. Lo urgente es acordar fechas nuevas con el ` +
      'cliente antes de que se sumen los que vencen; el resto del trabajo viene al día.',
    generado_en: new Date().toISOString().slice(0, 19).replace('T', ' '),
    vigente: true
  }

  ESTADOS_DE_SALUD.set(espacio.id, redactado)

  return { estado: 200, cuerpo: conDatos({ ...redactado, reutilizado: false }) }
}

/**
 * El contacto de un token, o `null` si ese token no es de un contacto.
 *
 * Existe para la unica ruta que los dos sujetos piden con la MISMA url —la descarga de un adjunto del
 * Meeting Paper—: hay que poder preguntar de quien es el token sin que preguntarlo se convierta en un
 * 401 para el otro sujeto. No traga el error: lo traduce a "este token no es de un contacto", que es
 * justo lo que se esta preguntando.
 */
function contactoDelToken (token) {
  try {
    return sesion.resolverContacto(token, 'acceso')
  } catch {
    return null
  }
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

    // Catalogos que el portal necesita para pintar estados y ofrecer filtros. Es un subconjunto del
    // `/lookups` del panel: el cliente no tiene por que recibir roles ni departamentos.
    if (seccion === 'lookups') {
      return {
        estado: 200,
        cuerpo: conDatos({
          project_statuses: ESTADOS_ESPACIO,
          task_statuses: ESTADOS_PROCESO,
          task_priorities: PRIORIDADES
        })
      }
    }

    // Proyectos del cliente. Solo los de su empresa: el portal jamas lista los de otra, y una
    // prueba que no lo ejercite no distingue "filtra bien" de "no filtra".
    if (seccion === 'projects') {
      if (!contacto.permissions.includes('projects')) {
        throw new ErrorApi(403, 'forbidden', 'Este contacto no tiene acceso a proyectos.')
      }

      const mios = ESPACIOS.filter((espacio) => espacio.clientid === contacto.client_id)

      if (resto.length === 1) {
        const { filas, paginacion } = aplicarConsulta(mios.map(presentarEspacioPortal), parametros, {
          filtros: { status: 'status' }, orden: ['name', 'deadline', 'progress'], busqueda: ['name']
        })
        return { estado: 200, cuerpo: conDatos(filas, { pagination: paginacion }) }
      }

      const espacio = mios.find((e) => e.id === Number(resto[1]))
      if (!espacio) throw new ErrorApi(404, 'not_found', 'Proyecto inexistente.')

      if (resto.length === 2) {
        const suyo = COMPARTIDO_CON_EL_CLIENTE[espacio.id] ?? COMPARTIDO_CON_EL_CLIENTE.defecto

        return {
          estado: 200,
          cuerpo: conDatos({
            ...presentarEspacioPortal(espacio),
            image_url: espacio.image_url ?? null,
            project_created: espacio.project_created ?? espacio.datecreated ?? null,
            // Los importes y las horas estimadas solo con `view_finance_overview`: la clave **no
            // viaja** cuando no corresponde, que es distinto de viajar en cero.
            ...(suyo.finanzas
              ? {
                  project_cost: espacio.project_cost ?? null,
                  project_rate_per_hour: espacio.project_rate_per_hour ?? null,
                  estimated_hours: espacio.estimated_hours ?? null
                }
              : {}),
            tabs: pestaniasDelContacto(espacio.id, suyo),
            members: STAFF.filter((persona) => espacio.miembros.includes(persona.id))
              .map(({ id, full_name, profile_image_url }) => ({ id, full_name, profile_image_url }))
          })
        }
      }

      const tareasDelEspacio = PROCESOS.filter((p) => p.rel_type === 'project' && p.rel_id === espacio.id)
      // Que comparte este Proyecto con su cliente. En la API real son las 18 claves de
      // `available_features` y los `view_*` de `tblproject_settings`; aca se declaran por proyecto
      // para poder ejercitar los DOS lados de cada interruptor. Sin eso, una pestaña apagada y un
      // flag en 0 no se distinguen de un bug.
      const compartido = COMPARTIDO_CON_EL_CLIENTE[espacio.id] ?? COMPARTIDO_CON_EL_CLIENTE.defecto

      const pestanias = pestaniasDelContacto(espacio.id, compartido)

      /** 403 cuando el Proyecto no comparte esa pestaña, igual que `exigirPestania` de la API. */
      const exigirPestania = (pestania) => {
        if (!pestanias.includes(pestania)) {
          throw new ErrorApi(403, 'forbidden', `Este proyecto no comparte "${pestania}".`)
        }
      }

      if (resto[2] === 'tasks' && resto.length === 3) {
        exigirPestania('tasks')

        // El tablero devuelve una columna por estado con sus tarjetas, igual que el del panel: es la
        // misma lectura del mismo listado, y el cliente la abre igual que el equipo.
        if (parametros.get('vista') === 'tablero') {
          return {
            estado: 200,
            cuerpo: conDatos(tableroDeProcesos(
              tareasDelEspacio, parametros, presentarTareaPortal, CONSULTA_TAREAS_PORTAL
            ))
          }
        }

        const { filas, paginacion } = aplicarConsulta(tareasDelEspacio, parametros, CONSULTA_TAREAS_PORTAL)
        return { estado: 200, cuerpo: conDatos(filas.map(presentarTareaPortal), { pagination: paginacion }) }
      }

      // Detalle de una Tarea. Cuelga del Proyecto y no de `/portal/tasks/{id}`: la pertenencia es lo
      // que deja decidir si esa Tarea le corresponde a este contacto, y una de otro Proyecto es 404
      // —nunca 403—, porque para el no existe.
      if (resto[2] === 'tasks' && resto.length === 4) {
        exigirPestania('tasks')

        const tarea = tareasDelEspacio.find((t) => t.id === Number(resto[3]))
        if (!tarea) throw new ErrorApi(404, 'not_found', 'Tarea inexistente.')

        return { estado: 200, cuerpo: conDatos(presentarFichaPortal(tarea, compartido)) }
      }

      // Calendario de entregas. Misma forma que el listado —el calendario lee `due_date`— y ruta
      // propia porque la pestaña se habilita aparte, aunque reuse las condiciones de las Tareas.
      if (resto[2] === 'calendar' && resto.length === 3) {
        exigirPestania('calendar')

        const conFecha = tareasDelEspacio.filter((t) => (t.due_date ?? null) !== null)
        const { filas, paginacion } = aplicarConsulta(conFecha, parametros, CONSULTA_TAREAS_PORTAL)
        return { estado: 200, cuerpo: conDatos(filas.map(presentarTareaPortal), { pagination: paginacion }) }
      }

      // El resumen del Proyecto, podado: `logged_time` y `finance` viajan solo con su flag, y la
      // clave ausente es lo que deja al frontend distinguir "no corresponde" de "no hay".
      if (resto[2] === 'overview' && resto.length === 3) {
        exigirPestania('overview')
        return { estado: 200, cuerpo: conDatos(overviewParaContacto(espacio, compartido, pestanias)) }
      }

      if (resto[2] === 'discussions' && resto.length === 3) {
        exigirPestania('discussions')

        const compartidas = discusionesDeEspacio(espacio.id).filter((d) => d.show_to_customer)
        const { filas, paginacion } = aplicarConsulta(compartidas, parametros, CONSULTA_DISCUSIONES)

        return { estado: 200, cuerpo: conDatos(filas.map(presentarDiscusionPortal), { pagination: paginacion }) }
      }

      // Los comentarios cuelgan del hilo y el hilo del Proyecto: una discusion interna es 404 y no
      // 403, porque para este contacto no existe.
      if (resto[2] === 'discussions' && resto[4] === 'comments' && resto.length === 5) {
        exigirPestania('discussions')

        const hilo = discusionesDeEspacio(espacio.id)
          .find((d) => d.id === Number(resto[3]) && d.show_to_customer)
        if (!hilo) throw new ErrorApi(404, 'not_found', 'Discusión inexistente.')

        return { estado: 200, cuerpo: conDatos(comentariosDeDiscusion(hilo.id)) }
      }

      if (resto[2] === 'timesheets' && resto.length === 3) {
        exigirPestania('timesheets')

        const { filas, paginacion } = aplicarConsulta(horasDeEspacio(espacio.id), parametros, CONSULTA_HORAS)

        return { estado: 200, cuerpo: conDatos(filas.map(presentarHoraPortal), { pagination: paginacion }) }
      }

      if (resto[2] === 'gantt' && resto.length === 3) {
        exigirPestania('gantt')

        // Agrupar por miembro o por estado se **rechaza**, no se ignora: devolver otra cosa dejaria
        // al cliente creyendo que vio un gantt por miembros cuando vio uno por hitos.
        const agrupar = parametros.get('agrupar')
        if (agrupar !== null && agrupar !== 'milestones') {
          throw new ErrorApi(422, 'validation_failed', `Agrupación no disponible en el portal: "${agrupar}".`, {
            agrupar: ['unavailable']
          })
        }

        return {
          estado: 200,
          cuerpo: conDatos(ganttDeEspacio(espacio.id, idsDeEstado(parametros), HITOS_OCULTOS_AL_CLIENTE))
        }
      }

      if (resto[2] === 'milestones' && resto.length === 3) {
        exigirPestania('milestones')

        const hitos = HITOS.filter((h) => h.project_id === espacio.id && !HITOS_OCULTOS_AL_CLIENTE.includes(h.id)).map((hito) => {
          const suyas = tareasDelEspacio.filter((t) => t.milestone === hito.id)

          return {
            id: hito.id,
            name: hito.name,
            // La descripcion se comparte hito por hito, no por proyecto: `RecursoHitos::paraContacto()`
            // manda la clave siempre y la pone en null donde el equipo no la marco compartible.
            description: hito.description_visible_to_customer === true ? hito.description : null,
            start_date: hito.start_date,
            due_date: hito.due_date,
            project_id: hito.project_id,
            color: hito.color,
            order: hito.milestone_order,
            date_created: hito.datecreated,
            counts: { tasks: suyas.length, tasks_done: suyas.filter((t) => t.status === 5).length },
            vencido: hito.due_date !== null && hito.due_date < '2026-09-11'
          }
        })

        // Filtros, busqueda y orden, como `paraContacto()`; **sin paginar**, que ese endpoint no
        // pagina para ninguno de los dos sujetos: un Proyecto tiene decenas de hitos, no miles.
        const consultaDeHitos = new URLSearchParams(parametros)
        consultaDeHitos.delete('page')
        consultaDeHitos.set('per_page', '100')
        const { filas } = aplicarConsulta(hitos, consultaDeHitos, CONSULTA_HITOS_PORTAL)

        return { estado: 200, cuerpo: conDatos(filas) }
      }

      if (resto[2] === 'files' && resto.length === 3) {
        // Uno externo a proposito: es el caso que el portal no sabia distinguir antes de compartir
        // `origenDeArchivo`, y sin una fila asi ninguna prueba lo nota.
        return {
          estado: 200,
          cuerpo: conDatos([
            {
              id: 900 + espacio.id,
              file_name: `acta_${espacio.id}_5f3a.pdf`,
              original_file_name: 'acta.pdf',
              subject: 'Acta de la reunión inicial',
              filetype: 'application/pdf',
              date_added: '2026-08-02T11:00:00Z',
              url: `/api/v1/files/${900 + espacio.id}/download`,
              thumbnail_url: null
            },
            {
              id: 950 + espacio.id,
              file_name: 'plano.dwg',
              original_file_name: null,
              subject: null,
              filetype: 'application/acad',
              date_added: '2026-08-05T09:30:00Z',
              url: 'https://drive.ejemplo.cl/plano',
              thumbnail_url: null,
              external: 'gdrive'
            }
          ])
        }
      }

      // El Meeting Paper del cliente. Mismo listado que el del equipo —la API usa la misma consulta,
      // asi que conserva orden, busqueda y paginacion— con la forma podada, y la ficha con su
      // contenido y sus adjuntos. Solo GET: las cuatro escrituras del acta son del panel.
      if (resto[2] === 'actas' && (resto.length === 3 || resto.length === 4)) {
        exigirPestania('actas')

        const suyas = ACTAS.filter((a) => a.project_id === espacio.id)

        if (resto.length === 3) {
          const { filas, paginacion } = aplicarConsulta(suyas, parametros, CONSULTA_ACTAS)

          return {
            estado: 200,
            cuerpo: conDatos(filas.map((a) => presentarActaPortal(a, { conContenido: false })), { pagination: paginacion })
          }
        }

        const acta = suyas.find((a) => a.id === Number(resto[3]))
        if (!acta) throw new ErrorApi(404, 'not_found', 'No existe ese Meeting Paper.')

        return { estado: 200, cuerpo: conDatos(presentarActaPortal(acta, { conContenido: true })) }
      }

      // Solo lo que el equipo marco visible, y sin la marca: al portal no llega la clave que la
      // decide, que es lo que hace que la fila del cliente no lleve interruptor.
      if (resto[2] === 'activity' && resto.length === 3) {
        exigirPestania('activity')

        const visibles = actividadDeEspacio(espacio.id).filter((e) => e.visible_to_customer)
        const { filas, paginacion } = aplicarConsulta(visibles, parametros, CONSULTA_ACTIVIDAD)

        return { estado: 200, cuerpo: conDatos(filas.map(presentarActividadPortal), { pagination: paginacion }) }
      }

      throw new ErrorApi(404, 'not_found', `Recurso desconocido: "${resto[2] ?? ''}".`)
    }

    throw new ErrorApi(404, 'not_found', `Recurso desconocido: "${seccion ?? ''}".`)
  }

  // `GET /files/acta/{id}/download`: el binario de un adjunto del Meeting Paper, para los DOS
  // sujetos.
  //
  // Va antes de la puerta del panel porque la API emite la misma url para el equipo y para el
  // cliente —no existe `/portal/files/...`—, asi que un adjunto abierto desde el portal llegaria acá
  // con un token de contacto y moriria en el 401 del panel. La guarda del contacto es la de
  // `Descargas`: el acta tiene que ser de un Espacio de su cliente y con la pestaña `actas`
  // encendida. Sin eso, la ficha publicaba una url que el propio cliente no podia abrir.
  //
  // Es el unico binario que el mock sirve de verdad, y es a proposito: la ficha del acta pinta las
  // fotos como miniatura, asi que con metadata en JSON no hay forma de ver si el titulo y el boton
  // quedaron bien puestos respecto de la imagen.
  if (recurso === 'files' && metodo === 'GET' && resto[0] === 'acta' && resto[2] === 'download') {
    const contacto = contactoDelToken(token)
    const acta = ACTAS.find((a) => (a.attachments ?? []).some((adj) => adj.id === Number(resto[1])))
    const adjunto = (acta?.attachments ?? []).find((a) => a.id === Number(resto[1]))

    // Sin sesion de contacto tiene que haberla de staff, y un token invalido muere acá igual.
    if (contacto === null) sesion.resolver(token, 'acceso')

    if (adjunto === undefined) throw new ErrorApi(404, 'not_found', 'No existe ese adjunto.')

    if (contacto !== null) {
      const espacio = ESPACIOS.find((e) => e.id === acta.project_id)
      const suyo = espacio !== undefined && espacio.clientid === contacto.client_id
      // 404 y no 403: para este contacto ese adjunto no existe.
      if (!suyo || !ajustesDelPortal(acta.project_id).wiwo_portal_actas) {
        throw new ErrorApi(404, 'not_found', 'No existe ese adjunto.')
      }
    }

    return {
      transmitir: (respuesta) => {
        respuesta.writeHead(200, {
          'Content-Type': adjunto.filetype === '' ? 'application/octet-stream' : adjunto.filetype,
          'Content-Disposition': `attachment; filename="${adjunto.name.replace(/"/g, '')}"`,
          'X-Content-Type-Options': 'nosniff'
        })
        respuesta.end(PLACEHOLDER_PNG)
      }
    }
  }

  // --- A partir de acá, todo exige token ----------------------------------
  const actual = sesion.resolver(token, 'acceso')

  // --- Sesión como otra persona (`POST /impersonate`) ----------------------
  //
  // Va acá arriba y no entre los recursos: no es un recurso, es otra puerta de sesión, y la única que
  // devuelve tokens con un token ya en la mano.
  if (recurso === 'impersonate') {
    if (metodo !== 'POST' || resto.length > 0) throw new ErrorApi(404, 'not_found', 'Acción desconocida.')
    if (!actual.is_superadmin) {
      throw new ErrorApi(403, 'forbidden', 'Solo un superadministrador entra al panel como otra persona.')
    }

    const datos = await cuerpo()
    const objetivoId = Number(datos.staff_id)

    if (!Number.isInteger(objetivoId)) {
      throw new ErrorApi(422, 'validation_failed', 'Falta "staff_id".', { staff_id: ['required'] })
    }
    if (objetivoId === actual.id) {
      throw new ErrorApi(422, 'validation_failed', 'Ya estás en tu propia cuenta.', { staff_id: ['propio'] })
    }

    const objetivo = STAFF.find((s) => s.id === objetivoId)

    if (!objetivo) throw new ErrorApi(404, 'not_found', 'No existe esa persona.')
    if (!objetivo.active) {
      throw new ErrorApi(422, 'validation_failed', 'Esa cuenta está dada de baja.', { staff_id: ['inactivo'] })
    }

    return {
      estado: 201,
      cuerpo: conDatos({ ...sesion.emitirSesion(objetivo.id), staff: presentarStaff(objetivo) })
    }
  }

  // La jornada propia y sus tres formas de abrirse. Va ANTES del bloque de `me` por el mismo motivo
  // que "Mi Área": ese bloque contesta la ficha de la persona a cualquier resto, asi que sin esta
  // rama `GET /me/jornada` devolveria un staff y el control de la cabecera leeria `open` de un objeto
  // que no lo tiene — o sea "no hay jornada abierta" para siempre, y el modal de apertura en bucle.
  if (recurso === 'me' && resto[0] === 'jornada') {
    return await jornadaRuta(metodo, resto, actual, cuerpo)
  }

  // Los cronometros. Arrancar uno sobre una jornada ya abierta es como se le pone destino al dia que
  // se abrio sin el, asi que sin estas rutas la segunda mitad del camino nuevo no se puede recorrer.
  //
  // `tasks/{id}/timer` se resuelve aca y no en el bloque de procesos porque el cronometro es uno solo
  // por persona y vive en la jornada: dos almacenes del mismo hecho es como el mock deja de ser un
  // contrato ejecutable. `timer_activo` del proceso se mantiene al dia igual, que es lo que lee su
  // ficha.
  if ((recurso === 'projects' || recurso === 'tasks') && resto[1] === 'timer') {
    const id = Number(resto[0])
    if (!Number.isInteger(id) || id <= 0) throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')

    if (recurso === 'projects') {
      const espacio = buscarO404(ESPACIOS, id, 'Espacio')

      if (metodo === 'POST') {
        return { estado: 201, cuerpo: conDatos(presentarMedidor(arrancarMedidor(actual.id, { espacioId: espacio.id, procesoId: null }))) }
      }
      if (metodo === 'DELETE') {
        detenerMedidor(actual.id)
        return { estado: 204, cuerpo: null }
      }

      throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')
    }

    const proceso = buscarO404(PROCESOS, id, 'Proceso')
    // Un Proceso que cuelga de un cliente y no de un Espacio deja el medidor sin Espacio: es el caso
    // polimorfico que los fixtures ya traen, y la interfaz tiene que sobrevivirlo.
    const espacioId = proceso.rel_type === 'project' ? proceso.rel_id : null

    if (metodo === 'POST') {
      const medidor = arrancarMedidor(actual.id, { espacioId, procesoId: proceso.id })
      proceso.timer_activo = { id: medidor.id, staff_id: actual.id, start_time: medidor.start_time }

      return { estado: 201, cuerpo: conDatos(presentarMedidor(medidor)) }
    }
    if (metodo === 'DELETE') {
      detenerMedidor(actual.id)
      proceso.timer_activo = null

      return { estado: 204, cuerpo: null }
    }

    throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')
  }

  // `DELETE /live/timers/{id}`: detener desde la cabecera, sin saber sobre que se estaba midiendo.
  // El id no se compara porque el mock tiene un cronometro por persona; lo que importa es de quien.
  if (recurso === 'live' && resto[0] === 'timers' && metodo === 'DELETE') {
    const jornada = JORNADAS.get(actual.id)
    const proceso = jornada?.timer?.task_id == null ? null : PROCESOS.find((p) => p.id === jornada.timer.task_id)

    detenerMedidor(actual.id)
    if (proceso) proceso.timer_activo = null

    return { estado: 204, cuerpo: null }
  }

  // `GET /me/mi-area`. Va ANTES del bloque de `me`, que responde la propia ficha a cualquier resto:
  // sin esta rama, "Mi Área" recibia el staff en vez de `{area, area_staff}` y la pantalla reventaba
  // al leer `area_staff.length`. El mock no la tenia y por eso nadie lo habia notado.
  if (recurso === 'me' && resto[0] === 'mi-area' && metodo === 'GET') {
    const area = AREAS.find((otra) => otra.id === actual.area_id) ?? null

    return {
      estado: 200,
      cuerpo: conDatos({
        area: area === null ? null : { id: area.id, name: area.name },
        // Todo el mundo del area, bajas incluidas: la pantalla las marca como "Dada de baja".
        area_staff: area === null
          ? []
          : STAFF.filter((persona) => areasDePersona(persona).includes(area.id)).map(presentarStaff)
      })
    }
  }

  if (recurso === 'me' && metodo === 'GET') {
    return {
      estado: 200,
      cuerpo: conDatos({
        ...presentarStaff(actual),
        permissions: permisosDe(actual),
        // Dirigir un area sale del `jefe_staffid` del arbol, no de un cargo: asi el mock no puede
        // decir que alguien dirige algo mientras `/jerarquia` le contesta 403 por no tener ninguna.
        // `is_director` es otra cosa —el cargo de `tblcargos`— y se deja como estaba.
        dirige_areas: AREAS.some((area) => area.jefe_staffid === actual.id),
        // Los dos ejes del modelo nuevo: el escalon dice que puesto ocupa, y el jefe de quien
        // cuelga. Ninguno otorga capacidades —eso es `permissions` y las banderas de Perfex—, pero
        // son lo que la interfaz usa para saber que le toca ver.
        escalon: actual.escalon,
        jefe_staffid: actual.jefe_staffid ?? null,
        // Tener gente a cargo: alguien cuelga de ella, o dirige un area. Se resuelve por el mismo
        // `esJefatura()` que usa `/accesos`, para que el mock no diga dos cosas del mismo dato.
        es_jefatura: esJefatura(actual),
        secciones_habilitadas: ['procesos', 'espacios', 'salas'],
        locale: 'es'
      })
    }
  }

  if (recurso === 'rooms') {
    return await salasRuta(metodo, resto, parametros, actual, cuerpo)
  }

  // Ajustes de la instalacion. El frontend lee de acá `ia_habilitada`, que decide si la pestaña del
  // asistente existe y si se puede escribir un Meeting Paper. Viene en `1` para que el mock sirva
  // para probar la capa de IA; la instalacion real arranca en `0`.
  if (recurso === 'settings' && metodo === 'GET') {
    return {
      estado: 200,
      cuerpo: conDatos({
        editable: {
          ia_habilitada: { value: true, tipo: 'bool' },
          ia_tope_tokens: { value: 700, tipo: 'int' }
        }
      })
    }
  }

  // Incidentes: los errores registrados, y la via de alta que usa el panel para reportar los que la
  // API no vio. Se mockea porque es el unico circuito del producto en el que el frontend ESCRIBE
  // cuando algo ya se rompio: sin esto no hay forma de probar que el codigo que muestra el aviso
  // flotante es el que devolvio el alta.
  if (recurso === 'incidentes') {
    return await incidentesRuta(metodo, resto, parametros, actual, cuerpo)
  }

  // Panel de accesos: escalones, roles, personas, areas, cargos e interruptores.
  if (recurso === 'accesos') {
    return await accesosRuta(metodo, resto, parametros, actual, cuerpo)
  }

  if (recurso === 'ia') {
    return await iaRuta(metodo, resto, parametros, actual, cuerpo, peticion)
  }

  // El semáforo: las dos lecturas que monta la pantalla de Focals. Sin ellas la pantalla no se puede
  // abrir contra el mock, que es justo donde se mira antes de que exista el cron.
  if (recurso === 'scores' && metodo === 'GET') {
    return scoresRuta(resto, parametros, actual)
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
        departments: DEPARTAMENTOS,
        // El catalogo de areas sale del mismo array que administra `/jerarquia`: dos listas separadas
        // divergen apenas alguien crea un area desde el organigrama.
        areas: AREAS.map(({ id, name }) => ({ id, name })),
        empresas: EMPRESAS_DEL_GRUPO
      })
    }
  }

  if (recurso === 'jerarquia') return jerarquiaRuta(metodo, resto, cuerpo, actual)

  // El organigrama visual: una sola lectura para las dos pantallas que lo montan. La API ya recorta
  // por quien pregunta, asi que el frontend no repite la regla de visibilidad.
  if (recurso === 'organigrama') {
    if (metodo !== 'GET') throw new ErrorApi(404, 'not_found', 'Verbo no soportado en /organigrama.')

    return { estado: 200, cuerpo: conDatos(organigramaDe(actual)) }
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

  // Edicion de la ficha de una persona. Los permisos NO se editan por aca: en el modelo nuevo son
  // los mismos para todo el que no sea administrador, y las casillas por persona ya no existen.
  if (recurso === 'staff' && metodo === 'PATCH') {
    exigirPermiso(actual, 'staff', 'edit')
    const persona = buscarO404(STAFF, Number(resto[0]), 'staff')
    const datos = await cuerpo()

    const areasNuevas = validarAreasDePersona(datos)

    if (areasNuevas !== undefined) {
      guardarAreasDePersona(persona, areasNuevas)
      if (datos.area_id !== undefined) persona.area_id = datos.area_id === null ? null : Number(datos.area_id)
    }

    for (const bandera of ['is_admin', 'is_superadmin']) {
      if (datos[bandera] !== undefined) persona[bandera] = datos[bandera] === true
    }

    return { estado: 200, cuerpo: conDatos(fichaDeStaff(persona)) }
  }

  if (recurso === 'staff' && metodo === 'GET') {
    // Asignar requiere sesión, no acceso al legajo; la proyección nunca expone correo ni permisos.
    if (resto[0] === 'asignables') {
      if (resto.length !== 1) throw new ErrorApi(404, 'not_found', 'Ruta de asignables desconocida.')
      const personas = STAFF.filter((persona) => persona.active && !persona.is_not_staff)
        .sort((a, b) => a.firstname.localeCompare(b.firstname))
        .map((persona) => ({
          id: persona.id, full_name: persona.full_name, profile_image_url: persona.profile_image_url,
          area_id: persona.area_id ?? null, area_ids: areasDePersona(persona), cargo_id: persona.cargo_id ?? null
        }))
      const { filas, paginacion } = aplicarConsulta(personas, parametros, {
        filtros: {}, orden: ['full_name'], busqueda: ['full_name']
      })
      return { estado: 200, cuerpo: conDatos(filas, { pagination: paginacion }) }
    }
    exigirPermiso(actual, 'staff', 'view')
    if (resto.length === 0) {
      const { filas, paginacion } = aplicarConsulta(STAFF.map(presentarStaff), parametros, CONSULTA_STAFF)
      return { estado: 200, cuerpo: conDatos(filas, { pagination: paginacion }) }
    }
    return { estado: 200, cuerpo: conDatos(fichaDeStaff(buscarO404(STAFF, Number(resto[0]), 'staff'))) }
  }

  // --- Personas asignadas a un cliente --------------------------------------
  //
  // Antes del bloque de `clients`, que es solo GET, por el mismo motivo que los contactos: un PUT
  // caeria al 404 final.
  //
  // La lista se reemplaza entera, como en la API: la respuesta del PUT es la lista ya guardada, que
  // es lo que el panel vuelve a pintar.
  if (recurso === 'clients' && resto[1] === 'admins') {
    const cliente = buscarO404(CLIENTES, Number(resto[0]), 'cliente')

    if (metodo === 'PUT') {
      exigirPermiso(actual, 'customers', 'edit')
      const datos = await cuerpo()

      if (!Array.isArray(datos.admins)) {
        throw new ErrorApi(422, 'validation_failed', 'Falta la lista de personas.', { admins: ['required'] })
      }

      const ids = [...new Set(datos.admins.map(Number))]

      if (ids.some((id) => !STAFF.some((persona) => persona.id === id))) {
        throw new ErrorApi(422, 'validation_failed', 'Hay personas que no existen.', { admins: ['unknown'] })
      }

      ADMINS_DE_CLIENTE.set(cliente.id, ids)
    }

    exigirPermiso(actual, 'customers', 'view')
    const asignados = ADMINS_DE_CLIENTE.get(cliente.id) ?? []

    return { estado: 200, cuerpo: conDatos(STAFF.filter((s) => asignados.includes(s.id)).map(presentarStaff)) }
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

  // Que ve el cliente de un Espacio. Va antes del bloque de `projects` por lo mismo que las actas:
  // ese bloque solo atiende GET, y este endpoint tambien acepta PUT.
  if (recurso === 'projects' && resto[1] === 'portal-settings') {
    if (resto.length !== 2) throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')

    const espacio = buscarO404(ESPACIOS, Number(resto[0]), 'espacio')

    if (metodo === 'GET') {
      exigirPermiso(actual, 'projects', 'view')

      return { estado: 200, cuerpo: conDatos(ajustesDelPortal(espacio.id)) }
    }

    // Ni PATCH ni POST ni DELETE: el bloque se reemplaza entero o no se toca.
    if (metodo !== 'PUT') throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')

    // Ser miembro no alcanza para escribir: la membresia abre ver.
    exigirPermiso(actual, 'projects', 'edit')

    const datos = await cuerpo()
    const errores = {}

    // Una clave de mas es 422 y no se ignora: `tblproject_settings` guarda tambien las 18 `view_*`
    // del panel clasico, y aceptar nombres libres seria escribir cualquiera de ellas desde acá.
    for (const clave of Object.keys(datos)) {
      if (clave !== 'wiwo_portal_actas') errores[clave] = ['desconocida']
    }

    const encendido = booleanoDelPortal(datos.wiwo_portal_actas)

    // Es un PUT: la clave que falta es 422, no "dejala como estaba". Un formulario al que se le cae
    // un campo en el camino no puede guardar a medias.
    if (!Object.hasOwn(datos, 'wiwo_portal_actas')) errores.wiwo_portal_actas = ['required']
    else if (encendido === null) errores.wiwo_portal_actas = ['boolean']

    if (Object.keys(errores).length > 0) {
      throw new ErrorApi(422, 'validation_failed', 'Revisá los interruptores del portal.', errores)
    }

    AJUSTES_DEL_PORTAL.set(espacio.id, encendido)

    return { estado: 200, cuerpo: conDatos(ajustesDelPortal(espacio.id)) }
  }

  // Meeting Paper. Va antes del bloque de `projects`, que solo atiende GET: las actas se crean,
  // editan y borran, asi que necesitan su propia rama con los cuatro verbos.
  if (recurso === 'projects' && resto[1] === 'actas') {
    const espacio = buscarO404(ESPACIOS, Number(resto[0]), 'espacio')
    const suyas = ACTAS.filter((a) => a.project_id === espacio.id)
    const actaId = resto[2] === undefined ? null : Number(resto[2])

    if (actaId === null) {
      if (metodo === 'POST') {
        const datos = await cuerpo()
        const titulo = String(datos.title ?? '').trim()
        if (titulo === '') {
          throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden escribir.', { title: ['required'] })
        }

        const acta = guardarActa(espacio, actual, { ...datos, title: titulo }, String(datos.content ?? ''), 'manual')

        return { estado: 201, cuerpo: conDatos(presentarActa(acta, { conContenido: true })) }
      }

      const { filas, paginacion } = aplicarConsulta(suyas, parametros, CONSULTA_ACTAS)

      return {
        estado: 200,
        cuerpo: conDatos(filas.map((a) => presentarActa(a, { conContenido: false })), { pagination: paginacion })
      }
    }

    const acta = suyas.find((a) => a.id === actaId)
    if (acta === undefined) throw new ErrorApi(404, 'not_found', 'No existe ese Meeting Paper.')

    if (metodo === 'PATCH') {
      const datos = await cuerpo()
      for (const clave of ['title', 'content', 'client', 'meeting_date', 'place', 'modality', 'brand']) {
        if (datos[clave] !== undefined) acta[clave] = datos[clave]
      }
      if (Array.isArray(datos.attendees)) acta.attendees = datos.attendees
      acta.date_updated = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
      acta.updated_by = actual.id

      return { estado: 200, cuerpo: conDatos(presentarActa(acta, { conContenido: true })) }
    }

    if (metodo === 'DELETE') {
      // Solo el autor o un administrador, igual que el backend.
      if (acta.staff_id !== actual.id && actual.is_admin !== true) {
        throw new ErrorApi(403, 'forbidden', 'Solo quien creó este Meeting Paper puede borrarlo.')
      }
      ACTAS.splice(ACTAS.indexOf(acta), 1)

      return { estado: 204, cuerpo: null }
    }

    return { estado: 200, cuerpo: conDatos(presentarActa(acta, { conContenido: true })) }
  }

  if (recurso === 'projects' && (metodo === 'GET' || (metodo === 'PATCH' && resto[1] === 'milestones' && resto[2] === 'orden'))) {
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
      const suyos = PROCESOS.filter((p) => p.project?.id === espacio.id && (parametros.get('filter[status]')?.trim() || p.status !== 5))

      // El tablero de la pestaña Tareas de un Espacio. Faltaba: el mock devolvia la lista plana y el
      // motor de tablero se quedaba sin columnas, asi que esa vista nunca se pudo ver contra el mock.
      if (parametros.get('vista') === 'tablero') {
        return {
          estado: 200,
          cuerpo: conDatos(tableroDeProcesos(
            PROCESOS.filter((p) => p.project?.id === espacio.id),
            parametros,
            presentarProcesoEnLista
          ))
        }
      }

      const { filas, paginacion } = aplicarConsulta(suyos, parametros, CONSULTA_PROCESOS)
      return { estado: 200, cuerpo: conDatos(filas.map(presentarProcesoEnLista), { pagination: paginacion }) }
    }
    if (subrecurso === 'task-types') {
      return { estado: 200, cuerpo: conDatos({
        aprobacion_requerida_por_defecto: false,
        task_types: TIPOS_PROCESO.filter((tipo) => tipo.project_id === espacio.id)
      }) }
    }
    if (subrecurso === 'milestones') {
      const hitos = HITOS.filter((h) => h.project_id === espacio.id).sort((a, b) => a.milestone_order - b.milestone_order)
      if (metodo === 'PATCH') {
        exigirPermiso(actual, 'projects', 'edit_milestones')
        const { orden } = await cuerpo()
        if (!Array.isArray(orden) || orden.length === 0) {
          throw new ErrorApi(422, 'validation_failed', 'Falta el orden.', { orden: ['required'] })
        }
        if (new Set(orden).size !== orden.length || orden.some((id) => !Number.isSafeInteger(id) || id <= 0 || !hitos.some((hito) => hito.id === id))) {
          throw new ErrorApi(422, 'validation_failed', 'Hay hitos que no son de este espacio.', { orden: ['unknown'] })
        }
        orden.forEach((id, posicion) => { hitos.find((hito) => hito.id === id).milestone_order = posicion + 1 })
        return { estado: 200, cuerpo: conDatos(hitos.sort((a, b) => a.milestone_order - b.milestone_order)) }
      }
      if (parametros.get('vista') !== 'tablero') return { estado: 200, cuerpo: conDatos(hitos) }

      const columnas = [
        { id: 0, name: 'Sin categorizar', color: null, order: -1 },
        ...hitos.map((h) => ({ id: h.id, name: h.name, color: h.color, order: h.milestone_order }))
      ]
      const tareas = PROCESOS.filter((p) => p.project?.id === espacio.id)
      const grupos = columnas.map((columna) => {
        const suyas = tareas.filter((p) => (p.milestone?.id ?? 0) === columna.id).map((p) => ({
          ...p,
          total_logged_seconds: CRONOMETROS.filter((t) => t.task_id === p.id).reduce((total, t) =>
            total + Math.max(0, (Date.parse(t.end_time ?? new Date().toISOString()) - Date.parse(t.start_time)) / 1000), 0)
        }))
        const visibles = suyas.filter((p) => parametros.get('excluir_completadas') === 'false' || p.status !== 5)
        const { filas, paginacion } = aplicarConsulta(visibles, parametros, {
          ...CONSULTA_PROCESOS, orden: ['order'], derivadas: { order: (p) => p.kanban_order }
        })
        const tarjetas = filas.map((p) => ({
          ...presentarProcesoEnLista(p),
          current_user_is_assigned: p.assignees.some((a) => a.id === actual.id),
          vencida: p.status !== 5 && p.due_date !== null && p.due_date < new Date().toISOString().slice(0, 10)
        }))
        return {
          columna: { ...columna, total_logged_seconds: suyas.reduce((total, p) => total + p.total_logged_seconds, 0) },
          tarjetas,
          pagination: paginacion
        }
      }).filter((grupo) => grupo.columna.id !== 0 || grupo.pagination.total > 0)
      return { estado: 200, cuerpo: conDatos(grupos) }
    }
    if (subrecurso === 'members') {
      return { estado: 200, cuerpo: conDatos(miembrosDe(espacio)) }
    }
    if (subrecurso === 'files') {
      const suyos = PROCESOS.filter((p) => p.project?.id === espacio.id).map((p) => p.id)
      return { estado: 200, cuerpo: conDatos(ARCHIVOS.filter((a) => suyos.includes(a.rel_id))) }
    }
    if (subrecurso === 'overview') {
      if (resto[2] === 'chart') {
        return { estado: 200, cuerpo: conDatos(graficoDeEspacio(espacio.id, parametros.get('periodo') ?? 'esta_semana')) }
      }
      if (resto.length > 2) throw new ErrorApi(404, 'not_found', `Subrecurso desconocido: "${resto[2]}".`)

      return { estado: 200, cuerpo: conDatos(overviewDeEspacio(espacio)) }
    }
    if (subrecurso === 'discussions') {
      const { filas, paginacion } = aplicarConsulta(discusionesDeEspacio(espacio.id), parametros, CONSULTA_DISCUSIONES)
      return { estado: 200, cuerpo: conDatos(filas, { pagination: paginacion }) }
    }
    if (subrecurso === 'activity') {
      const { filas, paginacion } = aplicarConsulta(actividadDeEspacio(espacio.id), parametros, CONSULTA_ACTIVIDAD)
      return { estado: 200, cuerpo: conDatos(filas, { pagination: paginacion }) }
    }
    if (subrecurso === 'timesheets') {
      const horas = horasDeEspacio(espacio.id)

      // Quienes cargaron horas en ESTE proyecto, que es de donde sale el filtro por persona. No es
      // `/lookups`: un desplegable con todo el equipo ofreceria personas sin un solo registro.
      if (resto[2] === 'staff') {
        const vistos = new Map(horas.map((r) => [r.staff.id, r.staff]))
        return {
          estado: 200,
          cuerpo: conDatos([...vistos.values()].map(({ id, full_name: nombre, profile_image_url: foto }) => ({
            id, full_name: nombre, profile_image_url: foto
          })))
        }
      }
      if (resto.length > 2) throw new ErrorApi(404, 'not_found', `Subrecurso desconocido: "${resto[2]}".`)

      const { filas, paginacion } = aplicarConsulta(horas, parametros, CONSULTA_HORAS)
      return { estado: 200, cuerpo: conDatos(filas, { pagination: paginacion }) }
    }
    if (subrecurso === 'gantt') {
      return { estado: 200, cuerpo: conDatos(ganttDeEspacio(espacio.id, idsDeEstado(parametros))) }
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
        const columnas = ESTADOS_PROCESO.filter((e) => parametros.get('filter[status]')?.trim() || e.id !== 5).sort((a, b) => a.order - b.order)
        return {
          estado: 200,
          cuerpo: conDatos(columnas.map((columna) => {
            const parametrosColumna = new URLSearchParams(parametros)
            parametrosColumna.set('filter[status]', String(columna.id))
            const { filas, paginacion } = aplicarConsulta(PROCESOS.filter((p) => !parametros.get('filter[status]')?.trim() || parametros.get('filter[status]').split(',').includes(String(p.status))), parametrosColumna, CONSULTA_PROCESOS)
            return {
              columna: { id: columna.id, name: columna.name, color: columna.color, order: columna.order },
              tarjetas: filas.map(presentarProcesoEnLista),
              pagination: paginacion
            }
          }))
        }
      }

      const { filas, paginacion } = aplicarConsulta(PROCESOS.filter((p) => parametros.get('filter[status]')?.trim() || p.status !== 5), parametros, CONSULTA_PROCESOS)
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
      return { estado: 200, cuerpo: conDatos(comentariosDeTarea(proceso.id)) }
    }
    if (metodo === 'GET' && subrecurso === 'checklist') {
      return { estado: 200, cuerpo: conDatos(CHECKLIST.filter((c) => c.task_id === proceso.id)) }
    }
    if (metodo === 'POST' && subrecurso === 'checklist') {
      const item = {
        id: CHECKLIST.reduce((mayor, c) => Math.max(mayor, c.id), 0) + 1,
        task_id: proceso.id,
        description: descripcionDeItem((await cuerpo()).description),
        finished: false,
        order: CHECKLIST.filter((c) => c.task_id === proceso.id).length + 1,
        assigned: null
      }
      CHECKLIST.push(item)
      proceso.counts.checklist += 1
      return { estado: 201, cuerpo: conDatos(item) }
    }
    if ((metodo === 'PATCH' || metodo === 'DELETE') && subrecurso === 'checklist') {
      const indice = CHECKLIST.findIndex((c) => c.task_id === proceso.id && c.id === Number(extra))
      if (indice === -1) throw new ErrorApi(404, 'not_found', `No existe el item "${extra}".`)

      const item = CHECKLIST[indice]

      if (metodo === 'DELETE') {
        CHECKLIST.splice(indice, 1)
        proceso.counts.checklist -= 1
        if (item.finished) proceso.counts.checklist_done -= 1
        return { estado: 204, cuerpo: null }
      }

      const parche = await cuerpo()
      if ('description' in parche) item.description = descripcionDeItem(parche.description)
      if ('finished' in parche) {
        if (typeof parche.finished !== 'boolean') {
          throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden guardar.', { finished: ['boolean'] })
        }
        if (item.finished !== parche.finished) {
          proceso.counts.checklist_done += parche.finished ? 1 : -1
          item.finished = parche.finished
        }
      }
      return { estado: 200, cuerpo: conDatos(item) }
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
/**
 * Un Espacio como lo devuelve el portal del cliente.
 *
 * La descripcion sale **con marcado**, que es lo que guarda el panel viejo y lo que manda la API
 * real. Sin eso, el mock nunca reproduce el `<p>` que el cliente terminaba leyendo en pantalla.
 */
function presentarEspacioPortal (espacio) {
  const tareas = PROCESOS.filter((p) => p.rel_type === 'project' && p.rel_id === espacio.id)

  return {
    id: espacio.id,
    name: espacio.name,
    description: `<p>${espacio.description}</p>`,
    status: espacio.status,
    start_date: espacio.start_date,
    deadline: espacio.deadline,
    date_finished: espacio.date_finished,
    progress: espacio.progress,
    counts: {
      tasks: tareas.length,
      tasks_open: tareas.filter((t) => t.status !== 5).length,
      milestones: HITOS.filter((h) => h.project_id === espacio.id).length
    }
  }
}

/** Un Proceso como lo devuelve el portal: sin horas, sin asignados y sin comentarios internos. */
function presentarTareaPortal (proceso) {
  return {
    id: proceso.id,
    patente: proceso.patente,
    name: proceso.name,
    description: proceso.description ?? null,
    status: proceso.status,
    priority: proceso.priority,
    start_date: proceso.start_date ?? null,
    due_date: proceso.due_date ?? null,
    date_finished: proceso.date_finished ?? null,
    milestone: proceso.milestone ?? 0,
    milestone_order: proceso.milestone_order ?? 0,
    task_type: proceso.task_type ?? 0,
    tags: proceso.tags ?? [],
    // Podado como en la API real: sin quien la pidio ni el id del contacto que respondio.
    ...(proceso.aprobacion === undefined ? {} : {
      approval: {
        requerida: proceso.aprobacion.requerida,
        estado: proceso.aprobacion.estado,
        solicitada_en: proceso.aprobacion.solicitada_en ?? null,
        resuelta_en: proceso.aprobacion.resuelta_en ?? null,
        comentario: proceso.aprobacion.comentario ?? null
      }
    })
  }
}


// --- Las pestañas del Proyecto que el mock no servia -------------------------
//
// Resumen, discusiones, actividad, horas y Gantt existen en la API desde siempre, pero el mock no
// los tenia: las cinco pestañas del panel se veian con su bloque de error, y el portal las dibujaba
// con copias propias que no pedian nada. Sin estas rutas la paridad no se puede mirar en pantalla,
// que es la unica forma de verificarla.

/**
 * Discusiones por Proyecto.
 *
 * El 8 se queda **sin ninguna** a proposito: es el caso "proyecto sin discusiones", que sin una fila
 * asi no se distingue de un panel roto.
 */
const DISCUSIONES = ESPACIOS.flatMap((espacio) => (
  espacio.id === 8
    ? []
    : [
        {
          id: espacio.id * 10 + 1,
          project_id: espacio.id,
          subject: `Definiciones de ${espacio.name.toLowerCase()}`,
          description: 'Todo lo que quede acordado acá se pasa al plan.',
          show_to_customer: true,
          date_created: '2026-08-02T11:00:00Z',
          last_activity: '2026-08-21T09:40:00Z',
          staff: presentarStaff(STAFF[0]),
          contact: null
        },
        {
          // Interna: no viaja al portal. Es el otro lado del interruptor.
          id: espacio.id * 10 + 2,
          project_id: espacio.id,
          subject: 'Coordinación del equipo',
          description: null,
          show_to_customer: false,
          date_created: '2026-08-05T15:00:00Z',
          last_activity: '2026-08-05T15:00:00Z',
          staff: presentarStaff(STAFF[1 % STAFF.length]),
          contact: null
        }
      ]
))

/**
 * Comentarios de las discusiones.
 *
 * La primera del proyecto 1 tiene hilo; la del proyecto 2 queda vacia para ejercitar "sin
 * comentarios", que es el estado que el detalle dibuja distinto.
 */
const COMENTARIOS_DE_DISCUSION = [
  {
    id: 1,
    discussion_id: 11,
    content: 'Adjuntamos la paleta revisada. Cualquier cosa nos dicen.',
    created: '2026-08-20T14:05:00Z',
    modified: null,
    parent: null,
    author: { id: STAFF[0].id, full_name: STAFF[0].full_name, profile_image_url: null, es_cliente: false },
    file: null
  },
  {
    id: 2,
    discussion_id: 11,
    content: 'Nos gusta la segunda. ¿La podemos ver aplicada al sitio?',
    created: '2026-08-21T09:40:00Z',
    modified: null,
    parent: null,
    author: { id: 1, full_name: 'Renata Ferreyra', profile_image_url: null, es_cliente: true },
    file: null
  },
  {
    id: 3,
    discussion_id: 12,
    content: 'Recordar que la entrega se corre una semana.',
    created: '2026-08-06T10:00:00Z',
    modified: null,
    parent: null,
    author: { id: STAFF[1 % STAFF.length].id, full_name: STAFF[1 % STAFF.length].full_name, profile_image_url: null, es_cliente: false },
    file: null
  }
]

/** La discusion tal como la ve un contacto: sin `show_to_customer`, que alli seria siempre "Sí". */
function presentarDiscusionPortal (discusion) {
  const { show_to_customer: visible, project_id: proyecto, staff, ...resto } = discusion

  return { ...resto, staff: staff === null ? null : { id: staff.id, full_name: staff.full_name }, contact: discusion.contact }
}

/** Los comentarios de una discusion, con su contador ya resuelto. */
function comentariosDeDiscusion (discusionId) {
  return COMENTARIOS_DE_DISCUSION.filter((c) => c.discussion_id === discusionId)
}

/** Discusiones de un Proyecto, con el contador de comentarios que el listado publica. */
function discusionesDeEspacio (espacioId) {
  return DISCUSIONES
    .filter((d) => d.project_id === espacioId)
    .map((d) => ({ ...d, counts: { comments: comentariosDeDiscusion(d.id).length } }))
}

/** La whitelist de la consulta de discusiones, que el portal y el panel comparten. */
const CONSULTA_DISCUSIONES = {
  filtros: {
    subject: campoFiltrable((d) => d.subject),
    show_to_customer: campoFiltrable((d) => (d.show_to_customer ? 1 : 0), 'numero')
  },
  orden: ['subject', 'last_activity', 'date_created'],
  busqueda: ['subject', 'description']
}

/**
 * Registros de horas de un Proyecto.
 *
 * Se derivan de sus Procesos en vez de escribirse a mano: si alguien agrega Procesos, hay horas
 * sobre ellos y el mock sigue siendo un contrato ejecutable en vez de una postal. El primero de
 * cada Proyecto queda **corriendo**, que es la fila que la tabla cuenta en vivo.
 */
function horasDeEspacio (espacioId) {
  const tareas = PROCESOS.filter((p) => p.rel_type === 'project' && p.rel_id === espacioId)

  return tareas.map((tarea, indice) => {
    const corriendo = indice === 0
    const segundos = corriendo ? 0 : (indice % 5 + 1) * 1800
    const persona = STAFF[indice % STAFF.length]

    return {
      id: espacioId * 1000 + indice,
      staff: {
        id: persona.id,
        full_name: persona.full_name,
        profile_image_url: persona.profile_image_url ?? null,
        sigue_asignado: indice % 4 !== 3
      },
      task: { id: tarea.id, name: tarea.name, status: tarea.status, billable: tarea.billable, billed: tarea.billed },
      tags: tarea.tags,
      start_time: `2026-08-${String(10 + indice % 15).padStart(2, '0')}T13:00:00Z`,
      end_time: corriendo ? null : `2026-08-${String(10 + indice % 15).padStart(2, '0')}T${String(13 + Math.ceil(segundos / 3600)).padStart(2, '0')}:00:00Z`,
      note: indice % 3 === 0 ? null : 'Avance del día.',
      duration_seconds: segundos,
      duration_hm: comoHm(segundos),
      duration_decimal: Math.round(segundos / 36) / 100,
      corriendo,
      puede_editar: true,
      puede_borrar: true,
      puede_detener: corriendo
    }
  })
}

/** El registro tal como lo ve un contacto: sin tarifas, sin facturacion y sin permisos por fila. */
function presentarHoraPortal (registro) {
  return {
    id: registro.id,
    staff: { id: registro.staff.id, full_name: registro.staff.full_name },
    task: { id: registro.task.id, name: registro.task.name },
    start_time: registro.start_time,
    end_time: registro.end_time,
    note: registro.note,
    duration_seconds: registro.duration_seconds,
    duration_hm: registro.duration_hm
  }
}

/** La whitelist de la consulta de horas, que el portal y el panel comparten. */
const CONSULTA_HORAS = {
  filtros: {
    task_id: campoFiltrable((r) => r.task.id, 'numero'),
    note: campoFiltrable((r) => r.note)
  },
  orden: ['start_time', 'end_time', 'duration'],
  derivadas: { duration: (r) => r.duration_seconds },
  busqueda: ['note']
}

/** Segundos como `HH:MM`, sin dias: es la regla del panel viejo (`Format::secondsToTime`). */
function comoHm (segundos) {
  const horas = Math.floor(segundos / 3600)
  const minutos = Math.floor((segundos % 3600) / 60)

  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`
}

/**
 * Grupos del diagrama de Gantt, agrupados por Hito.
 *
 * Los grupos sin tareas no se emiten, igual que la API: un hito vacio abriria meses de linea de
 * tiempo que nadie puede explicar mirando la pantalla.
 *
 * @param {number} espacioId Proyecto
 * @param {number[]} estados ids de `task_statuses`; vacio significa todos
 * @param {number[]} hitosOcultos hitos que no viajan (el portal esconde los `hide_from_customer`)
 */
function ganttDeEspacio (espacioId, estados, hitosOcultos = []) {
  const tareas = PROCESOS
    .filter((p) => p.rel_type === 'project' && p.rel_id === espacioId)
    .filter((p) => estados.length === 0 || estados.includes(p.status))

  const columnas = [
    ...HITOS
      .filter((h) => h.project_id === espacioId && !hitosOcultos.includes(h.id))
      .map((h) => ({ id: `milestone-${h.id}`, nombre: h.name, start: h.start_date, end: h.due_date, hito: h.id })),
    { id: 'milestone-0', nombre: 'Sin hito', start: null, end: null, hito: 0 }
  ]

  return columnas
    .map((columna) => ({
      id: columna.id,
      nombre: columna.nombre,
      grupo: true,
      start: columna.start,
      end: columna.end,
      tareas: tareas
        .filter((p) => (p.milestone?.id ?? 0) === columna.hito)
        .map((p) => ({
          id: p.id,
          name: p.name,
          start: p.start_date,
          end: p.due_date,
          progress: p.status === 5 ? 100 : 40,
          status: p.status,
          color: null,
          dependencies: []
        }))
    }))
    .filter((columna) => columna.tareas.length > 0)
}

/**
 * Comentarios que escribio el propio cliente sobre una Tarea.
 *
 * El fixture de `COMENTARIOS` los tiene todos firmados por staff, y con eso la insignia "Cliente" de
 * la ficha nunca se podia ver: quien firma —`staff` o `contact`— **es** el dato que la produce. Van
 * sobre Tareas del proyecto 1, que es donde se mira la paridad.
 */
const COMENTARIOS_DE_CONTACTO = [
  {
    id: 90001,
    task_id: 509,
    content: '¿Podemos ver esto aplicado al sitio antes del viernes?',
    contact: { id: 1, full_name: 'Renata Ferreyra' },
    date_added: '2026-08-21T09:40:00Z'
  },
  {
    id: 90002,
    task_id: 518,
    content: 'Aprobado de nuestro lado. Gracias.',
    contact: { id: 1, full_name: 'Renata Ferreyra' },
    date_added: '2026-08-22T11:10:00Z'
  }
]

// El contador de la Tarea tiene que incluirlos: la ficha publica `counts.comments`, y un hilo con
// tres comentarios bajo un contador que dice dos es justo el tipo de incoherencia que un fixture no
// puede tener si sirve para verificar.
for (const comentario of COMENTARIOS_DE_CONTACTO) {
  const tarea = PROCESOS.find((p) => p.id === comentario.task_id)
  if (tarea !== undefined) tarea.counts.comments += 1
}

/**
 * Un comentario de una Tarea, en la forma del contrato.
 *
 * `staff` y `contact` en vez de un `author` resuelto: es exactamente uno de los dos, y **cual de los
 * dos es el dato** —sin `staff`, lo escribio el cliente—. La misma forma para el panel y para el
 * portal, que es lo que deja que la ficha sea un solo dibujo.
 *
 * @param {object} comentario fila del fixture
 * @returns {object} el comentario tal como lo emite la API
 */
function presentarComentarioDeTarea (comentario) {
  const staff = comentario.staff ?? null
  const contacto = comentario.contact ?? null

  return {
    id: comentario.id,
    task_id: comentario.task_id,
    parent_id: comentario.parent_id ?? null,
    content: comentario.content,
    date_added: comentario.date_added ?? null,
    staff: staff === null ? null : { id: staff.id, full_name: staff.full_name, profile_image_url: null },
    contact: contacto === null ? null : { id: contacto.id, full_name: contacto.full_name }
  }
}

/** Los comentarios de una Tarea: los del fixture mas los que firmo el cliente. */
function comentariosDeTarea (tareaId) {
  return [...COMENTARIOS, ...COMENTARIOS_DE_CONTACTO]
    .filter((c) => c.task_id === tareaId)
    .map(presentarComentarioDeTarea)
}

/**
 * Los ids de `filter[status]`, que el Gantt manda separados por coma.
 *
 * @param {URLSearchParams} parametros
 * @returns {number[]} los ids validos; vacio significa "todos"
 */
function idsDeEstado (parametros) {
  const crudo = (parametros.get('filter[status]') ?? '').trim()

  if (crudo === '') return []

  return crudo.split(',').map((parte) => Number.parseInt(parte, 10)).filter((id) => Number.isInteger(id))
}

/**
 * Feed de actividad de un Proyecto.
 *
 * `visible_to_customer` es la clave que decide si la entrada viaja al portal **y** si el panel
 * dibuja el interruptor: una entrada sin ella no lleva control, que es lo que pasa del lado del
 * cliente.
 */
function actividadDeEspacio (espacioId) {
  const tareas = PROCESOS.filter((p) => p.rel_type === 'project' && p.rel_id === espacioId)

  return [
    {
      id: espacioId * 100 + 1,
      description: 'creó el proyecto',
      additional_data: null,
      date_added: '2026-08-02T11:00:00Z',
      visible_to_customer: true,
      staff: { id: STAFF[0].id, full_name: STAFF[0].full_name, profile_image_url: null },
      contact: null
    },
    ...tareas.slice(0, 6).map((tarea, indice) => ({
      id: espacioId * 100 + 10 + indice,
      description: 'creó la tarea',
      additional_data: tarea.name,
      date_added: `2026-08-${String(5 + indice).padStart(2, '0')}T16:20:00Z`,
      // Una de cada tres queda interna: sin las dos caras, "visible para el cliente" no se puede ver.
      visible_to_customer: indice % 3 !== 2,
      staff: { id: STAFF[indice % STAFF.length].id, full_name: STAFF[indice % STAFF.length].full_name, profile_image_url: null },
      contact: null
    })),
    {
      id: espacioId * 100 + 90,
      description: 'aprobó una tarea',
      additional_data: 'Con comentario del cliente.',
      date_added: '2026-08-21T09:40:00Z',
      visible_to_customer: true,
      staff: null,
      contact: { id: 1, full_name: 'Renata Ferreyra' }
    }
  ]
}

/** La entrada tal como la ve un contacto: sin la marca de visibilidad, que alli seria siempre "Sí". */
function presentarActividadPortal (entrada) {
  const { visible_to_customer: visible, ...resto } = entrada

  return resto
}

/** La whitelist de la consulta de actividad, que el portal y el panel comparten. */
const CONSULTA_ACTIVIDAD = {
  filtros: { description: campoFiltrable((a) => a.description) },
  orden: ['date_added'],
  busqueda: ['description', 'additional_data']
}

/**
 * Conteos y plazos del Proyecto, la base de los dos `overview`.
 *
 * Los dos contratos salen de acá y no de dos calculos distintos: que el equipo y el cliente lean
 * cifras distintas del mismo proyecto es exactamente lo que esta feature vino a arreglar.
 */
function metricasDeEspacio (espacio) {
  const tareas = PROCESOS.filter((p) => p.rel_type === 'project' && p.rel_id === espacio.id)
  const completas = tareas.filter((p) => p.status === 5).length
  const total = tareas.length
  const hitos = HITOS.filter((h) => h.project_id === espacio.id)
  const hoy = '2026-09-14'
  const segundos = horasDeEspacio(espacio.id).reduce((suma, r) => suma + r.duration_seconds, 0)

  const dias = espacio.deadline === null
    ? null
    : (() => {
        const dia = 86400000
        const inicio = Date.parse(`${espacio.start_date ?? hoy}T00:00:00Z`)
        const fin = Date.parse(`${espacio.deadline}T00:00:00Z`)
        const totalDias = Math.max(1, Math.round((fin - inicio) / dia))
        const restantes = Math.round((fin - Date.parse(`${hoy}T00:00:00Z`)) / dia)

        return {
          total: totalDias,
          left: restantes,
          left_percent: Math.max(0, Math.min(100, Math.round((restantes / totalDias) * 100)))
        }
      })()

  return {
    progress: total === 0 ? 0 : Math.round((completas / total) * 100),
    tasks: {
      total,
      open: total - completas,
      completed: completas,
      completed_percent: total === 0 ? 0 : Math.round((completas / total) * 100)
    },
    hitos,
    dias,
    segundos
  }
}

/** `GET /projects/{id}/overview`: lo que pinta la pestaña Descripcion del equipo. */
function overviewDeEspacio (espacio) {
  const m = metricasDeEspacio(espacio)
  const facturable = Math.round(m.segundos * 0.6)
  const facturado = Math.round(m.segundos * 0.2)

  return {
    progress: m.progress,
    tasks: m.tasks,
    days: m.dias,
    logged_time: {
      total_seconds: m.segundos,
      billable_seconds: facturable,
      billed_seconds: facturado,
      unbilled_seconds: facturable - facturado,
      billable_amount: Math.round(facturable / 36) / 100 * 25,
      billed_amount: Math.round(facturado / 36) / 100 * 25,
      unbilled_amount: Math.round((facturable - facturado) / 36) / 100 * 25,
      muestra_finanzas: espacio.billing_type !== 1
    },
    expenses: { total: 0, billable: 0, billed: 0, unbilled: 0 },
    estimated_hours: espacio.estimated_hours,
    estimated_hours_excedidas: m.segundos / 3600 > (espacio.estimated_hours ?? 0),
    currency: { id: 1, symbol: '$', name: 'CLP' }
  }
}

/**
 * `GET /portal/projects/{id}/overview`: el mismo resumen, podado.
 *
 * `logged_time` solo con `view_task_total_logged_time`, `finance` solo con `view_finance_overview` y
 * `tasks` solo con la pestaña Tareas encendida: **la clave no viaja**, no viaja en cero. Es lo que
 * deja al frontend distinguir "no corresponde" de "no hay".
 */
function overviewParaContacto (espacio, compartido, pestanias) {
  const m = metricasDeEspacio(espacio)

  const resumen = {
    progress: m.progress,
    milestones: {
      total: m.hitos.length,
      overdue: m.hitos.filter((h) => h.due_date !== null && h.due_date < '2026-09-14').length
    },
    days: m.dias
  }

  // Los contadores de Tareas solo con la pestaña encendida, como `RecursoResumen::paraContacto()`:
  // sin ella el cliente no puede abrir ninguna de esas filas.
  if (pestanias.includes('tasks')) {
    resumen.tasks = {
      ...m.tasks,
      by_status: ESTADOS_PROCESO.map((estado) => ({
        status: estado.id,
        name: estado.name,
        color: estado.color,
        order: estado.order,
        total: PROCESOS.filter((p) => p.rel_type === 'project' && p.rel_id === espacio.id && p.status === estado.id).length
      }))
    }
  }

  if (compartido.tiempo) {
    resumen.logged_time = {
      total_seconds: m.segundos,
      duration_hm: comoHm(m.segundos),
      estimated_hours_excedidas: m.segundos / 3600 > (espacio.estimated_hours ?? 0)
    }
  }

  if (compartido.finanzas) {
    resumen.finance = {
      project_cost: espacio.project_cost,
      estimated_hours: espacio.estimated_hours,
      currency: { id: 1, symbol: '$', name: 'CLP' }
    }
  }

  return resumen
}

/** `GET /projects/{id}/overview/chart`: horas por dia, apiladas por persona. */
function graficoDeEspacio (espacioId, periodo) {
  const etiquetas = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
  const horas = horasDeEspacio(espacioId)

  return {
    periodo,
    etiquetas,
    series: STAFF.slice(0, 2).map((persona, indice) => ({
      clave: `staff-${persona.id}`,
      nombre: persona.full_name,
      valores: etiquetas.map((_, dia) => Math.round(
        horas
          .filter((r) => r.staff.id === persona.id && (dia + indice) % 3 !== 2)
          .reduce((suma, r) => suma + r.duration_seconds, 0) / 3600 / etiquetas.length * 100
      ) / 100)
    }))
  }
}

/**
 * Hitos que el equipo escondio al cliente (`hide_from_customer` de `tblmilestones`).
 *
 * Los dos del proyecto 8, para tener el caso "proyecto sin hitos" del lado del cliente sin sacarle
 * los hitos al panel: es la misma fila vista desde los dos lados, que es justo lo que hay que poder
 * mirar.
 */
const HITOS_OCULTOS_AL_CLIENTE = [15, 16]

/**
 * Que comparte cada Proyecto con su cliente.
 *
 * En la API real esto son dos cosas distintas de `tblproject_settings`: las claves de
 * `available_features`, que deciden que pestaña existe, y los `view_*`, que deciden que bloques del
 * detalle de una Tarea viajan. Aca se declaran juntas y **por proyecto**, porque lo que hace falta
 * para verificar es tener los dos lados de cada interruptor a mano:
 *
 *  - el **1** comparte todo lo que el portal sabe dibujar: es donde se mira la paridad completa con
 *    las pestañas del colaborador —tabla, tablero, calendario, ficha de una Tarea, resumen, hitos,
 *    horas, discusiones, Gantt y actividad—;
 *  - el **8** tiene Tareas, Calendario, Horas y Gantt **apagados** y todos los flags en 0: es el
 *    caso de "pestaña sin habilitar", que sin una fila asi nunca se distingue de un panel roto. Sus
 *    dos hitos estan ocultos al cliente y no tiene ninguna discusion, asi que es tambien el caso de
 *    "pestaña encendida y vacia", que se lee distinto y hay que poder ver.
 *
 * `actas` no esta en ninguna de las dos listas y no es un olvido: no vive en `available_features`
 * sino en su propio interruptor por proyecto (`AJUSTES_DEL_PORTAL`), que se enciende y se apaga
 * desde el panel. `tickets` tampoco esta: es del modulo de soporte y no del Proyecto.
 */
const COMPARTIDO_CON_EL_CLIENTE = {
  1: {
    tabs: [
      'overview', 'tasks', 'timesheets', 'milestones', 'files', 'discussions', 'gantt', 'calendar',
      'activity'
    ],
    comentarios: true,
    checklist: true,
    adjuntos: true,
    tiempo: true,
    finanzas: true
  },
  8: {
    tabs: ['overview', 'milestones', 'files', 'discussions', 'activity'],
    comentarios: false,
    checklist: false,
    adjuntos: false,
    tiempo: false,
    finanzas: false
  },
  defecto: {
    tabs: ['overview', 'tasks', 'milestones', 'files', 'calendar', 'activity'],
    comentarios: true,
    checklist: false,
    adjuntos: true,
    tiempo: false,
    finanzas: false
  }
}

/**
 * Los interruptores del portal por Espacio, **mutables**: es lo que escribe
 * `PUT /projects/{id}/portal-settings`.
 *
 * En la API real son filas de `tblproject_settings` y la migracion `0570` los dejo en '0' para los
 * 279 proyectos. Aca el 1 arranca encendido para poder mirar el Meeting Paper del cliente sin tener
 * que prenderlo primero, y el 8 apagado, que es el caso "la pestaña no aparece". Los dos lados del
 * interruptor a mano, igual que el resto del fixture del portal.
 */
const AJUSTES_DEL_PORTAL = new Map([[1, true]])

/**
 * El bloque de interruptores de un Espacio.
 *
 * La fila ausente vale `false`, igual que la lee `VisibilidadContacto::ajustes()`: asi un Espacio que
 * nunca paso por la migracion se comporta como uno apagado y no como uno roto.
 */
function ajustesDelPortal (espacioId) {
  return { wiwo_portal_actas: AJUSTES_DEL_PORTAL.get(espacioId) === true }
}

/**
 * Las pestañas que un Espacio comparte hoy con su cliente.
 *
 * `actas` no sale de la lista fija: cuelga del interruptor, asi que aparece y desaparece de verdad
 * cuando el panel lo toca. Es la misma regla de `VisibilidadContacto::PESTANIAS`, donde la pestaña
 * exige la feature `project_notes` **y** el flag propio `wiwo_portal_actas`.
 */
function pestaniasDelContacto (espacioId, compartido) {
  return ajustesDelPortal(espacioId).wiwo_portal_actas ? [...compartido.tabs, 'actas'] : compartido.tabs
}

/**
 * Lee un booleano tolerando lo que manda un formulario, igual que `AjustesDelPortal::comoBooleano()`.
 *
 * `null` es "esto no es un booleano" y el llamador responde 422: `(Boolean) "no"` seria `true`, y una
 * casilla que se enciende cuando le mandan "no" es peor que un error.
 */
function booleanoDelPortal (valor) {
  if (typeof valor === 'boolean') return valor
  if (valor === 0 || valor === 1) return valor === 1
  if (['0', '1', 'true', 'false'].includes(valor)) return valor === '1' || valor === 'true'

  return null
}

/**
 * La whitelist de los Hitos del portal: `RecursoHitos::consultaDeContacto()`.
 *
 * Se aplica sobre la fila **ya presentada**, que es la que el contacto recibe: el contrato del hito
 * no esconde ninguna columna ordenable detras de otro nombre.
 *
 * Sin `description` ni `hide_from_customer`, como la whitelist de la API: el primero cae sobre la
 * columna cruda y serviria para reconstruir por respuestas las descripciones que el equipo decidio
 * no compartir; el segundo vale siempre 0 para el contacto.
 */
const CONSULTA_HITOS_PORTAL = {
  filtros: {
    id: campoFiltrable((h) => h.id, 'numero'),
    name: campoFiltrable((h) => h.name),
    start_date: campoFiltrable((h) => h.start_date, 'fecha'),
    due_date: campoFiltrable((h) => h.due_date, 'fecha'),
    date_created: campoFiltrable((h) => h.date_created, 'fecha'),
    order: campoFiltrable((h) => h.order, 'numero'),
    color: campoFiltrable((h) => h.color),
    avance: campoFiltrable(
      (h) => (h.counts.tasks === 0 ? 0 : Math.round((100 * h.counts.tasks_done) / h.counts.tasks)),
      'numero'
    ),
    date_from: (h, v) => h.due_date >= v,
    date_to: (h, v) => h.due_date <= v
  },
  orden: ['name', 'start_date', 'due_date', 'order'],
  busqueda: ['name']
}

/**
 * La whitelist del listado de Procesos del portal.
 *
 * Se aplica sobre las filas **en crudo** y no sobre las ya presentadas: el orden por defecto de la
 * tabla es `completed,-date_added`, y `date_added` no viaja al cliente. Ordenar por una columna que
 * no se publica es justamente lo que hace la API, y filtrar primero es la unica forma de
 * reproducirlo.
 */
const CONSULTA_TAREAS_PORTAL = {
  filtros: {
    status: coincideEnLista((p) => p.status),
    // `aprobacion` lo pide la pagina del proyecto para el bloque de visto bueno. Sin el, el mock
    // respondia 422 y el bloque no se dibujaba nunca: quedaba sin ejercitar.
    aprobacion: (p, v) => (p.aprobacion?.estado ?? null) === v
  },
  orden: ['name', 'due_date', 'status', 'completed', 'date_added'],
  // `completed` no es una columna de `tbltasks`: en la API es un CASE sobre `status`.
  derivadas: { completed: (p) => (p.status === 5 ? 1 : 0) },
  busqueda: ['name']
}

/**
 * El tablero de Procesos de un Proyecto: una columna por estado, con sus tarjetas.
 *
 * **Uno solo para los dos sujetos**, que es lo que permite que el cliente abra el mismo tablero que
 * el equipo: lo que cambia es la whitelist de la consulta y como se presenta cada tarjeta. La columna
 * "Completo" solo aparece cuando se filtro por estado, en los dos: un tablero que arranca mostrando
 * lo terminado empuja lo pendiente fuera de la pantalla.
 *
 * @param {object[]} tareas Los Procesos del Proyecto, en crudo.
 * @param {URLSearchParams} parametros Query de la peticion.
 * @param {(proceso: object) => object} presentar Como sale cada tarjeta para ese sujeto.
 * @param {object} consulta Whitelist de filtros, orden y busqueda de ese sujeto.
 * @returns {object[]} Un grupo por estado.
 */
function tableroDeProcesos (tareas, parametros, presentar, consulta = CONSULTA_PROCESOS) {
  const filtradoPorEstado = parametros.get('filter[status]')?.trim()
  const columnas = ESTADOS_PROCESO
    .filter((estado) => filtradoPorEstado || estado.id !== 5)
    .sort((a, b) => a.order - b.order)

  return columnas.map((columna) => {
    const parametrosColumna = new URLSearchParams(parametros)
    parametrosColumna.set('filter[status]', String(columna.id))

    const { filas, paginacion } = aplicarConsulta(tareas, parametrosColumna, consulta)

    return {
      columna: { id: columna.id, name: columna.name, color: columna.color, order: columna.order },
      tarjetas: filas.map(presentar),
      pagination: paginacion
    }
  })
}

/**
 * La ficha de un Proceso tal como la ve un contacto.
 *
 * Cada bloque viaja **solo si el Proyecto lo comparte**, y cuando no, la clave **no existe**: el
 * frontend distingue por `undefined`, que significa "no corresponde" y no "esta vacio". Mandarlos en
 * `null` o en `[]` haria que la ficha dibujara una seccion vacia por cada cosa que el equipo
 * decidio no compartir.
 *
 * Nunca viajan: asignados, seguidores, tarifa, horas estimadas, etiquetas, campos personalizados ni
 * el ETA y la desviacion, que miden al equipo contra su propio compromiso interno.
 *
 * @param {object} proceso El Proceso en crudo.
 * @param {{comentarios: boolean, checklist: boolean, adjuntos: boolean, tiempo: boolean}} compartido
 *        Los flags del Proyecto.
 * @returns {object} La ficha, en la forma del contrato.
 */
function presentarFichaPortal (proceso, compartido) {
  const segundos = CRONOMETROS
    .filter((t) => t.task_id === proceso.id)
    .reduce((total, t) => total + Math.max(0, (Date.parse(t.end_time ?? new Date().toISOString()) - Date.parse(t.start_time)) / 1000), 0)

  return {
    id: proceso.id,
    patente: proceso.patente,
    name: proceso.name,
    description: proceso.description ?? null,
    status: proceso.status,
    priority: proceso.priority,
    start_date: proceso.start_date ?? null,
    due_date: proceso.due_date ?? null,
    date_finished: proceso.date_finished ?? null,
    date_added: proceso.date_added ?? null,
    // Como objeto y no como el id que manda el listado: la ficha muestra el nombre del Hito, y un
    // numero suelto no se puede resolver del lado del cliente.
    milestone: proceso.milestone ?? null,
    project: proceso.project ?? null,
    task_type: proceso.task_type ?? null,
    // Los contadores viajan SIEMPRE, aunque el bloque que cuentan no: el contrato los declara asi, y
    // es lo que deja al cliente saber que hay tres adjuntos aunque este proyecto no se los comparta.
    counts: {
      comments: comentariosDeTarea(proceso.id).length,
      attachments: ARCHIVOS.filter((a) => a.rel_type === 'task' && a.rel_id === proceso.id).length,
      checklist: CHECKLIST.filter((i) => i.task_id === proceso.id).length,
      checklist_done: CHECKLIST.filter((i) => i.task_id === proceso.id && i.finished).length
    },
    ...(proceso.aprobacion === undefined ? {} : {
      approval: {
        requerida: proceso.aprobacion.requerida,
        estado: proceso.aprobacion.estado,
        solicitada_en: proceso.aprobacion.solicitada_en ?? null,
        resuelta_en: proceso.aprobacion.resuelta_en ?? null,
        comentario: proceso.aprobacion.comentario ?? null
      }
    }),
    // La MISMA forma que emite `GET /tasks/{id}/comments` al panel: `staff` o `contact`, nunca un
    // `author` ya resuelto. Una segunda forma solo para el portal seria el `if (esPortal)` que la
    // ficha compartida evita, y es lo que hacia que el cliente leyera "Sin autor" y sin fecha.
    ...(compartido.comentarios ? { comments: comentariosDeTarea(proceso.id) } : {}),
    ...(compartido.checklist
      ? {
          checklist: CHECKLIST
            .filter((item) => item.task_id === proceso.id)
            .map((item) => ({ id: item.id, description: item.description, finished: item.finished }))
        }
      : {}),
    ...(compartido.adjuntos
      ? {
          attachments: ARCHIVOS
            .filter((a) => a.rel_type === 'task' && a.rel_id === proceso.id)
            .map((a) => ({ id: a.id, file_name: a.file_name, subject: a.subject ?? null, url: a.url }))
        }
      : {}),
    ...(compartido.tiempo
      ? { total_logged_seconds: Math.round(segundos), duration_hm: formatearHm(segundos) }
      : {})
  }
}

/**
 * Segundos como `h:mm`, que es lo que el backend ya manda formateado.
 *
 * @param {number} segundos
 * @returns {string}
 */
function formatearHm (segundos) {
  const horas = Math.floor(segundos / 3600)
  const minutos = Math.round((segundos % 3600) / 60)

  return `${horas}:${String(minutos).padStart(2, '0')}`
}

function seccionesDelPortal (contacto) {
  const conPermiso = ['projects', 'invoices', 'estimates', 'proposals', 'contracts', 'support']
    .filter((f) => contacto.permissions.includes(f))

  return [...conPermiso, 'files', 'announcements', 'kb', 'profile']
}
