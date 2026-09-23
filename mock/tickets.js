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

import { ErrorApi } from './consulta.js'
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
export const DEL_EQUIPO = new Map([
  [1, { assigned: 2, department: 1, task_id: 500 }],
  [2, { assigned: null, department: 1, task_id: null }],
  [3, { assigned: 3, department: 2, task_id: null }],
  [40, { assigned: 2, department: 1, task_id: null }]
])

/**
 * Dos tickets mas del cliente 1, sembrados aca y no en `datos.js` para no tocar la fixture comun:
 *
 *  - El 40 esta en el Proyecto 1 y lo ultimo lo escribio el cliente, sin leer por el equipo: es el
 *    que ejercita "Esperando al equipo" con `espera_desde` y el resaltado de no leido.
 *  - El 41 es un hijo fusionado en el 1 (`merged_ticket_id`): ningun listado lo muestra y su enlace
 *    viejo se resuelve al principal (CONTRATO2 D y F).
 */
const SEMBRADOS = [
  {
    id: 40,
    client_id: 1,
    contact_id: 1,
    subject: 'El formulario de contacto no envía',
    message: 'Al apretar Enviar la página se queda cargando.',
    date: '2026-09-20 10:05:00',
    last_reply: '2026-09-22 18:30:00',
    status: 1,
    priority: 3,
    project_id: 1,
    replies: [
      { id: 400, message: '¿Desde qué navegador lo pruebas?', date: '2026-09-21 09:10:00', from: 'equipo', name: 'Equipo Wiwo', staff_id: 2 },
      { id: 401, message: 'Desde Chrome en el celular.', date: '2026-09-22 18:30:00', from: 'cliente', name: 'Clienta Acme', contact_id: 1 }
    ]
  },
  {
    id: 41,
    client_id: 1,
    contact_id: 1,
    subject: 'Logo pixelado (duplicado)',
    message: 'Es el mismo problema del logo.',
    date: '2026-09-15 09:30:00',
    last_reply: null,
    status: 1,
    priority: 2,
    project_id: 1,
    merged_ticket_id: 1,
    replies: []
  }
]

for (const ticket of SEMBRADOS) {
  if (!TICKETS_PORTAL.some((t) => t.id === ticket.id)) TICKETS_PORTAL.push(ticket)
}

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

// --- Detalle, respuestas y acciones (contrato v2, frente F1) -------------------------------------
//
// Todo lo de aca abajo hasta «Portal» es de las fichas y las escrituras sobre un ticket. Los
// listados y contadores usan los ayudantes exportados (`ultimoDe`, `leidoPorElEquipo`,
// `noLeidoDelPortal`, `esHijoFusionado`), para que la bandeja y la ficha digan lo mismo.

/** Tope de caracteres de un mensaje (C). */
const LARGO_MAXIMO = 20000

/** Topes por contacto y hora (C), configurables como en la API. */
const ALTAS_POR_HORA = Number(process.env.PORTAL_TICKETS_ALTAS_POR_HORA ?? 10)
const RESPUESTAS_POR_HORA = Number(process.env.PORTAL_TICKETS_RESPUESTAS_POR_HORA ?? 30)

/** Dias desde el cierre en los que el cliente todavia puede reabrir (E). */
const DIAS_REAPERTURA = Number(process.env.PORTAL_TICKETS_DIAS_REAPERTURA ?? 14)

/** Ventana del alta idempotente (C): mismo contacto, asunto y mensaje dentro de esto es el mismo alta. */
const VENTANA_IDEMPOTENCIA_MS = 60_000

/** Respuestas predefinidas (`tbltickets_predefined_replies`), con HTML como las guarda Perfex. */
const PREDEFINIDAS = [
  { id: 1, name: 'Saludo inicial', message: '<p>Hola, gracias por escribirnos.</p><p>Ya estamos revisando tu solicitud.</p>' },
  { id: 2, name: 'Pedir más detalles', message: 'Para avanzar necesitamos un poco m&aacute;s de informaci&oacute;n:<br />\r\n¿desde cu&aacute;ndo ocurre y en qu&eacute; navegador?' },
  { id: 3, name: 'Cierre por resolución', message: '<p>Dejamos esto resuelto. Si vuelve a pasar, responde aquí mismo.</p>' }
]

/** Adjuntos del mensaje de apertura y de respuestas (`tblticket_attachments`). */
const ADJUNTOS = [
  { id: 8, ticket_id: 1, reply_id: null, file_name: 'manual-portada.pdf', filetype: 'application/pdf', date_added: '2026-09-15 09:12:00' },
  { id: 9, ticket_id: 1, reply_id: 1, file_name: 'captura-72dpi.png', filetype: 'image/png', date_added: '2026-09-16 11:40:00' }
]

/** Marcas de tiempo de altas y respuestas por contacto, para los topes por hora. */
const ACTIVIDAD = { altas: new Map(), respuestas: new Map() }

/** Escapa HTML como `html_escape()` de Perfex. */
function escaparHtml (texto) {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

/**
 * El `message` que emite la API: el HTML guardado. Lo escrito por la API (respuestas nuevas) ya se
 * guarda asi; la fixture vieja trae texto plano, que se presenta como lo habria guardado `nl2br`.
 */
function htmlDe (guardado) {
  if (typeof guardado !== 'string') return ''
  if (/<[a-z/][^>]*>|&[a-z#0-9]+;/i.test(guardado)) return guardado
  return escaparHtml(guardado).replace(/\r?\n/g, '<br />\r\n')
}

/**
 * `TextoDeTicket::plano()`: la regla de la seccion A, la misma que el backend.
 *
 * br, </p>, </div>, </li> → salto; fuera etiquetas; entidades decodificadas; recorte; 3+ saltos → 2.
 * Antes, `\r\n` → `\n`, y el salto crudo justo despues de esas etiquetas se absorbe: `nl2br` deja
 * `<br />\r\n` y sin absorberlo cada renglon tendria una linea en blanco de mas.
 */
export function textoPlano (html) {
  const entidades = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', iquest: '¿', iexcl: '¡' }
  return String(html ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>\n?/gi, '\n')
    .replace(/<\/(p|div|li)\s*>\n?/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entera, cuerpo) => {
      if (cuerpo.startsWith('#')) {
        const hexa = cuerpo[1] === 'x' || cuerpo[1] === 'X'
        return String.fromCodePoint(Number.parseInt(cuerpo.slice(hexa ? 2 : 1), hexa ? 16 : 10))
      }
      return entidades[cuerpo] ?? entera
    })
    .trim()
    .replace(/\n{3,}/g, '\n\n')
}

/** El mensaje con sus dos formas: el HTML de Perfex y el texto limpio (A). */
function conTexto (guardado) {
  const message = htmlDe(guardado)
  return { message, message_texto: textoPlano(message) }
}

/** Un adjunto como lo publica la API. */
function adjuntoDeApi (adjunto) {
  return { ...adjunto, download_path: `files/ticket/${adjunto.id}/download` }
}

/**
 * El id del principal si `id` es un hijo fusionado (`merged_ticket_id` en la fixture); si no, `null`.
 * Un ticket inexistente tampoco es hijo de nadie.
 */
export function esHijoFusionado (id) {
  const ticket = TICKETS_PORTAL.find((t) => t.id === Number(id))
  return ticket?.merged_ticket_id ?? null
}

/**
 * Quien escribio lo ultimo. Un ticket sin respuestas lo abrio el cliente.
 *
 * @param {{ replies: Array<{ from: string }> }} ticket
 * @returns {'equipo' | 'cliente'}
 */
export function ultimoDe (ticket) {
  return ticket.replies.at(-1)?.from === 'equipo' ? 'equipo' : 'cliente'
}

/**
 * `adminread` del ticket (`0|1`): el guardado, o deducido si la fixture no lo trae (lo ultimo del
 * cliente en un ticket abierto esta sin leer), que es lo que Perfex deja despues de cada respuesta.
 *
 * @returns {0 | 1}
 */
export function leidoPorElEquipo (ticket) {
  if (ticket.adminread === 0 || ticket.adminread === 1) return ticket.adminread
  return ultimoDe(ticket) === 'cliente' && ticket.status !== CERRADO ? 0 : 1
}

/**
 * `clientread` del ticket (`0|1`): el guardado, o deducido si la fixture no lo trae (lo ultimo del
 * equipo esta sin leer: Perfex pone `clientread = 0` con cada respuesta del staff).
 *
 * @returns {0 | 1}
 */
export function leidoPorElCliente (ticket) {
  if (ticket.clientread === 0 || ticket.clientread === 1) return ticket.clientread
  return ultimoDe(ticket) === 'equipo' ? 0 : 1
}

/**
 * Escribe las dos marcas de lectura en el ticket de `TICKETS_PORTAL`, que es lo que leen los
 * listados. Lo que no se cambia queda materializado con su valor actual, asi despues de cualquier
 * escritura el objeto trae `adminread` y `clientread` explicitos.
 *
 * @param {object} ticket el objeto de la fixture
 * @param {{ adminread?: 0 | 1, clientread?: 0 | 1 }} cambios
 */
function fijarLectura (ticket, cambios) {
  ticket.adminread = cambios.adminread ?? leidoPorElEquipo(ticket)
  ticket.clientread = cambios.clientread ?? leidoPorElCliente(ticket)
}

/**
 * `no_leido` del portal (E), igual que `RecursoPortal::sinLeerPorElCliente()`: `clientread = 0` y el
 * ultimo mensaje es del equipo.
 */
export function noLeidoDelPortal (ticket) {
  return leidoPorElCliente(ticket) === 0 && ultimoDe(ticket) === 'equipo'
}

/**
 * Fecha del cierre para el plazo de reapertura: la del cierre por el portal si la hay, y si no el
 * ultimo evento conocido (`last_reply`, o la apertura). Es la eleccion documentada del contrato E.
 */
function fechaDeCierre (ticket) {
  return ticket.cerrado_en ?? ticket.last_reply ?? ticket.date
}

/** `true` si todavia se puede reabrir: cerrado y dentro del plazo. */
function dentroDelPlazo (ticket) {
  const cierre = new Date(String(fechaDeCierre(ticket)).replace(' ', 'T')).getTime()
  return Number.isFinite(cierre) && Date.now() - cierre <= DIAS_REAPERTURA * 86_400_000
}

/**
 * Registra una escritura del contacto y lanza 429 si pasa el tope de la hora (C).
 *
 * @param {'altas' | 'respuestas'} tipo
 * @param {number} contactoId
 */
function contarOLimitar (tipo, contactoId) {
  const tope = tipo === 'altas' ? ALTAS_POR_HORA : RESPUESTAS_POR_HORA
  const ahoraMs = Date.now()
  const recientes = (ACTIVIDAD[tipo].get(contactoId) ?? []).filter((t) => ahoraMs - t < 3_600_000)

  if (recientes.length >= tope) {
    const reintentar = Math.max(1, Math.ceil((recientes[0] + 3_600_000 - ahoraMs) / 1000))
    ACTIVIDAD[tipo].set(contactoId, recientes)
    throw new ErrorApi(429, 'rate_limited',
      tipo === 'altas' ? 'Enviaste muchas solicitudes seguidas. Prueba de nuevo en un rato.' : 'Enviaste muchas respuestas seguidas. Prueba de nuevo en un rato.',
      { tope_por_hora: tope, reintentar_en_segundos: reintentar })
  }

  ACTIVIDAD[tipo].set(contactoId, [...recientes, ahoraMs])
}

/** 422 si el mensaje pasa el largo maximo (C). */
function largoValido (mensaje) {
  if (mensaje.length > LARGO_MAXIMO) {
    throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden escribir.', { message: [`max:${LARGO_MAXIMO}`] })
  }
  return mensaje
}

/**
 * Alta del portal con tope e idempotencia (C). La creacion en si la sigue haciendo `servidor.js`.
 *
 * @param {{ id: number }} contacto
 * @param {Record<string, unknown>} cuerpo ya leido
 * @param {(contacto: object, cuerpo: object) => { id: number }} crear el alta de `servidor.js`
 * @returns {{ estado: number, cuerpo: { data: object } }}
 */
export function altaDelPortal (contacto, cuerpo, crear) {
  const campos = cuerpo ?? {}
  const asunto = typeof campos.subject === 'string' ? campos.subject.trim() : ''
  const mensaje = typeof campos.message === 'string' ? campos.message.trim() : ''

  largoValido(mensaje)

  const repetido = TICKETS_PORTAL.find((t) => t.contact_id === contacto.id && t.subject === asunto &&
    t.mensaje_original === mensaje && Date.now() - (t.creado_ms ?? 0) < VENTANA_IDEMPOTENCIA_MS)
  if (repetido) return { estado: 200, cuerpo: { data: { ...fichaDelPortal(repetido, contacto) } } }

  contarOLimitar('altas', contacto.id)
  const creado = crear(contacto, campos)
  const ticket = TICKETS_PORTAL.find((t) => t.id === creado.id)
  if (ticket) {
    ticket.mensaje_original = mensaje
    ticket.creado_ms = Date.now()
    // Como el INSERT de `TicketDelPortal::crear()`: nuevo para el equipo, leido por quien lo abrio.
    fijarLectura(ticket, { adminread: 0, clientread: 1 })
  }

  return { estado: 201, cuerpo: { data: ticket ? fichaDelPortal(ticket, contacto) : creado } }
}

// --- Portal ----------------------------------------------------------------

/** Acciones del contacto sobre un ticket suyo (E), ademas de responder. */
const ACCIONES_DEL_PORTAL = ['respuestas', 'cerrar', 'reabrir', 'leido']

/** `true` si la peticion es una respuesta del cliente. */
export function esRespuestaDelPortal (metodo, resto) {
  return metodo === 'POST' && resto[0] === 'tickets' && resto.length === 3 && resto[2] === 'respuestas'
}

/**
 * `true` si la peticion es una escritura del contacto sobre un ticket: responder, cerrar, reabrir o
 * marcar leido. `servidor.js` la deja pasar como escritura; todo lo demas del portal es lectura.
 */
export function esAccionDelPortal (metodo, resto) {
  return metodo === 'POST' && resto[0] === 'tickets' && resto.length === 3 && ACCIONES_DEL_PORTAL.includes(resto[2])
}

/**
 * Ficha de un ticket del portal y sus acciones. Devuelve `null` para lo que no es suyo (la bandeja
 * y el alta los sigue atendiendo `servidor.js`).
 *
 * Un hijo fusionado se resuelve al principal si esta en el alcance del contacto (D): la ficha sale
 * con el `id` del principal y `fusionado_desde`, y responder escribe en el principal.
 *
 * @param {{ metodo: string, resto: string[], contacto: { id: number, client_id: number }, cuerpo: () => Promise<Record<string, unknown>> }} peticion
 */
export async function ticketDelPortal ({ metodo, resto, contacto, cuerpo }) {
  if (resto.length < 2) return null

  const pedido = Number(resto[1])
  const principal = esHijoFusionado(pedido)
  const id = principal ?? pedido
  const ticket = TICKETS_PORTAL.find((t) => t.id === id && t.client_id === contacto.client_id)
  if (!ticket) throw new ErrorApi(404, 'not_found', 'Ticket inexistente.')

  const ficha = () => ({ ...fichaDelPortal(ticket, contacto), fusionado_desde: principal === null ? null : pedido })

  if (resto.length === 2 && metodo === 'GET') return { estado: 200, cuerpo: { data: ficha() } }

  if (!esAccionDelPortal(metodo, resto)) throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')

  const accion = resto[2]

  // Cerrar, reabrir y leido van sin cuerpo: cualquier campo es 422, como en la API.
  if (accion !== 'respuestas') {
    const ajenas = Object.keys((await cuerpo()) ?? {})
    if (ajenas.length > 0) {
      throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden escribir.', Object.fromEntries(ajenas.map((c) => [c, ['unknown']])))
    }
  }

  if (accion === 'leido') {
    fijarLectura(ticket, { clientread: 1 })
    return { estado: 204, cuerpo: null }
  }

  if (accion === 'cerrar') {
    if (ticket.status === CERRADO) throw new ErrorApi(409, 'ticket_cerrado', 'Esta solicitud ya está cerrada.')
    ticket.status = CERRADO
    ticket.cerrado_en = ahora()
    // La API no toca las marcas al cerrar; se materializan para que el listado lea lo mismo que antes.
    fijarLectura(ticket, {})
    return { estado: 200, cuerpo: { data: ficha() } }
  }

  if (accion === 'reabrir') {
    if (ticket.status !== CERRADO) throw new ErrorApi(409, 'ticket_abierto', 'Esta solicitud no está cerrada.')
    if (!dentroDelPlazo(ticket)) {
      throw new ErrorApi(409, 'reapertura_vencida', `Pasaron más de ${DIAS_REAPERTURA} días desde el cierre.`)
    }
    ticket.status = 1
    ticket.cerrado_en = null
    fijarLectura(ticket, { adminread: 0 })
    return { estado: 200, cuerpo: { data: ficha() } }
  }

  // `cuerpo` es un thunk: sin el `await` la validacion miraria una funcion y aceptaria cualquier cosa.
  const mensaje = largoValido(mensajeDe((await cuerpo()) ?? {}, ['message']))
  const regla = reglaDeRespuesta(ticket)

  if (!regla.puede_responder) {
    throw regla.motivo_sin_respuesta === 'cerrado'
      ? new ErrorApi(409, 'ticket_cerrado', 'Este ticket está cerrado y ya no admite respuestas.')
      : new ErrorApi(409, 'ticket_sin_respuesta_del_equipo', 'Podrás responder cuando el equipo conteste tu solicitud.')
  }

  contarOLimitar('respuestas', contacto.id)

  const contactoCompleto = CONTACTOS.find((c) => c.id === contacto.id)
  ticket.replies.push({
    id: siguienteRespuesta(),
    message: htmlDe(mensaje),
    date: ahora(),
    from: 'cliente',
    name: contactoCompleto?.full_name ?? 'Cliente',
    contact_id: contacto.id
  })
  ticket.last_reply = ahora()
  // Quien responde ya leyo lo anterior: `no_leido` se apaga con la propia respuesta.
  fijarLectura(ticket, { adminread: 0, clientread: 1 })
  // Como Perfex: la respuesta del cliente reabre el ticket a «Abierto», salvo que este «En curso».
  if (ticket.status !== 2) ticket.status = 1

  return { estado: 201, cuerpo: { data: ficha() } }
}

/**
 * La ficha del contacto, con la forma podada de `RecursoPortal::ticket()`, la regla T2 y lo del
 * contrato v2: texto limpio (A), autoria (B), cierre, reapertura y lectura (E).
 */
function fichaDelPortal (ticket, contacto) {
  const extra = DEL_EQUIPO.get(ticket.id)
  const tarea = extra?.task_id ? PROCESOS.find((p) => p.id === extra.task_id) : null
  const solicitante = CONTACTOS.find((c) => c.id === ticket.contact_id)

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
    ...conTexto(ticket.message),
    mio: ticket.contact_id === contacto.id,
    solicitante: { nombre: solicitante?.full_name ?? 'Cliente' },
    replies: ticket.replies.map((r) => ({
      id: r.id,
      ...conTexto(r.message),
      date: r.date,
      from: r.from,
      name: r.name,
      autor: r.from === 'equipo'
        ? { tipo: 'equipo', nombre: STAFF.find((s) => s.id === r.staff_id)?.full_name ?? r.name, mio: false }
        : { tipo: 'cliente', nombre: CONTACTOS.find((c) => c.id === r.contact_id)?.full_name ?? r.name, mio: r.contact_id === contacto.id }
    })),
    ...reglaDeRespuesta(ticket),
    puede_cerrar: ticket.status !== CERRADO,
    puede_reabrir: ticket.status === CERRADO && dentroDelPlazo(ticket),
    no_leido: noLeidoDelPortal(ticket)
  }
}

// --- Equipo ----------------------------------------------------------------

/**
 * Rutas del equipo sobre tickets. Devuelve `null` si la peticion no es de tickets.
 *
 * @param {{ metodo: string, recurso: string, resto: string[], cuerpo: () => Promise<Record<string, unknown>>, actual: { id: number } }} peticion
 */
export async function ticketsDelEquipo ({ metodo, recurso, resto, cuerpo, actual }) {
  if (recurso === 'projects' && resto[1] === 'ticket-notifications' && resto.length === 2) {
    return await avisosDelProyecto(metodo, Number(resto[0]), cuerpo)
  }

  if (recurso !== 'tickets' || resto.length === 0) return null

  if (resto[0] === 'respuestas-predefinidas' && resto.length === 1 && metodo === 'GET') {
    return { estado: 200, cuerpo: { data: PREDEFINIDAS } }
  }

  // El hilo de un hijo fusionado es el del principal: leerlo lo lee y responderle escribe ahi (D).
  const [, subrecurso] = resto
  const hiloDelPrincipal = subrecurso === 'respuestas' && esHijoFusionado(resto[0]) !== null
  const ticket = ticketO404(hiloDelPrincipal ? esHijoFusionado(resto[0]) : resto[0])

  if (subrecurso === undefined && metodo === 'GET') {
    // `GET /tickets/{id}` escribe `adminread = 1`, como `set_ticket_open()` en el panel viejo.
    fijarLectura(ticket, { adminread: 1 })
    return { estado: 200, cuerpo: { data: fichaDelEquipo(ticket) } }
  }
  if (subrecurso === undefined && metodo === 'PATCH') return await parchear(ticket, cuerpo)

  if (subrecurso === 'respuestas' && resto.length === 2) {
    if (metodo === 'GET') return { estado: 200, cuerpo: { data: ticket.replies.map(respuestaDelEquipo) } }
    if (metodo === 'POST') return await responderComoEquipo(ticket, cuerpo, actual)
  }

  if (subrecurso === 'archivos' && resto.length === 2 && metodo === 'GET') {
    const deApertura = ADJUNTOS.filter((a) => a.ticket_id === ticket.id && a.reply_id === null).map(adjuntoDeApi)
    return { estado: 200, cuerpo: { data: deApertura } }
  }

  throw new ErrorApi(404, 'not_found', 'Subrecurso desconocido.')
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
    ...conTexto(ticket.message)
  }
}

/** Una respuesta como la ve el equipo: con `autor` tipado, texto limpio, adjuntos y sin `from`. */
function respuestaDelEquipo (respuesta) {
  const adjuntos = ADJUNTOS.filter((a) => a.reply_id === respuesta.id).map(adjuntoDeApi)

  if (respuesta.from === 'equipo') {
    const persona = STAFF.find((s) => s.id === respuesta.staff_id)
    return {
      id: respuesta.id,
      ...conTexto(respuesta.message),
      date: respuesta.date,
      autor: { tipo: 'staff', id: persona?.id ?? null, full_name: persona?.full_name ?? respuesta.name, email: null },
      attachments: adjuntos
    }
  }
  const contacto = CONTACTOS.find((c) => c.id === respuesta.contact_id)
  return {
    id: respuesta.id,
    ...conTexto(respuesta.message),
    date: respuesta.date,
    autor: { tipo: 'contacto', id: contacto?.id ?? null, full_name: contacto?.full_name ?? respuesta.name, email: contacto?.email ?? null },
    attachments: adjuntos
  }
}

/** Estado valido del catalogo, o 422. */
function estadoValido (valor) {
  if (!ESTADOS_TICKET.some((e) => e.id === Number(valor))) {
    throw new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden escribir.', { status: ['invalid'] })
  }
  return Number(valor)
}

/**
 * `POST /tickets/{id}/respuestas`: `{message, status?}` (contrato v2, G).
 *
 * El texto se guarda como HTML con `nl2br` sobre lo escapado. Sin `status` y con el ticket Abierto
 * pasa a Respondido; en cualquier otro estado se conserva. Deja `clientread = 0` (el cliente tiene
 * algo nuevo) y `adminread = 1`.
 */
async function responderComoEquipo (ticket, cuerpo, actual) {
  const datos = (await cuerpo()) ?? {}
  const mensaje = largoValido(mensajeDe(datos, ['message', 'status']))
  const estado = datos.status === undefined || datos.status === null || datos.status === '' ? null : estadoValido(datos.status)
  const persona = STAFF.find((s) => s.id === actual.id)
  const respuesta = {
    id: siguienteRespuesta(),
    message: escaparHtml(mensaje).replace(/\r?\n/g, '<br />\r\n'),
    date: ahora(),
    from: 'equipo',
    name: persona?.full_name ?? 'Equipo',
    staff_id: actual.id
  }

  ticket.replies.push(respuesta)
  ticket.last_reply = respuesta.date
  if (estado !== null) ticket.status = estado
  else if (ticket.status === 1) ticket.status = 3
  fijarLectura(ticket, { adminread: 1, clientread: 0 })

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
      throw new ErrorApi(422, 'validation_failed', 'Revisa a quién se avisa.', errores)
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
