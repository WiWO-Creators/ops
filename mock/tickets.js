/**
 * Tickets en el mock: el hilo del cliente con la regla de respuesta (T2), las rutas del equipo (T4)
 * y los avisos de ticket nuevo por Proyecto (T3).
 *
 * Vive fuera de `servidor.js` para que ese archivo solo lo cablee: dos lineas del lado del portal y
 * una del lado del equipo. Las dos puntas escriben sobre **el mismo** `TICKETS_PORTAL`, asi que lo
 * que responde el equipo desde el panel es lo que el contacto lee en su portal, y el 409 de T2 se
 * puede ver cambiar a respuesta permitida sin reiniciar nada.
 *
 * Lo que el contrato poda, aca tambien se poda: el portal nunca recibe quien del equipo escribio mas
 * alla del nombre, y el panel no recibe `from`. Un mock que publica de mas deja pasar una pantalla
 * que se cae en produccion.
 */

import { ErrorApi, aplicarConsulta } from './consulta.js'
import {
  CLIENTES, CONTACTOS, DEPARTAMENTOS, ESPACIOS, ESTADOS_TICKET, PRIORIDADES_TICKET, PROCESOS, STAFF,
  TICKETS_PORTAL
} from './datos.js'

/** Estado «Cerrado» de Perfex. Es el que decide la regla T2. */
const CERRADO = 5

/** Tope de personas avisadas por Proyecto (T3). */
const TOPE_PERSONAS = 20

/**
 * Lo que el equipo sabe de un ticket y el cliente no: a quien esta asignado, que departamento lo
 * atiende y que Tarea lo trabaja. Va aparte para no ensuciar la fixture del portal con claves que el
 * contacto no puede ver.
 *
 * El 1 tiene Tarea (la 500, del Proyecto 1) para que el modal pinte el vinculo; el 2 no tiene
 * ninguna respuesta del equipo y es el que ejercita «esperando al equipo»; el 3 esta cerrado.
 */
const DEL_EQUIPO = new Map([
  [1, { assigned: 2, department: 1, task_id: 500 }],
  [2, { assigned: null, department: 1, task_id: null }],
  [3, { assigned: 3, department: 2, task_id: null }]
])

/**
 * Avisos de ticket nuevo por Proyecto. Ausente = aviso a todo el equipo, que es como funcionaba antes
 * de T3 y lo que devuelve la API para un Proyecto sin fila.
 *
 * @type {Map<number, { aviso_al_equipo: boolean, correos: string[], personas: number[] }>}
 */
const AVISOS = new Map()

/** Fecha con el formato de Perfex (`Y-m-d H:i:s`), en la hora de la maquina. */
function ahora () {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

/** El ticket, o 404. El staff ve todos los tickets de la fixture: el mock no modela visibilidad. */
function ticketO404 (id) {
  const ticket = TICKETS_PORTAL.find((t) => t.id === Number(id))
  if (!ticket) throw new ErrorApi(404, 'not_found', 'Ticket inexistente.')
  return ticket
}

/**
 * La regla T2, igual que `RecursoPortal`: cerrado manda, despues «sin respuesta del equipo».
 *
 * @param {{ status: number, replies: Array<{ from: string }> }} ticket
 * @returns {{ puede_responder: boolean, motivo_sin_respuesta: 'cerrado' | 'esperando_equipo' | null }}
 */
export function reglaDeRespuesta (ticket) {
  if (ticket.status === CERRADO) return { puede_responder: false, motivo_sin_respuesta: 'cerrado' }
  if (!ticket.replies.some((r) => r.from === 'equipo')) {
    return { puede_responder: false, motivo_sin_respuesta: 'esperando_equipo' }
  }
  return { puede_responder: true, motivo_sin_respuesta: null }
}

/**
 * Mensaje valido del cuerpo, o 422 con el mismo formato que `RespuestaTicket` del backend.
 *
 * @param {Record<string, unknown>} cuerpo
 * @param {string[]} permitidas claves aceptadas
 */
function mensajeDe (cuerpo, permitidas) {
  const ajenas = Object.keys(cuerpo).filter((c) => !permitidas.includes(c))
  if (ajenas.length > 0) {
    throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden escribir.', Object.fromEntries(ajenas.map((c) => [c, ['unknown']])))
  }
  const mensaje = typeof cuerpo.message === 'string' ? cuerpo.message.trim() : ''
  if (mensaje === '') {
    throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden escribir.', { message: ['required'] })
  }
  return mensaje
}

/** Id siguiente de respuesta, unico entre todos los tickets. */
function siguienteRespuesta () {
  return Math.max(0, ...TICKETS_PORTAL.flatMap((t) => t.replies.map((r) => r.id))) + 1
}

// --- Portal ----------------------------------------------------------------

/** `true` si la peticion es una respuesta del cliente. `servidor.js` la deja pasar como escritura. */
export function esRespuestaDelPortal (metodo, resto) {
  return metodo === 'POST' && resto[0] === 'tickets' && resto.length === 3 && resto[2] === 'respuestas'
}

/**
 * Ficha de un ticket del portal y su respuesta. Devuelve `null` para lo que no es suyo (la bandeja
 * y el alta los sigue atendiendo `servidor.js`).
 *
 * @param {{ metodo: string, resto: string[], contacto: { id: number, client_id: number, firstname?: string, lastname?: string }, cuerpo: () => Promise<Record<string, unknown>> }} peticion
 */
export async function ticketDelPortal ({ metodo, resto, contacto, cuerpo }) {
  if (resto.length < 2) return null

  const ticket = TICKETS_PORTAL.find((t) => t.id === Number(resto[1]) && t.client_id === contacto.client_id)
  if (!ticket) throw new ErrorApi(404, 'not_found', 'Ticket inexistente.')

  if (resto.length === 2 && metodo === 'GET') return { estado: 200, cuerpo: { data: fichaDelPortal(ticket) } }

  if (!esRespuestaDelPortal(metodo, resto)) throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')

  // `cuerpo` es un thunk: sin el `await` la validacion miraria una funcion y aceptaria cualquier cosa.
  const mensaje = mensajeDe((await cuerpo()) ?? {}, ['message'])
  const regla = reglaDeRespuesta(ticket)

  if (!regla.puede_responder) {
    throw regla.motivo_sin_respuesta === 'cerrado'
      ? new ErrorApi(409, 'ticket_cerrado', 'Este ticket está cerrado y ya no admite respuestas.')
      : new ErrorApi(409, 'ticket_sin_respuesta_del_equipo', 'Podrás responder cuando el equipo conteste tu solicitud.')
  }

  const contactoCompleto = CONTACTOS.find((c) => c.id === contacto.id)
  ticket.replies.push({
    id: siguienteRespuesta(),
    message: mensaje,
    date: ahora(),
    from: 'cliente',
    name: contactoCompleto?.full_name ?? 'Cliente',
    contact_id: contacto.id
  })
  ticket.last_reply = ahora()
  // Como Perfex: la respuesta del cliente reabre el ticket a «Abierto».
  ticket.status = 1

  return { estado: 201, cuerpo: { data: fichaDelPortal(ticket) } }
}

/** La ficha del contacto, con la forma podada de `RecursoPortal::ticket()` mas la regla T2. */
function fichaDelPortal (ticket) {
  const extra = DEL_EQUIPO.get(ticket.id)
  const tarea = extra?.task_id ? PROCESOS.find((p) => p.id === extra.task_id) : null

  return {
    id: ticket.id,
    subject: ticket.subject,
    date: ticket.date,
    last_reply: ticket.last_reply,
    status: ticket.status,
    priority: ticket.priority,
    project_id: ticket.project_id,
    // La Tarea es interna en la fixture: el cliente ve el avance y nada mas, que es la forma corta.
    task: tarea ? { progress: tarea.progress ?? 0 } : null,
    message: ticket.message,
    replies: ticket.replies.map((r) => ({ id: r.id, message: r.message, date: r.date, from: r.from, name: r.name })),
    ...reglaDeRespuesta(ticket)
  }
}

// --- Equipo ----------------------------------------------------------------

/**
 * Rutas del equipo sobre tickets. Devuelve `null` si la peticion no es de tickets.
 *
 * @param {{ metodo: string, recurso: string, resto: string[], parametros: URLSearchParams, cuerpo: () => Promise<Record<string, unknown>>, actual: { id: number } }} peticion
 */
export async function ticketsDelEquipo ({ metodo, recurso, resto, parametros, cuerpo, actual }) {
  if (recurso === 'projects' && resto[1] === 'tickets' && resto.length === 2 && metodo === 'GET') {
    return ticketsDelProyecto(Number(resto[0]), parametros)
  }

  if (recurso === 'projects' && resto[1] === 'ticket-notifications' && resto.length === 2) {
    return await avisosDelProyecto(metodo, Number(resto[0]), cuerpo)
  }

  if (recurso !== 'tickets' || resto.length === 0) return null

  const ticket = ticketO404(resto[0])
  const [, subrecurso] = resto

  if (subrecurso === undefined && metodo === 'GET') return { estado: 200, cuerpo: { data: fichaDelEquipo(ticket) } }
  if (subrecurso === undefined && metodo === 'PATCH') return await parchear(ticket, cuerpo)

  if (subrecurso === 'respuestas' && resto.length === 2) {
    if (metodo === 'GET') return { estado: 200, cuerpo: { data: ticket.replies.map(respuestaDelEquipo) } }
    if (metodo === 'POST') return await responderComoEquipo(ticket, cuerpo, actual)
  }

  if (subrecurso === 'archivos' && resto.length === 2 && metodo === 'GET') return { estado: 200, cuerpo: { data: [] } }

  throw new ErrorApi(404, 'not_found', 'Subrecurso desconocido.')
}

/** `GET /projects/{id}/tickets`, con la forma de `RecursoVentas::tickets()`: sin `task` ni `solicitante`. */
function ticketsDelProyecto (proyectoId, parametros) {
  const espacio = ESPACIOS.find((e) => e.id === proyectoId)
  if (!espacio) throw new ErrorApi(404, 'not_found', `No existe espacio con id ${proyectoId}.`)

  const filas = TICKETS_PORTAL.filter((t) => t.project_id === proyectoId).map((t) => {
    const extra = DEL_EQUIPO.get(t.id)
    const asignado = STAFF.find((s) => s.id === extra?.assigned)
    const cliente = CLIENTES.find((c) => c.id === t.client_id)
    return {
      id: t.id,
      ticketid: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      department: departamento(extra?.department),
      assigned: asignado ? { id: asignado.id, full_name: asignado.full_name, profile_image_url: null } : null,
      client: cliente ? { id: cliente.id, name: cliente.company } : null,
      date: t.date,
      lastreply: t.last_reply
    }
  })

  const { filas: pagina, paginacion } = aplicarConsulta(filas, parametros, {
    filtros: { status: 'status', priority: 'priority' },
    orden: ['date', 'lastreply', 'subject', 'status', 'priority'],
    busqueda: ['subject']
  })

  return { estado: 200, cuerpo: { data: pagina, meta: { pagination: paginacion } } }
}

function departamento (id) {
  const fila = DEPARTAMENTOS.find((d) => d.id === id)
  return fila ? { id: fila.id, name: fila.name } : null
}

/** La ficha del equipo, con la forma de `RecursoTickets::presentarLote()` recortada a lo que se usa. */
function fichaDelEquipo (ticket) {
  const extra = DEL_EQUIPO.get(ticket.id) ?? { assigned: null, department: null, task_id: null }
  const asignado = STAFF.find((s) => s.id === extra.assigned)
  const contacto = CONTACTOS.find((c) => c.id === ticket.contact_id)
  const cliente = CLIENTES.find((c) => c.id === ticket.client_id)
  const tarea = extra.task_id ? PROCESOS.find((p) => p.id === extra.task_id) : null

  return {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    department: departamento(extra.department),
    project_id: ticket.project_id,
    assigned: asignado ? { id: asignado.id, full_name: asignado.full_name, profile_image_url: null } : null,
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
    message: ticket.message
  }
}

/** Una respuesta como la ve el equipo: con `autor` tipado y sin `from`. */
function respuestaDelEquipo (respuesta) {
  if (respuesta.from === 'equipo') {
    const persona = STAFF.find((s) => s.id === respuesta.staff_id)
    return {
      id: respuesta.id,
      message: respuesta.message,
      date: respuesta.date,
      autor: { tipo: 'staff', id: persona?.id ?? null, full_name: persona?.full_name ?? respuesta.name, email: null },
      attachments: []
    }
  }
  const contacto = CONTACTOS.find((c) => c.id === respuesta.contact_id)
  return {
    id: respuesta.id,
    message: respuesta.message,
    date: respuesta.date,
    autor: { tipo: 'contacto', id: contacto?.id ?? null, full_name: contacto?.full_name ?? respuesta.name, email: contacto?.email ?? null },
    attachments: []
  }
}

/** Estado valido del catalogo, o 422. */
function estadoValido (valor) {
  if (!ESTADOS_TICKET.some((e) => e.id === Number(valor))) {
    throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden escribir.', { status: ['invalid'] })
  }
  return Number(valor)
}

/** `POST /tickets/{id}/respuestas`: `{message, status?}`. Sin `status`, el estado no cambia. */
async function responderComoEquipo (ticket, cuerpo, actual) {
  const datos = (await cuerpo()) ?? {}
  const mensaje = mensajeDe(datos, ['message', 'status'])
  const estado = datos.status === undefined || datos.status === null || datos.status === '' ? null : estadoValido(datos.status)
  const persona = STAFF.find((s) => s.id === actual.id)
  const respuesta = {
    id: siguienteRespuesta(),
    message: mensaje,
    date: ahora(),
    from: 'equipo',
    name: persona?.full_name ?? 'Equipo',
    staff_id: actual.id
  }

  ticket.replies.push(respuesta)
  ticket.last_reply = respuesta.date
  if (estado !== null) ticket.status = estado

  return { estado: 201, cuerpo: { data: respuestaDelEquipo(respuesta) } }
}

/** `PATCH /tickets/{id}`: estado, prioridad y asignado. Toda otra clave es 422, como en `ParcheTicket`. */
async function parchear (ticket, cuerpo) {
  const datos = (await cuerpo()) ?? {}
  const ajenas = Object.keys(datos).filter((c) => !['status', 'priority', 'assigned'].includes(c))
  if (ajenas.length > 0 || Object.keys(datos).length === 0) {
    throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden escribir.', Object.fromEntries((ajenas.length > 0 ? ajenas : ['status']).map((c) => [c, ['unknown']])))
  }
  if (datos.status !== undefined) ticket.status = estadoValido(datos.status)
  if (datos.priority !== undefined) {
    if (!PRIORIDADES_TICKET.some((p) => p.id === Number(datos.priority))) {
      throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden escribir.', { priority: ['invalid'] })
    }
    ticket.priority = Number(datos.priority)
  }
  if (datos.assigned !== undefined) {
    const extra = DEL_EQUIPO.get(ticket.id) ?? { assigned: null, department: null, task_id: null }
    DEL_EQUIPO.set(ticket.id, { ...extra, assigned: datos.assigned === 0 ? null : Number(datos.assigned) })
  }
  return { estado: 200, cuerpo: { data: fichaDelEquipo(ticket) } }
}

/** `GET|PUT /projects/{id}/ticket-notifications` (T3), con las mismas validaciones que la API. */
async function avisosDelProyecto (metodo, proyectoId, cuerpo) {
  if (!ESPACIOS.some((e) => e.id === proyectoId)) {
    throw new ErrorApi(404, 'not_found', `No existe espacio con id ${proyectoId}.`)
  }

  if (metodo === 'PUT') {
    const datos = (await cuerpo()) ?? {}
    // Una clave omitida conserva lo guardado, como en la API: el PUT de T3 no es un reemplazo total.
    const previo = AVISOS.get(proyectoId) ?? { aviso_al_equipo: true, correos: [], personas: [] }
    const aviso = datos.aviso_al_equipo ?? previo.aviso_al_equipo
    const personas = datos.personas ?? previo.personas
    const correos = datos.correos ?? previo.correos
    const errores = {}
    const ajenas = Object.keys(datos).filter((c) => !['aviso_al_equipo', 'correos', 'personas'].includes(c))
    for (const clave of ajenas) errores[clave] = ['unknown']
    if (typeof aviso !== 'boolean') errores.aviso_al_equipo = ['boolean']
    if (!Array.isArray(personas) || personas.length > TOPE_PERSONAS) errores.personas = ['invalid']
    else if (personas.some((id) => !STAFF.some((s) => s.id === Number(id) && s.active))) errores.personas = ['inactive']
    if (!Array.isArray(correos) || correos.some((c) => typeof c !== 'string' || !c.includes('@'))) errores.correos = ['invalid']
    if (aviso === false && Array.isArray(personas) && Array.isArray(correos) && personas.length === 0 && correos.length === 0) {
      errores.personas = ['required']
    }
    if (Object.keys(errores).length > 0) {
      throw new ErrorApi(422, 'validation_failed', 'Revisá a quién se avisa.', errores)
    }

    AVISOS.set(proyectoId, {
      aviso_al_equipo: aviso,
      correos: [...new Set(correos)],
      personas: [...new Set(personas.map(Number))]
    })
  } else if (metodo !== 'GET') {
    throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')
  }

  const guardado = AVISOS.get(proyectoId) ?? { aviso_al_equipo: true, correos: [], personas: [] }

  return {
    estado: 200,
    cuerpo: {
      data: {
        aviso_al_equipo: guardado.aviso_al_equipo,
        correos: guardado.correos,
        personas: guardado.personas
          // Solo activos: quien se dio de baja despues de elegido ya no recibe el aviso ni figura.
          .map((id) => STAFF.find((s) => s.id === id && s.active))
          .filter(Boolean)
          .map((s) => ({ id: s.id, nombre: s.full_name, email: s.email }))
      }
    }
  }
}
