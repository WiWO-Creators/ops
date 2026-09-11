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
  ADMINS_DE_CLIENTE, ARCHIVOS, CAMPOS_PERSONALIZADOS, CHECKLIST, CLIENTES, COMENTARIOS, CRONOMETROS,
  DEPARTAMENTOS, EMPRESAS_DEL_GRUPO, ESPACIOS, ESTADOS_ESPACIO, ESTADOS_PROCESO, ETIQUETAS, HITOS,
  AVISOS_CONTACTO, CONTACTOS, PRIORIDADES, PROCESOS, RESERVAS, ROLES, SALAS, STAFF, VALORES_CAMPOS
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
const RECURSOS_CON_PERMISO = ['tasks', 'projects', 'customers', 'staff', 'invoices']

/**
 * Las cuatro del catalogo consolidado (`Acceso\Permisos::FEATURES_NUEVO` del backend).
 *
 * `invoices` queda afuera: es la que hace visible la diferencia entre los dos modelos sin inventar
 * un fixture nuevo.
 */
const RECURSOS_CONSOLIDADOS = ['tasks', 'projects', 'customers', 'staff']

/** El catalogo que le toca a una persona segun su modelo. */
function recursosDe (staff) {
  return staff.modelo_permisos === 'nuevo' ? RECURSOS_CONSOLIDADOS : RECURSOS_CON_PERMISO
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
function catalogoDePermisos (staff) {
  return recursosDe(staff).map((recurso) => ({
    feature: recurso,
    name: recurso.charAt(0).toUpperCase() + recurso.slice(1),
    capabilities: (recurso === 'projects' ? [...ACCIONES, 'edit_milestones'] : ACCIONES).map((accion) => ({ key: accion, name: accion.charAt(0).toUpperCase() + accion.slice(1) }))
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
    return Object.fromEntries(recursosDe(staff).map((r) => [r, r === 'projects' ? [...ACCIONES, 'edit_milestones'] : [...ACCIONES]]))
  }
  return {
    tasks: ['view', 'create', 'edit'],
    projects: ['view'],
    customers: [],
    staff: ['view'],
    // Con una capacidad y no vacia: es lo que hace que `invoices` sea un permiso HEREDADO de verdad
    // cuando el actor pasa al catalogo consolidado, y que la ficha ejercite el bloque "ademas tiene
    // esto". Vacia no aparece en ninguna parte y esa rama no se probaba nunca.
    invoices: ['view']
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

/** Exige superadministrador, o lanza 403. Mismo texto que `Acceso\\Permisos::exigirSuperadmin()`. */
function exigirSuperadmin (staff, queProtege) {
  if (staff.is_superadmin !== true) {
    throw new ErrorApi(403, 'forbidden', `Solo un superadministrador ${queProtege}.`)
  }
}

/**
 * La escalera de permisos del mock (`modules/api/Acceso/Reglas.php`).
 *
 * Solo los cinco escalones de abajo se pueden escribir: `admin` y `superadmin` salen de las banderas
 * de Perfex, y la API los rechaza con 422 por esta puerta. Los ids del mapa son los de `ROLES` del
 * mock, no los de la base real.
 */
const NIVELES_ASIGNABLES = ['usuario', 'focal', 'lider', 'head', 'gerente']
const NIVELES_POR_ROL = { 1: 'gerente', 2: 'lider', 3: 'usuario' }

/** Override por persona, en memoria. Ausencia de entrada = "el que diga su rol". */
const NIVELES_ASIGNADOS = new Map()

/**
 * El escalon de una persona, resuelto con el mismo orden que `Acceso\\Permisos::nivel()`: las
 * banderas de Perfex mandan sobre todo, despues el override, y al final el rol.
 */
function nivelDe (staff) {
  const asignado = NIVELES_ASIGNADOS.get(staff.id) ?? null

  if (staff.is_superadmin === true) return { nivel: 'superadmin', nivel_asignado: asignado }
  if (staff.is_admin === true) return { nivel: 'admin', nivel_asignado: asignado }

  return {
    nivel: asignado ?? NIVELES_POR_ROL[staff.role_id] ?? 'usuario',
    nivel_asignado: asignado
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
 * Meeting Papers, por Espacio.
 *
 * Vive en memoria y no en `datos.js` porque el caso que interesa probar es el ciclo completo
 * —generar, guardar, corregir, borrar— y para eso las actas tienen que nacer durante la sesion.
 */
const ACTAS = []

/** Autoincremental de actas. Arranca alto para que un id de acta no se confunda con uno de tarea. */
let PROXIMA_ACTA = 900

/** Firma de correo por marca, igual que la constante del backend. */
const FIRMAS_MARCA = {
  mgc: 'https://www.meetwiwo.com/assets/logos/Materiales/firmamgc.jpg',
  wiwo: 'https://www.meetwiwo.com/assets/logos/Materiales/firmawiwo.jpg',
  palta: 'https://www.meetwiwo.com/assets/logos/Materiales/firmapalta.jpg'
}

/** Un acta como la devuelve la API. El listado omite `content`, igual que el backend. */
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

  return conContenido ? { ...publica, content: acta.content } : publica
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

/** Crea el acta y la deja al frente de la lista. */
function guardarActa (espacio, actual, campos, html, origen) {
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
    updated_by: null
  }
  ACTAS.unshift(acta)

  return acta
}

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
  // ve la conexion cortada en vez de la respuesta.
  for await (const _trozo of peticion) { /* se descarta */ }

  const falla = parametros.get('falla') === '1'
  const html = actaGenerada(espacio)

  if (!aceptaStream(peticion)) {
    if (falla) throw new ErrorApi(502, 'provider_error', 'El proveedor cortó la respuesta.')
    const acta = guardarActa(espacio, actual, { client: 'Acme SpA', brand: 'wiwo' }, html, 'ia')

    return { estado: 201, cuerpo: conDatos(presentarActa(acta, { conContenido: true })) }
  }

  const fin = falla
    ? null
    : { acta: presentarActa(guardarActa(espacio, actual, { client: 'Acme SpA', brand: 'wiwo' }, html, 'ia'), { conContenido: true }) }

  return { transmitir: (respuesta) => transmitirSSE(respuesta, html, { fin, falla }) }
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
        return {
          estado: 200,
          cuerpo: conDatos({
            ...presentarEspacioPortal(espacio),
            tabs: ['overview', 'tasks', 'milestones', 'files', 'activity'],
            members: STAFF.filter((persona) => espacio.miembros.includes(persona.id))
              .map(({ id, full_name, profile_image_url }) => ({ id, full_name, profile_image_url }))
          })
        }
      }

      const tareasDelEspacio = PROCESOS.filter((p) => p.rel_type === 'project' && p.rel_id === espacio.id)

      if (resto[2] === 'tasks' && resto.length === 3) {
        const { filas, paginacion } = aplicarConsulta(
          tareasDelEspacio.map(presentarTareaPortal), parametros,
          { filtros: { status: 'status' }, orden: ['due_date', 'name'], busqueda: ['name'] }
        )
        return { estado: 200, cuerpo: conDatos(filas, { pagination: paginacion }) }
      }

      if (resto[2] === 'milestones' && resto.length === 3) {
        const hitos = HITOS.filter((h) => h.project_id === espacio.id).map((hito) => {
          const suyas = tareasDelEspacio.filter((t) => t.milestone === hito.id)

          return {
            id: hito.id,
            name: hito.name,
            description: hito.description,
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
        return { estado: 200, cuerpo: conDatos(hitos) }
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

      if (resto[2] === 'activity' && resto.length === 3) {
        return {
          estado: 200,
          cuerpo: conDatos([
            {
              id: 1,
              description: 'creó el proyecto',
              additional_data: null,
              date_added: '2026-08-02T11:00:00Z',
              staff: { id: 1, full_name: STAFF[0].full_name },
              contact: null
            },
            {
              id: 2,
              description: 'aprobó una tarea',
              additional_data: 'Con comentario del cliente.',
              date_added: '2026-08-05T16:20:00Z',
              staff: null,
              contact: { id: 1, full_name: 'Renata Ferreyra' }
            }
          ])
        }
      }

      throw new ErrorApi(404, 'not_found', `Recurso desconocido: "${resto[2] ?? ''}".`)
    }

    throw new ErrorApi(404, 'not_found', `Recurso desconocido: "${seccion ?? ''}".`)
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

  if (recurso === 'me' && metodo === 'GET') {
    return {
      estado: 200,
      cuerpo: conDatos({
        ...presentarStaff(actual),
        permissions: permisosDe(actual),
        // El escalon de la escalera, por el mismo resolutor que `GET /staff/{id}/nivel`: dos
        // verdades sobre el mismo dato es como el mock deja de ser un contrato ejecutable.
        nivel: nivelDe(actual).nivel,
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
        departments: DEPARTAMENTOS,
        empresas: EMPRESAS_DEL_GRUPO
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
    // `staff.edit` y no `staff.view`: el catalogo sirve para editar los permisos de alguien, no para
    // mirar la ficha. Es el gate que la API estrenó al borrar el CRUD de roles.
    exigirPermiso(actual, 'staff', 'edit')

    // El catalogo es el del ACTOR, no el de la persona editada: el endpoint no recibe id. Es seguro
    // en las dos direcciones porque el PATCH toca solo las features que el cuerpo nombra.
    return { estado: 200, cuerpo: conDatos(catalogoDePermisos(actual)) }
  }

  // Edicion de los permisos individuales de una persona. Solo `permissions`: el resto de la ficha se
  // edita con el formulario de Equipo, que el mock no necesita para probar esta pantalla.
  // --- El escalon de la escalera de permisos --------------------------------
  //
  // Antes de los bloques de `staff`, que son PATCH y GET: un PUT caeria al 404 final.
  //
  // El mock guarda el override en memoria y resuelve igual que `Acceso\\Permisos::nivel()`: las
  // banderas de Perfex mandan sobre todo, despues el override, y al final el rol. Si el orden fuera
  // otro, el dialogo se veria bien contra el mock y mentiria contra la API.
  if (recurso === 'staff' && resto[1] === 'nivel') {
    // `staff.view` primero y para los dos metodos, igual que la API real: la compuerta del recurso
    // `/staff` entero corre antes de mirar el subrecurso.
    exigirPermiso(actual, 'staff', 'view')

    const persona = buscarO404(STAFF, Number(resto[0]), 'staff')

    if (metodo === 'PUT') {
      exigirSuperadmin(actual, 'reparte los niveles de permiso')

      if (persona.id === actual.id) {
        throw new ErrorApi(409, 'conflict', 'No podés cambiarte el nivel a vos mismo. Pedíselo a otro superadministrador.')
      }

      const datos = await cuerpo()
      const nivel = datos.nivel ?? null

      // Los dos escalones de arriba salen de las banderas de Perfex y esta puerta no los escribe.
      if (nivel !== null && !NIVELES_ASIGNABLES.includes(nivel)) {
        throw new ErrorApi(422, 'validation_failed',
          `El nivel tiene que ser uno de: ${NIVELES_ASIGNABLES.join(', ')}.`, { nivel: [`unknown:${nivel}`] })
      }

      if (nivel === null) NIVELES_ASIGNADOS.delete(persona.id)
      else NIVELES_ASIGNADOS.set(persona.id, nivel)
    } else if (metodo !== 'GET') {
      throw new ErrorApi(404, 'not_found', 'Subrecurso desconocido.')
    }

    return { estado: 200, cuerpo: conDatos(nivelDe(persona)) }
  }

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

    // El interruptor del catalogo consolidado. Solo un superadministrador, igual que la API real, y
    // con el mismo enum de lectura para que no haya dos nombres para una sola cosa.
    if (datos.modelo_permisos !== undefined) {
      if (!actual.is_superadmin) {
        throw new ErrorApi(422, 'validation_failed', 'Revisá los campos de la persona.', {
          modelo_permisos: ['solo_superadmin']
        })
      }
      if (datos.modelo_permisos !== 'nuevo' && datos.modelo_permisos !== 'viejo') {
        throw new ErrorApi(422, 'validation_failed', 'Revisá los campos de la persona.', {
          modelo_permisos: ['invalid']
        })
      }
      persona.modelo_permisos = datos.modelo_permisos
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
        .map(({ id, full_name, profile_image_url, area_id, cargo_id }) => ({
          id, full_name, profile_image_url, area_id: area_id ?? null, cargo_id: cargo_id ?? null
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
      return { estado: 200, cuerpo: conDatos(COMENTARIOS.filter((c) => c.task_id === proceso.id)) }
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
    tags: proceso.tags ?? []
  }
}

function seccionesDelPortal (contacto) {
  const conPermiso = ['projects', 'invoices', 'estimates', 'proposals', 'contracts', 'support']
    .filter((f) => contacto.permissions.includes(f))

  return [...conPermiso, 'files', 'announcements', 'kb', 'profile']
}
