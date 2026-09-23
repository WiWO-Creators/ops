/**
 * Listados de tickets en el mock: la bandeja global del equipo (`GET /tickets`), la pestaña del
 * Proyecto (`GET /projects/{id}/tickets`), sus contadores y la marca `no_leido` del portal.
 *
 * Va aparte de `tickets.js` —que atiende el detalle, las respuestas y las acciones— para que los dos
 * frentes que tocan tickets no se pisen. Los dos leen el mismo `TICKETS_PORTAL`, asi que lo que se
 * responde desde el modal se ve en la bandeja al refrescar.
 *
 * Forma y filtros: CONTRATO2 F. Las dos rutas del equipo devuelven la forma de
 * `RecursoTickets::presentarLote()` mas `ultimo_de`, `espera_desde` y `adminread` (`0|1`), aceptan
 * `filter[esperando]=equipo|cliente` y excluyen los hijos fusionados. `department` y `assigned` son
 * 422 para quien no administra, como en la API.
 *
 * Lectura, fusion y quien escribio lo ultimo salen de los ayudantes de `tickets.js`: las acciones del
 * modal escriben `adminread` y `clientread` (`0|1`) en el mismo objeto de `TICKETS_PORTAL` que aca se
 * lee, asi que "Sin leer" y "Esperando tu respuesta" cambian en cuanto alguien actua.
 */

import { ErrorApi, aplicarConsulta, campoFiltrable, coincideEnLista } from './consulta.js'
import {
  CLIENTES, CONTACTOS, DEPARTAMENTOS, ESPACIOS, PROCESOS, STAFF, TICKETS_PORTAL
} from './datos.js'
import {
  DEL_EQUIPO, esHijoFusionado, leidoPorElCliente, leidoPorElEquipo, noLeidoDelPortal, ultimoDe
} from './tickets.js'

/** Estado «Cerrado» de Perfex. */
const CERRADO = 5

/** `true` si el ticket no es un hijo fusionado. Los listados solo muestran principales. */
export function esPrincipal (ticket) {
  return esHijoFusionado(ticket.id) === null
}

/**
 * Fecha del ultimo mensaje del cliente, solo si lo ultimo es suyo (CONTRATO2 F).
 *
 * @param {{ date: string, replies: Array<{ from: string, date: string }> }} ticket
 * @returns {string | null}
 */
function esperaDesde (ticket) {
  if (ultimoDe(ticket) !== 'cliente') return null

  return ticket.replies.at(-1)?.date ?? ticket.date
}

/**
 * Una fila del listado del portal: la forma de siempre mas `no_leido`.
 *
 * @param {object} ticket
 * @param {(ticket: object) => object} presentar la forma base, la misma del alta
 * @returns {object}
 */
export function filaDelPortal (ticket, presentar) {
  return { ...presentar(ticket), no_leido: noLeidoDelPortal(ticket) }
}

/**
 * Una fila del listado del equipo, con la forma de `RecursoTickets::presentarLote()` recortada a lo
 * que la pantalla usa, mas los campos de CONTRATO2 F.
 */
function filaDelEquipo (ticket) {
  const extra = DEL_EQUIPO.get(ticket.id) ?? { assigned: null, department: null, task_id: null }
  const asignado = STAFF.find((s) => s.id === extra.assigned)
  const contacto = CONTACTOS.find((c) => c.id === ticket.contact_id)
  const cliente = CLIENTES.find((c) => c.id === ticket.client_id)
  const tarea = extra.task_id ? PROCESOS.find((p) => p.id === extra.task_id) : null
  const departamento = DEPARTAMENTOS.find((d) => d.id === extra.department)

  return {
    id: ticket.id,
    ticketkey: `mock-${ticket.id}`,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    department: departamento ? { id: departamento.id, name: departamento.name } : null,
    service: null,
    project_id: ticket.project_id ?? null,
    assigned: asignado ? { id: asignado.id, full_name: asignado.full_name, profile_image_url: null } : null,
    opened_by: null,
    solicitante: {
      tipo: 'contacto',
      contact: contacto ? { id: contacto.id, full_name: contacto.full_name, email: contacto.email } : null,
      client: cliente ? { id: cliente.id, name: cliente.company } : null,
      name: null,
      email: null
    },
    task: tarea ? { id: tarea.id, name: tarea.name, status: tarea.status, visible_to_client: false } : null,
    date: ticket.date,
    lastreply: ticket.last_reply,
    adminread: leidoPorElEquipo(ticket),
    clientread: leidoPorElCliente(ticket),
    merged_ticket_id: ticket.merged_ticket_id ?? null,
    ultimo_de: ultimoDe(ticket),
    espera_desde: esperaDesde(ticket),
    counts: { replies: ticket.replies.length, attachments: 0 }
  }
}

/**
 * `filter[esperando]`: `equipo` = lo ultimo es del cliente; `cliente` = lo ultimo es del equipo. Acepta
 * los dos separados por coma; vacio o cualquier otro valor es 422, como en la API.
 */
function filtroDeEspera (fila, valor) {
  const lados = valor.split(',').map((v) => v.trim())

  if (lados.length === 0 || lados.some((lado) => lado !== 'equipo' && lado !== 'cliente')) {
    throw new ErrorApi(422, 'validation_failed', 'Valor u operador incompatible con el campo.', {
      'filter[esperando]': ['invalid']
    })
  }

  if (fila.status === CERRADO) return false

  return lados.some((lado) => (lado === 'equipo' ? fila.ultimo_de === 'cliente' : fila.ultimo_de === 'equipo'))
}

/**
 * Whitelist de filtros, igual que `RecursoTickets::consulta()`.
 *
 * @param {boolean} esAdmin si quien pide administra; sin eso `department` y `assigned` no existen
 */
function filtrosDelListado (esAdmin) {
  return {
    ticketid: campoFiltrable((f) => f.id, 'numero'),
    subject: campoFiltrable((f) => f.subject),
    date: campoFiltrable((f) => f.date, 'fecha'),
    lastreply: campoFiltrable((f) => f.lastreply, 'fecha'),
    status: coincideEnLista((f) => f.status),
    priority: coincideEnLista((f) => f.priority),
    // Un ticket sin Proyecto tiene `project_id = 0` en la base: `filter[project_id]=0` es esa condicion.
    project_id: coincideEnLista((f) => f.project_id ?? 0),
    esperando: filtroDeEspera,
    ...(esAdmin
      ? {
          department: coincideEnLista((f) => f.department?.id ?? 0),
          assigned: coincideEnLista((f) => f.assigned?.id ?? 0)
        }
      : {})
  }
}

/**
 * Pagina un conjunto de tickets con la consulta de la peticion.
 *
 * Sin `sort` ordena por `-lastreply`, el orden por defecto de la API.
 */
function listar (tickets, parametros, esAdmin) {
  const conOrden = new URLSearchParams(parametros)
  if (!conOrden.has('sort')) conOrden.set('sort', '-lastreply')

  const { filas, paginacion } = aplicarConsulta(tickets.filter(esPrincipal).map(filaDelEquipo), conOrden, {
    filtros: filtrosDelListado(esAdmin),
    orden: ['subject', 'date', 'lastreply', 'status', 'priority'],
    busqueda: ['subject', 'ticketkey']
  })

  return { estado: 200, cuerpo: { data: filas, meta: { pagination: paginacion } } }
}

/** El Proyecto, o 404 con el mismo texto que el resto del mock. */
function proyectoO404 (id) {
  const espacio = ESPACIOS.find((e) => e.id === id)
  if (!espacio) throw new ErrorApi(404, 'not_found', `No existe espacio con id ${id}.`)
  return espacio
}

/**
 * `GET /projects/{id}/tickets/contadores` (CONTRATO2 F).
 *
 * abiertos: status distinto de Cerrado; esperando_equipo: abiertos cuyo ultimo mensaje es del
 * cliente; sin_leer: abiertos con `adminread = 0`.
 */
function contadores (proyectoId) {
  const abiertos = TICKETS_PORTAL
    .filter((t) => t.project_id === proyectoId && esPrincipal(t) && t.status !== CERRADO)

  return {
    estado: 200,
    cuerpo: {
      data: {
        abiertos: abiertos.length,
        esperando_equipo: abiertos.filter((t) => ultimoDe(t) === 'cliente').length,
        sin_leer: abiertos.filter((t) => leidoPorElEquipo(t) === 0).length
      }
    }
  }
}

/**
 * Rutas de listado de tickets del equipo. Devuelve `null` para lo que no es suyo.
 *
 * @param {{ metodo: string, recurso: string, resto: string[], parametros: URLSearchParams, actual: { is_admin?: boolean, is_superadmin?: boolean } }} peticion
 */
export function listadosDeTickets ({ metodo, recurso, resto, parametros, actual }) {
  if (metodo !== 'GET') return null

  const esAdmin = actual.is_admin === true || actual.is_superadmin === true

  if (recurso === 'tickets' && resto.length === 0) return listar(TICKETS_PORTAL, parametros, esAdmin)

  if (recurso !== 'projects' || resto[1] !== 'tickets') return null

  const proyectoId = Number(resto[0])
  proyectoO404(proyectoId)

  if (resto.length === 2) {
    return listar(TICKETS_PORTAL.filter((t) => t.project_id === proyectoId), parametros, esAdmin)
  }

  if (resto.length === 3 && resto[2] === 'contadores') return contadores(proyectoId)

  return null
}
