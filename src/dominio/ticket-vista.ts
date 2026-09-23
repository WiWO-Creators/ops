import type { RespuestaTicket, TicketDetalle } from '../datos/recursos.ts'
import type { TicketPortalDetalle } from '../datos/portal.ts'

/**
 * Un ticket tal como lo dibuja el modal, venga del panel o del portal.
 *
 * El equipo y el cliente miran el mismo ticket con dos contratos distintos: el panel recibe la ficha
 * (`GET /tickets/{id}`) y el hilo aparte (`GET /tickets/{id}/respuestas`), con el autor resuelto por
 * `tipo`; el portal recibe todo junto (`GET /portal/tickets/{id}`), con el autor ya reducido a
 * `from` y la regla de respuesta calculada por la API. Si el modal leyera los dos contratos
 * adentro, tendria una rama por sujeto en cada bloque. Asi que se traducen aca, una vez, a una sola
 * forma, y el modal dibuja esa forma sin saber de quien es.
 *
 * Mismo criterio que `dominio/fuente-proyecto.ts`: lo que cambia entre sujetos son **rutas** (la
 * fuente, todo texto) y **capacidades** (otra prop). Nada de funciones en la fuente: la arma un
 * Server Component en el portal y cruza al cliente.
 */

/**
 * Parametro de la URL que abre el modal de un ticket.
 *
 * Vive en un modulo sin `'use client'` por lo mismo que `PARAMETRO_TAREA`: la pagina del portal es un
 * Server Component y arma enlaces con el; importado desde un modulo cliente llegaria como referencia
 * y no como texto.
 */
export const PARAMETRO_TICKET = 'ticket'

/** Clave de la pestaña Tickets en la ficha del Proyecto del equipo (`?tab=tickets`). */
export const PESTANA_TICKETS = 'tickets'

/** Estado «Cerrado» de Perfex (`tbltickets_status`, id 5). Es el que usa la regla T2. */
export const ESTADO_TICKET_CERRADO = 5

/** Por que el cliente no puede responder, tal como lo dice la API (`motivo_sin_respuesta`). */
export type MotivoSinRespuesta = 'esperando_equipo' | 'cerrado'

/**
 * De donde bajan los datos de un ticket y a donde apuntan sus enlaces.
 *
 * Todas las rutas del BFF van sin barra inicial; los enlaces de pagina, con ella. `:id` es el id
 * del ticket (o del Proyecto, o de la Tarea, segun la clave) y `:proyecto` el del Proyecto.
 */
export interface FuenteDeTicket {
  /**
   * Cual de los dos contratos es.
   *
   * **Solo lo lee {@link vistaDelTicket}**, que es donde las dos formas de la API se vuelven una. El
   * modal no pregunta por el sujeto: dibuja la vista y obedece las capacidades.
   */
  sujeto: 'panel' | 'portal'
  /** Ficha del ticket. Plantilla con `:id`. */
  ticket: string
  /**
   * El hilo, cuando el sujeto lo pide aparte. Plantilla con `:id`.
   *
   * `null` en el portal: la ficha del contacto trae `replies` adentro, y no existe una ruta de
   * respuestas que se pueda leer. Con `null` el modal no pide nada de mas.
   */
  respuestas: string | null
  /** Donde se manda una respuesta (`POST`). Plantilla con `:id`. */
  responder: string
  /** Donde se cambia estado y prioridad (`PATCH`). Plantilla con `:id`. */
  editar: string
  /** Catalogos: `ticket_statuses` y `ticket_priorities` salen de aca. */
  lookups: string
  /** Pagina del Proyecto. Plantilla con `:id`. */
  paginaProyecto: string
  /** Pagina de la Tarea vinculada. Plantilla con `:proyecto` y `:id`. */
  paginaTarea: string
}

/** El ticket visto por el equipo. */
export const TICKET_DEL_PANEL: FuenteDeTicket = {
  sujeto: 'panel',
  ticket: 'tickets/:id',
  respuestas: 'tickets/:id/respuestas',
  responder: 'tickets/:id/respuestas',
  editar: 'tickets/:id',
  lookups: 'lookups',
  paginaProyecto: '/proyectos/:id',
  paginaTarea: '/proyectos/:proyecto?tab=tareas&tarea=:id'
}

/**
 * El ticket visto por el cliente.
 *
 * `editar` apunta a la misma ficha del contacto aunque el portal no la escriba nunca: la clave tiene
 * que existir en las dos fuentes (ver `pruebas/ticket-vista.test.js`), y lo que apaga la escritura
 * son las capacidades vacias, no una ruta que falte.
 */
export const TICKET_DEL_PORTAL: FuenteDeTicket = {
  sujeto: 'portal',
  ticket: 'portal/tickets/:id',
  respuestas: null,
  responder: 'portal/tickets/:id/respuestas',
  editar: 'portal/tickets/:id',
  lookups: 'portal/lookups',
  paginaProyecto: '/portal/proyectos/:id',
  paginaTarea: '/portal/proyectos/:proyecto?tab=tareas&tarea=:id'
}

/** Un mensaje del hilo, incluido el que abrio el ticket. */
export interface MensajeDeTicket {
  /** Clave estable para React: el mensaje de apertura no tiene id de respuesta. */
  clave: string
  autor: string
  /** De que lado vino. El dibujo lo usa para alinear y teñir, no para decidir nada. */
  lado: 'equipo' | 'cliente'
  fecha: string | null
  texto: string
}

/** La Tarea que atiende el ticket, reducida a lo que el modal muestra. */
export interface TareaDelTicket {
  /** `null` cuando el cliente solo ve el avance de una tarea interna, sin nombre ni enlace. */
  id: number | null
  nombre: string | null
  /** Porcentaje de avance, cuando el sujeto lo recibe. El panel no lo recibe. */
  progreso: number | null
}

/** Si se puede responder y, si no, por que. */
export interface ReglaDeRespuesta {
  permitida: boolean
  motivo: MotivoSinRespuesta | null
}

/** La forma unica que dibuja el modal. */
export interface TicketVista {
  id: number
  asunto: string
  estado: number
  prioridad: number
  proyectoId: number | null
  abierto: string | null
  ultimaRespuesta: string | null
  /** Quien lo abrio. `null` en el portal: es el propio contacto. */
  solicitante: string | null
  tarea: TareaDelTicket | null
  hilo: MensajeDeTicket[]
  respuesta: ReglaDeRespuesta
}

/**
 * Nombre de quien abrio el ticket, en el orden en que lo resuelve la API.
 *
 * @param detalle la ficha del panel
 * @returns el nombre del contacto, el del remitente del correo o su direccion; `null` si no hay nada
 */
function nombreDelSolicitante (detalle: TicketDetalle): string | null {
  const { solicitante } = detalle

  return solicitante.contact?.full_name ?? solicitante.name ?? solicitante.email ?? null
}

/**
 * Nombre visible del autor de una respuesta del panel.
 *
 * @param respuesta una fila de `GET /tickets/{id}/respuestas`
 * @returns el nombre, o un generico que diga de que lado vino
 */
function autorDeRespuesta (respuesta: RespuestaTicket): string {
  const nombre = respuesta.autor.full_name ?? respuesta.autor.email

  if (nombre !== null && nombre.trim() !== '') return nombre

  return respuesta.autor.tipo === 'staff' ? 'Equipo' : 'Cliente'
}

/**
 * Traduce la ficha y el hilo del panel a la forma del modal.
 *
 * El equipo responde siempre, tambien a un ticket cerrado: la regla T2 es del cliente, y el panel
 * viejo nunca le impidio al staff contestar. Por eso `respuesta` sale permitida sin mirar el estado.
 *
 * @param detalle `GET /tickets/{id}`
 * @param respuestas `GET /tickets/{id}/respuestas`, en el orden en que llegan
 * @returns el ticket listo para dibujar
 */
export function ticketDelPanel (detalle: TicketDetalle, respuestas: RespuestaTicket[]): TicketVista {
  const solicitante = nombreDelSolicitante(detalle)
  const apertura: MensajeDeTicket = {
    clave: 'apertura',
    autor: solicitante ?? 'Cliente',
    lado: 'cliente',
    fecha: detalle.date,
    texto: detalle.message ?? ''
  }

  return {
    id: detalle.id,
    asunto: detalle.subject,
    estado: detalle.status,
    prioridad: detalle.priority,
    proyectoId: detalle.project_id ?? null,
    abierto: detalle.date,
    ultimaRespuesta: detalle.lastreply,
    solicitante,
    tarea: detalle.task === null ? null : { id: detalle.task.id, nombre: detalle.task.name, progreso: null },
    hilo: [
      apertura,
      ...respuestas.map((respuesta): MensajeDeTicket => ({
        clave: `r${respuesta.id}`,
        autor: autorDeRespuesta(respuesta),
        lado: respuesta.autor.tipo === 'staff' ? 'equipo' : 'cliente',
        fecha: respuesta.date,
        texto: respuesta.message ?? ''
      }))
    ],
    respuesta: { permitida: true, motivo: null }
  }
}

/**
 * Traduce la ficha del contacto a la forma del modal.
 *
 * La regla de respuesta **no se recalcula aca**: la decide la API (T2) y la manda en
 * `puede_responder`. Recalcularla con el estado y el hilo seria tener dos reglas, y el dia que la
 * del backend cambie, la pantalla mostraria una caja que la API rechaza con 409. Solo cuando la API
 * todavia no manda los campos —un backend anterior a T2— se cae al calculo local, que es la misma
 * regla escrita en {@link reglaDeRespuestaLocal}.
 *
 * @param detalle `GET /portal/tickets/{id}`
 * @returns el ticket listo para dibujar
 */
export function ticketDelPortal (detalle: TicketPortalDetalle): TicketVista {
  const tarea = detalle.task

  return {
    id: detalle.id,
    asunto: detalle.subject,
    estado: detalle.status,
    prioridad: detalle.priority,
    proyectoId: detalle.project_id,
    abierto: detalle.date,
    ultimaRespuesta: detalle.last_reply,
    solicitante: null,
    tarea: tarea === null
      ? null
      : 'id' in tarea
        ? { id: tarea.id, nombre: tarea.name, progreso: tarea.progress }
        : { id: null, nombre: null, progreso: tarea.progress },
    hilo: [
      { clave: 'apertura', autor: 'Tú', lado: 'cliente', fecha: detalle.date, texto: detalle.message },
      ...detalle.replies.map((respuesta): MensajeDeTicket => ({
        clave: `r${respuesta.id}`,
        autor: respuesta.from === 'cliente' ? 'Tú' : respuesta.name,
        lado: respuesta.from,
        fecha: respuesta.date,
        texto: respuesta.message
      }))
    ],
    respuesta: reglaDelPortal(detalle)
  }
}

/**
 * La vista del ticket a partir de lo que devolvio la API de cada sujeto.
 *
 * Es el unico lugar que lee `fuente.sujeto`: la ficha del panel y la del contacto son dos contratos,
 * y alguien tiene que saber cual llego. Que sea esta funcion pura, y no el modal, es lo que deja
 * probar la traduccion sin montar nada.
 *
 * @param fuente de donde vino la ficha
 * @param ficha el `data` de la ficha
 * @param respuestas el `data` del hilo; en el portal no se pide y llega vacio
 * @returns el ticket listo para dibujar
 */
export function vistaDelTicket (
  fuente: FuenteDeTicket,
  ficha: TicketDetalle | TicketPortalDetalle,
  respuestas: RespuestaTicket[]
): TicketVista {
  if (fuente.sujeto === 'portal') return ticketDelPortal(ficha as TicketPortalDetalle)

  return ticketDelPanel(ficha as TicketDetalle, respuestas)
}

/**
 * La regla de respuesta que manda la API, o la local si no la manda.
 *
 * @param detalle la ficha del contacto
 * @returns si puede responder y por que no
 */
function reglaDelPortal (detalle: TicketPortalDetalle): ReglaDeRespuesta {
  if (typeof detalle.puede_responder === 'boolean') {
    return {
      permitida: detalle.puede_responder,
      motivo: detalle.puede_responder ? null : (detalle.motivo_sin_respuesta ?? null)
    }
  }

  return reglaDeRespuestaLocal(detalle.status, detalle.replies.some((r) => r.from === 'equipo'))
}

/**
 * La regla T2, escrita del lado del frontend solo como respaldo.
 *
 * Cerrado manda sobre «sin respuesta del equipo»: un ticket cerrado sin ninguna respuesta no va a
 * recibir una, y decirle al cliente que espere seria mentirle.
 *
 * @param estado id de estado del ticket
 * @param equipoRespondio si hay al menos una respuesta del equipo en el hilo
 * @returns si puede responder y por que no
 */
export function reglaDeRespuestaLocal (estado: number, equipoRespondio: boolean): ReglaDeRespuesta {
  if (estado === ESTADO_TICKET_CERRADO) return { permitida: false, motivo: 'cerrado' }
  if (!equipoRespondio) return { permitida: false, motivo: 'esperando_equipo' }

  return { permitida: true, motivo: null }
}

/**
 * El aviso que reemplaza a la caja de respuesta.
 *
 * @param motivo lo que dijo la API; `null` cuando no dio motivo
 * @returns el texto para la persona
 */
export function avisoSinRespuesta (motivo: MotivoSinRespuesta | null): string {
  if (motivo === 'cerrado') return 'Este ticket está cerrado.'
  if (motivo === 'esperando_equipo') {
    return 'El equipo aún no responde tu solicitud; podrás responder cuando lo haga.'
  }

  return 'Por ahora no se puede responder este ticket.'
}

/**
 * Resuelve una plantilla con `:id` y, si la trae, `:proyecto`.
 *
 * @param plantilla ruta o enlace con marcadores
 * @param id el id que va en `:id`
 * @param proyectoId el id que va en `:proyecto`, si la plantilla lo pide
 * @returns la ruta resuelta, con los ids codificados
 */
export function rutaDeTicket (plantilla: string, id: number, proyectoId?: number): string {
  const conProyecto = proyectoId === undefined
    ? plantilla
    : plantilla.replace(':proyecto', encodeURIComponent(String(proyectoId)))

  return conProyecto.replace(':id', encodeURIComponent(String(id)))
}

/**
 * Enlace del equipo a un ticket abierto dentro de su Proyecto.
 *
 * Es el mismo que arman el correo y la campana (contrato T3), y por eso vive aca y no en el modal:
 * si cambia, cambia en un solo lugar y la prueba lo nota.
 *
 * @param ticketId id del ticket
 * @param proyectoId id del Proyecto
 * @returns la URL absoluta del panel
 */
export function enlaceDelEquipoAlTicket (ticketId: number, proyectoId: number): string {
  return `/proyectos/${encodeURIComponent(String(proyectoId))}?tab=${PESTANA_TICKETS}&${PARAMETRO_TICKET}=${encodeURIComponent(String(ticketId))}`
}

/**
 * Cuerpo de una respuesta, con el cambio de estado solo si se eligio uno.
 *
 * La API conserva el estado cuando `status` no viaja; mandar el actual «por las dudas» dejaria una
 * entrada de actividad por un cambio que nadie hizo.
 *
 * @param mensaje lo escrito
 * @param estado el estado elegido, o `null` para no tocarlo
 * @returns el cuerpo de `POST .../respuestas`, o `null` si el mensaje esta vacio
 */
export function cuerpoDeRespuesta (
  mensaje: string,
  estado: number | null
): { message: string, status?: number } | null {
  const texto = mensaje.trim()

  if (texto === '') return null

  return estado === null ? { message: texto } : { message: texto, status: estado }
}
