/**
 * Alta de Tareas por los contactos del cliente en el mock: `POST /portal/projects/{id}/tasks` y la
 * capacidad `alta_de_tareas` de `GET /portal/projects/{id}`.
 *
 * Vive aparte de `servidor.js` por el mismo motivo que `orbe-portal.js`: es un bloque con estado y
 * reglas propias, y `servidor.js` solo lo cablea. Lo que necesita de alla —el alta de un Proceso y el
 * presentador del portal— le llega por parametro, porque `servidor.js` es el que arranca el mock.
 *
 * Lo que se replica de la API real, y por que:
 *   - **El interruptor es por cliente y nace apagado** (`CLIENTES_CREAN_TAREAS`). Apagado, la funcion
 *     no existe para el contacto: 404, igual que un Proyecto ajeno, para no confirmar nada.
 *   - **Sin la pestaña de Tareas, 403**, como `exigirPestania`. Va DESPUES del 404 del interruptor.
 *   - **Lista blanca de campos**: lo que no es `name`, `description`, `due_date`, `priority` o
 *     `assignees` es 422 `no_editable`. Un mock que aceptara `status` o `visible_to_client` ocultaria
 *     justo el hueco que la API cierra.
 *   - **El vencimiento lo exige el cliente** salvo que tenga `tareas-sin-vencimiento`.
 *   - **Los asignados son del equipo del Proyecto**, y si el Proyecto oculta su equipo no hay
 *     asignables y cualquier `assignees` no vacio es 422.
 *   - **La Tarea nace de un contacto**: `added_from` es el id del contacto, no hay `created_by` de
 *     staff y la ficha del equipo recibe `created_by_contact`.
 *   - **Tope por contacto y por hora** (`PORTAL_TAREAS_ALTAS_POR_HORA`, 10 por defecto), contado sobre las
 *     Tareas que el propio contacto creo. Pasado, 429 con `reintentar_en_segundos`.
 *   - **Idempotencia de un minuto** por (contacto, Proyecto, nombre): repetir devuelve 200 con la que
 *     ya existe, sin crear otra.
 */

import { CLIENTES_CREAN_TAREAS, CLIENTES_SIN_VENCIMIENTO, PRIORIDADES, PROYECTOS_SIN_EQUIPO_VISIBLE, STAFF } from './datos.js'
import { ErrorApi } from './consulta.js'

/** Tareas por contacto y por hora antes del 429, de la misma variable de entorno que la API. */
export function topePorHora () {
  const crudo = Number(process.env.PORTAL_TAREAS_ALTAS_POR_HORA ?? 10)

  return Number.isInteger(crudo) && crudo > 0 ? crudo : 10
}

/** Una hora y un minuto, en milisegundos. */
const HORA_MS = 60 * 60 * 1000
const MINUTO_MS = 60 * 1000

/** Largo maximo de `name`. */
const LARGO_NOMBRE = 191

/** Campos que el contacto puede mandar. Todo lo demas es 422. */
const CAMPOS_ACEPTADOS = new Set(['name', 'description', 'due_date', 'priority', 'assignees'])

/** Marcas de las Tareas que cada contacto creo, para el tope por hora. */
const ALTAS = new Map()

/** Altas recientes por `contacto:proyecto:nombre`, para la idempotencia de un minuto. */
const RECIENTES = new Map()

/**
 * Vuelve el estado del bloque al de fabrica. Solo para las pruebas.
 */
export function reiniciarTareasDelPortal () {
  ALTAS.clear()
  RECIENTES.clear()
}

/**
 * Si el cliente del contacto tiene encendida la creacion de Tareas.
 *
 * @param {{ client_id: number }} contacto
 * @returns {boolean}
 */
export function clienteCreaTareas (contacto) {
  return CLIENTES_CREAN_TAREAS.has(contacto.client_id)
}

/**
 * Los miembros activos del Proyecto que el cliente puede ver y a quienes puede asignar.
 *
 * Vacio si el Proyecto oculta su equipo (`view_team_members = 0`): el contacto no puede conocerlos.
 *
 * @param {{ id: number, miembros: number[] }} espacio
 * @returns {{ id: number, nombre: string, avatar: string | null }[]}
 */
export function asignablesDelEspacio (espacio) {
  if (PROYECTOS_SIN_EQUIPO_VISIBLE.has(espacio.id)) return []

  return STAFF
    .filter((persona) => persona.active !== false && espacio.miembros.includes(persona.id))
    .map((persona) => ({ id: persona.id, nombre: persona.full_name, avatar: persona.profile_image_url ?? null }))
}

/**
 * El bloque `alta_de_tareas` de `GET /portal/projects/{id}`.
 *
 * @param {{ client_id: number, permissions: string[] }} contacto
 * @param {{ id: number, miembros: number[] }} espacio
 * @param {string[]} pestanias las pestañas que el Proyecto comparte con el cliente
 * @returns {{ vencimiento_requerido: boolean, asignables: object[] } | null} `null` si no puede crear
 */
export function altaDeTareasDelEspacio (contacto, espacio, pestanias) {
  if (!clienteCreaTareas(contacto) || !contacto.permissions.includes('projects')) return null
  if (!pestanias.includes('tasks')) return null

  return {
    vencimiento_requerido: !CLIENTES_SIN_VENCIMIENTO.has(contacto.client_id),
    asignables: asignablesDelEspacio(espacio)
  }
}

/**
 * Si el contacto puede crear Tareas en al menos un Proyecto suyo: lo que dice `puede_proponer_tareas`.
 *
 * @param {{ client_id: number, permissions: string[] }} contacto
 * @param {(contacto: object) => { espacio: object, pestanias: string[] }[]} proyectos sus Proyectos con
 *        las pestañas que cada uno comparte
 * @returns {boolean}
 */
export function puedeCrearEnAlgunProyecto (contacto, proyectos) {
  return proyectos(contacto).some(({ espacio, pestanias }) => altaDeTareasDelEspacio(contacto, espacio, pestanias) !== null)
}

/**
 * Valida el cuerpo de un alta contra el contrato, sin escribir nada.
 *
 * @param {unknown} datos el cuerpo tal como llego
 * @param {{ vencimiento_requerido: boolean, asignables: { id: number }[] }} alta la capacidad del Proyecto
 * @returns {{ name: string, description: string | null, due_date: string | null, priority: number, assignees: number[] }}
 *          el alta normalizada
 * @throws {ErrorApi} 422 con `details` por campo
 */
export function validarAlta (datos, alta) {
  const entrada = datos !== null && typeof datos === 'object' && !Array.isArray(datos) ? datos : {}
  const detalles = {}

  for (const clave of Object.keys(entrada)) {
    if (!CAMPOS_ACEPTADOS.has(clave)) detalles[clave] = ['no_editable']
  }

  const nombre = typeof entrada.name === 'string' ? entrada.name.trim() : ''

  if (nombre === '') detalles.name = ['requerido']
  else if ([...nombre].length > LARGO_NOMBRE) detalles.name = ['demasiado_largo']

  if (entrada.description != null && typeof entrada.description !== 'string') detalles.description = ['no_valido']

  const vence = entrada.due_date
  const hayFecha = vence !== undefined && vence !== null && vence !== ''

  if (!hayFecha) {
    if (alta.vencimiento_requerido) detalles.due_date = ['requerido_por_cliente']
  } else if (typeof vence !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(vence) || Number.isNaN(Date.parse(vence))) {
    detalles.due_date = ['formato_invalido']
  }

  const prioridad = entrada.priority == null ? 2 : Number(entrada.priority)

  if (!PRIORIDADES.some((p) => p.id === prioridad)) detalles.priority = ['no_valido']

  let asignados = []

  if (entrada.assignees != null) {
    if (!Array.isArray(entrada.assignees)) {
      detalles.assignees = ['debe_ser_lista']
    } else {
      asignados = [...new Set(entrada.assignees.map(Number))]

      const permitidos = new Set(alta.asignables.map((persona) => persona.id))

      if (asignados.some((id) => !Number.isInteger(id) || !permitidos.has(id))) detalles.assignees = ['no_es_del_equipo']
    }
  }

  if (Object.keys(detalles).length > 0) {
    throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden guardar.', detalles)
  }

  return {
    name: nombre,
    description: typeof entrada.description === 'string' && entrada.description.trim() !== '' ? entrada.description.trim() : null,
    due_date: hayFecha ? vence : null,
    priority: prioridad,
    assignees: asignados
  }
}

/**
 * Cuenta el alta contra el tope por hora del contacto, o lanza 429.
 *
 * @param {number} contactoId
 * @param {number} ahora milisegundos
 * @throws {ErrorApi} 429 con `reintentar_en_segundos` si ya paso el tope
 */
function contarAlta (contactoId, ahora) {
  const recientes = (ALTAS.get(contactoId) ?? []).filter((marca) => ahora - marca < HORA_MS)
  const tope = topePorHora()

  if (recientes.length >= tope) {
    ALTAS.set(contactoId, recientes)

    throw new ErrorApi(429, 'rate_limited', 'Creaste muchas tareas seguidas. Prueba de nuevo en un rato.', {
      tope_por_hora: tope,
      reintentar_en_segundos: Math.max(1, Math.ceil((HORA_MS - (ahora - recientes[0])) / 1000))
    })
  }

  ALTAS.set(contactoId, [...recientes, ahora])
}

/**
 * Crea la Tarea de un contacto en un Proyecto suyo, revalidando todo.
 *
 * Lo comparten el `POST` del portal y la confirmacion de una propuesta del orbe: la misma regla en los
 * dos caminos, que es lo que hace que confirmar no pueda saltarse nada.
 *
 * @param {object} peticion
 * @param {object} peticion.contacto el contacto de la sesion
 * @param {object} peticion.espacio el Proyecto, ya resuelto como suyo
 * @param {string[]} peticion.pestanias las pestañas que el Proyecto comparte
 * @param {unknown} peticion.datos el cuerpo del alta
 * @param {{ crearProceso: Function, procesos: object[] }} deps lo que presta `servidor.js`
 * @returns {{ estado: 200 | 201, proceso: object }} 200 si es la repeticion idempotente de un alta reciente
 * @throws {ErrorApi} 404 (interruptor apagado), 403 (sin pestaña), 422 o 429
 */
export function crearTareaDelPortal ({ contacto, espacio, pestanias, datos, deps }) {
  if (!clienteCreaTareas(contacto)) throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')
  if (!pestanias.includes('tasks')) throw new ErrorApi(403, 'forbidden', 'Este proyecto no comparte "tasks".')

  const alta = altaDeTareasDelEspacio(contacto, espacio, pestanias)
  const normalizada = validarAlta(datos, alta)
  const ahora = Date.now()
  const huella = `${contacto.id}:${espacio.id}:${normalizada.name.toLowerCase()}`
  const previa = RECIENTES.get(huella)

  if (previa !== undefined && ahora - previa.en < MINUTO_MS) return { estado: 200, proceso: previa.proceso }

  // Primero se arma —y con ello se valida del todo—, y recien despues se cuenta contra el tope: un alta
  // rechazada por una fecha pasada no tiene por que gastar una de las diez de la hora.
  const proceso = deps.crearProceso({
    name: normalizada.name,
    description: normalizada.description ?? undefined,
    due_date: normalizada.due_date ?? undefined,
    priority: normalizada.priority,
    assignees: normalizada.assignees,
    rel_type: 'project',
    rel_id: espacio.id,
    visible_to_client: 1
  }, { id: contacto.id, full_name: contacto.full_name, profile_image_url: null })

  // `crearProceso` firma como staff; la Tarea de un contacto no tiene `created_by` ni `assigned_by`
  // de equipo, y es la ficha del equipo la que lee `created_by_contact`.
  proceso.added_from = contacto.id
  proceso.created_by = null
  proceso.created_by_contact = { id: contacto.id, nombre: contacto.full_name }
  proceso.assignees = proceso.assignees.map((asignado) => ({ ...asignado, assigned_by: null }))

  contarAlta(contacto.id, ahora)
  deps.procesos.unshift(proceso)
  RECIENTES.set(huella, { en: ahora, proceso })

  return { estado: 201, proceso }
}
