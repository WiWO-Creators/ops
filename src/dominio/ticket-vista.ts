import type { AdjuntoTicket, EstadoLookup, RespuestaTicket, TicketDetalle } from '../datos/recursos.ts'
import type { RespuestaTicketPortal, TicketPortalDetalle } from '../datos/portal.ts'

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

/** Estado «Abierto» de Perfex (id 1): el de un ticket que el equipo todavia no contesto. */
export const ESTADO_TICKET_ABIERTO = 1

/** Estado «Respondido» de Perfex (id 3): a donde pasa un ticket abierto cuando el equipo contesta (G). */
export const ESTADO_TICKET_RESPONDIDO = 3

/**
 * Evento de ventana que avisa que un ticket cambio (respuesta, estado, asignado, cierre, lectura).
 *
 * Lo emite el modal y lo escuchan las listas y bandejas para ponerse al dia sin esperar su propio
 * refresco. Lleva `{ id }` en `detail`. El nombre es parte del contrato entre frentes: no cambiarlo.
 */
export const EVENTO_TICKETS_CAMBIADOS = 'ops:tickets-cambiados'

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
  /**
   * Adjuntos del mensaje de apertura. Plantilla con `:id`. `null` en el portal: sus adjuntos quedan
   * fuera de esta ronda y el contrato no los publica.
   */
  archivos: string | null
  /** Respuestas predefinidas para insertar. `null` donde no se ofrecen (el portal). */
  predefinidas: string | null
  /** Cierre por el propio solicitante (`POST`). Plantilla con `:id`; `null` donde no existe. */
  cerrar: string | null
  /** Reapertura por el solicitante (`POST`). Plantilla con `:id`; `null` donde no existe. */
  reabrir: string | null
  /** Marca de lectura (`POST`, 204). Plantilla con `:id`; `null` donde leer no escribe. */
  leido: string | null
  /**
   * Que hacer con un estado o una prioridad que el catalogo no nombra.
   *
   * `numero` dice «Estado #7»: al equipo le sirve para saber que el catalogo tiene un hueco. `ocultar`
   * no dibuja nada: al cliente un «#7» no le dice nada y parece un error nuestro.
   */
  catalogoSinNombre: 'ocultar' | 'numero'
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
  paginaTarea: '/proyectos/:proyecto?tab=tareas&tarea=:id',
  archivos: 'tickets/:id/archivos',
  predefinidas: 'tickets/respuestas-predefinidas',
  cerrar: null,
  reabrir: null,
  leido: null,
  catalogoSinNombre: 'numero'
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
  paginaTarea: '/portal/proyectos/:proyecto?tab=tareas&tarea=:id',
  archivos: null,
  predefinidas: null,
  cerrar: 'portal/tickets/:id/cerrar',
  reabrir: 'portal/tickets/:id/reabrir',
  leido: 'portal/tickets/:id/leido',
  catalogoSinNombre: 'ocultar'
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
  /** Adjuntos del mensaje, solo lectura. Vacio donde el sujeto no los recibe. */
  adjuntos: AdjuntoVista[]
}

/** Un adjunto listo para enlazar. `ruta` es `null` si la API mando una ruta que no se reconoce. */
export interface AdjuntoVista {
  id: number
  nombre: string
  ruta: string | null
}

/** Una persona del equipo, reducida a lo que el modal nombra. */
export interface PersonaDelTicket {
  id: number
  nombre: string
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
  /**
   * A quien del equipo esta asignado. `null` donde el sujeto no sabe de asignaciones (el portal):
   * es distinto de `{ asignado: null }`, que es «sin asignar».
   */
  asignacion: { asignado: PersonaDelTicket | null } | null
  /** Lo que el solicitante puede hacer con su solicitud (contrato v2, E). El equipo usa el estado. */
  acciones: { cerrar: boolean, reabrir: boolean }
  /** Hay un mensaje del equipo que el cliente no leyo. Siempre `false` en el panel. */
  noLeido: boolean
  /** El id que se pidio, cuando la API devolvio el ticket principal de una fusion (D). */
  fusionadoDesde: number | null
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
 * @param archivos `GET /tickets/{id}/archivos`: los adjuntos del mensaje de apertura
 * @returns el ticket listo para dibujar
 */
export function ticketDelPanel (
  detalle: TicketDetalle,
  respuestas: RespuestaTicket[],
  archivos: AdjuntoTicket[] = []
): TicketVista {
  const solicitante = nombreDelSolicitante(detalle)
  const apertura: MensajeDeTicket = {
    clave: 'apertura',
    autor: solicitante ?? 'Cliente',
    lado: 'cliente',
    fecha: detalle.date,
    texto: textoDe(detalle.message, detalle.message_texto),
    adjuntos: archivos.map(adjuntoVista)
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
    hilo: [apertura, ...respuestas.map(mensajeDelPanel)],
    respuesta: { permitida: true, motivo: null },
    asignacion: {
      asignado: detalle.assigned === null ? null : { id: detalle.assigned.id, nombre: detalle.assigned.full_name }
    },
    acciones: { cerrar: false, reabrir: false },
    noLeido: false,
    fusionadoDesde: null
  }
}

/**
 * Una respuesta del panel como mensaje del hilo.
 *
 * @param respuesta una fila de `GET /tickets/{id}/respuestas` o la que devuelve el `POST`
 * @returns el mensaje listo para dibujar
 */
function mensajeDelPanel (respuesta: RespuestaTicket): MensajeDeTicket {
  return {
    clave: `r${respuesta.id}`,
    autor: autorDeRespuesta(respuesta),
    lado: respuesta.autor.tipo === 'staff' ? 'equipo' : 'cliente',
    fecha: respuesta.date,
    texto: textoDe(respuesta.message, respuesta.message_texto),
    adjuntos: (respuesta.attachments ?? []).map(adjuntoVista)
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
      {
        clave: 'apertura',
        autor: detalle.mio === true ? 'Tú' : (nombreVisible(detalle.solicitante?.nombre) ?? 'Cliente'),
        lado: 'cliente',
        fecha: detalle.date,
        texto: textoDe(detalle.message, detalle.message_texto),
        adjuntos: []
      },
      ...detalle.replies.map(mensajeDelPortal)
    ],
    respuesta: reglaDelPortal(detalle),
    asignacion: null,
    acciones: { cerrar: detalle.puede_cerrar === true, reabrir: detalle.puede_reabrir === true },
    noLeido: detalle.no_leido === true,
    fusionadoDesde: typeof detalle.fusionado_desde === 'number' ? detalle.fusionado_desde : null
  }
}

/**
 * Una respuesta del portal como mensaje del hilo.
 *
 * «Tú» sale **solo** de `autor.mio` (contrato v2, B): en un cliente con varios contactos,
 * `from: 'cliente'` tambien es el colega que escribio, y llamarlo «Tú» le atribuye a quien mira un
 * mensaje ajeno. Sin `autor` —un backend anterior— se usa el nombre que mando la API.
 *
 * @param respuesta una fila de `replies`
 * @returns el mensaje listo para dibujar
 */
function mensajeDelPortal (respuesta: RespuestaTicketPortal): MensajeDeTicket {
  const autor = respuesta.autor
  const nombre = autor?.mio === true
    ? 'Tú'
    : (nombreVisible(autor?.nombre) ?? nombreVisible(respuesta.name) ?? (respuesta.from === 'equipo' ? 'Equipo' : 'Cliente'))

  return {
    clave: `r${respuesta.id}`,
    autor: nombre,
    lado: autor?.tipo ?? respuesta.from,
    fecha: respuesta.date,
    texto: textoDe(respuesta.message, respuesta.message_texto),
    adjuntos: []
  }
}

/** El nombre recortado, o `null` si no hay nada que mostrar. */
function nombreVisible (nombre: string | null | undefined): string | null {
  if (typeof nombre !== 'string') return null

  const recortado = nombre.trim()

  return recortado === '' ? null : recortado
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
 * @param archivos adjuntos del mensaje de apertura; vacio donde no se piden
 * @returns el ticket listo para dibujar
 */
export function vistaDelTicket (
  fuente: FuenteDeTicket,
  ficha: TicketDetalle | TicketPortalDetalle,
  respuestas: RespuestaTicket[],
  archivos: AdjuntoTicket[] = []
): TicketVista {
  if (fuente.sujeto === 'portal') return ticketDelPortal(ficha as TicketPortalDetalle)

  return ticketDelPanel(ficha as TicketDetalle, respuestas, archivos)
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

/**
 * Entidades con nombre que se decodifican a mano.
 *
 * `html_entity_decode` de PHP conoce todas las de HTML5; aca van las que un editor de texto rico o
 * Perfex producen en castellano. Una entidad fuera de la lista queda escrita tal cual: se lee rara,
 * pero no se pierde texto. Las numericas (`&#233;`, `&#xE9;`) se decodifican todas.
 */
const ENTIDADES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', iexcl: '¡', iquest: '¿',
  laquo: '«', raquo: '»', hellip: '…', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·',
  euro: '€', copy: '©', reg: '®', trade: '™', deg: '°', ordm: 'º', ordf: 'ª'
}

/**
 * Pasa el HTML de un mensaje de Perfex a texto, con la regla de la seccion A del contrato v2.
 *
 * Es el respaldo de `message_texto`: la API ya manda el texto limpio, y esto solo corre si no lo
 * manda (un backend anterior). Por eso es **la misma regla** y no una mejor: dos conversiones
 * distintas harian que el mismo mensaje se lea distinto segun que backend conteste.
 *
 * Orden: saltos de bloque (`<br>`, `</p>`, `</div>`, `</li>`) a `\n`, fuera etiquetas, entidades
 * decodificadas **despues** de quitar etiquetas (un `&lt;b&gt;` escrito por el cliente queda como
 * texto `<b>` y no desaparece), recorte, y tres o mas saltos seguidos a dos.
 *
 * Primero `\r\n` se normaliza a `\n`, y el salto crudo que venga justo despues de un `<br>`,
 * `</p>`, `</div>` o `</li>` se absorbe (asi lo hace `TextoDeTicket::plano`): `nl2br` **conserva** el
 * salto original (`uno<br />\r\ndos`), y sin absorberlo cada renglon de una respuesta del equipo
 * saldria con una linea en blanco de mas.
 *
 * @param html el `message` tal como lo guarda Perfex; `null` o vacio es texto vacio
 * @returns el texto plano, listo para `white-space: pre-line`
 */
export function textoDeMensaje (html: string | null | undefined): string {
  if (typeof html !== 'string' || html === '') return ''

  const sinEtiquetas = html
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>\n?/gi, '\n')
    .replace(/<\/(p|div|li)\s*>\n?/gi, '\n')
    .replace(/<[^>]*>/g, '')

  return decodificarEntidades(sinEtiquetas)
    .trim()
    .replace(/\n{3,}/g, '\n\n')
}

/**
 * Decodifica entidades numericas y las con nombre de {@link ENTIDADES}.
 *
 * @param texto texto ya sin etiquetas
 * @returns el texto con las entidades resueltas
 */
function decodificarEntidades (texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entera: string, cuerpo: string) => {
    if (cuerpo.startsWith('#')) {
      const hexadecimal = cuerpo[1] === 'x' || cuerpo[1] === 'X'
      const codigo = Number.parseInt(cuerpo.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10)

      return Number.isInteger(codigo) && codigo > 0 && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : entera
    }

    return ENTIDADES[cuerpo] ?? entera
  })
}

/**
 * El texto de un mensaje: el que manda la API o, si no lo manda, la conversion local.
 *
 * @param message el HTML de Perfex
 * @param messageTexto el `message_texto` de la API, si vino
 * @returns el texto a mostrar
 */
export function textoDe (message: string | null | undefined, messageTexto: string | undefined): string {
  return typeof messageTexto === 'string' ? messageTexto : textoDeMensaje(message)
}

/**
 * Ruta del BFF para bajar un adjunto de ticket.
 *
 * Solo se acepta la forma que publica la API (`files/ticket/{id}/download` y parecidas bajo
 * `files/`): el dato viene de la red, y un `download_path` con `..` o con un esquema no puede
 * convertir un enlace de descarga en un salto a otra parte.
 *
 * @param rutaDeApi el `download_path` del adjunto
 * @returns `/api/bff/...` o `null` si la ruta no tiene la forma esperada
 */
export function rutaDeAdjunto (rutaDeApi: string | null | undefined): string | null {
  if (typeof rutaDeApi !== 'string') return null

  const limpia = rutaDeApi.replace(/^\/+/, '')

  if (!/^files\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/.test(limpia)) return null

  return `/api/bff/${limpia}`
}

/** Un adjunto de la API como lo enlaza el hilo. */
function adjuntoVista (adjunto: AdjuntoTicket): AdjuntoVista {
  const nombre = typeof adjunto.file_name === 'string' && adjunto.file_name.trim() !== ''
    ? adjunto.file_name.trim()
    : `Adjunto ${adjunto.id}`

  return { id: adjunto.id, nombre, ruta: rutaDeAdjunto(adjunto.download_path) }
}

/**
 * Suma al hilo la respuesta que acaba de confirmar la API.
 *
 * Es lo que permite mostrar la respuesta enviada aunque la recarga de la ficha falle: la API ya la
 * devolvio, y no tiene sentido que desaparezca solo porque el segundo viaje se cayo. Si ya estaba
 * (la recarga llego primero), no se duplica.
 *
 * @param vista el ticket que se esta mostrando
 * @param respuesta la fila que devolvio `POST /tickets/{id}/respuestas`
 * @returns el ticket con la respuesta al final del hilo
 */
export function agregarRespuestaAlHilo (vista: TicketVista, respuesta: RespuestaTicket): TicketVista {
  const mensaje = mensajeDelPanel(respuesta)

  if (vista.hilo.some((m) => m.clave === mensaje.clave)) return vista

  return { ...vista, hilo: [...vista.hilo, mensaje], ultimaRespuesta: respuesta.date ?? vista.ultimaRespuesta }
}

/**
 * Lo que devolvio un `POST` de respuesta, aplicado a la vista.
 *
 * Los dos sujetos contestan distinto: el portal devuelve la ficha entera y el panel la respuesta
 * creada. Se reconoce por la forma y no por el sujeto; algo que no es ninguna de las dos (un `null`
 * de un backend viejo) deja la vista como estaba y la recarga pone el resto.
 *
 * @param fuente de donde vino
 * @param vista el ticket que se esta mostrando
 * @param datos el `data` del `POST`
 * @returns la vista al dia con lo confirmado
 */
export function vistaTrasResponder (fuente: FuenteDeTicket, vista: TicketVista, datos: unknown): TicketVista {
  if (datos === null || typeof datos !== 'object') return vista

  if ('replies' in datos && Array.isArray(datos.replies)) {
    return vistaDelTicket(fuente, datos as TicketPortalDetalle, [])
  }

  if ('id' in datos && typeof datos.id === 'number' && 'autor' in datos && datos.autor !== null && typeof datos.autor === 'object') {
    return agregarRespuestaAlHilo(vista, datos as RespuestaTicket)
  }

  return vista
}

/**
 * Los estados que se ofrecen al responder: todos menos el que ya tiene.
 *
 * «Dejar en Abierto» sobre un ticket abierto no cambia nada y hace pensar que si.
 *
 * @param estados el catalogo
 * @param actual el estado del ticket
 * @returns el catalogo sin el estado actual
 */
export function estadosParaResponder (estados: EstadoLookup[], actual: number): EstadoLookup[] {
  return estados.filter((estado) => estado.id !== actual)
}

/**
 * Con que estado nace elegido el selector al responder.
 *
 * Un ticket Abierto que el equipo contesta pasa a Respondido: es lo que hace la API cuando `status`
 * no viaja (contrato v2, G), y el selector lo muestra en vez de esconderlo, para que quien responde
 * vea a donde va el ticket y pueda elegir otro. En cualquier otro estado no se propone cambio.
 *
 * @param actual el estado del ticket
 * @param estados el catalogo que se ofrece
 * @returns el id del estado propuesto, o `null` para no cambiarlo
 */
export function estadoInicialAlResponder (actual: number, estados: EstadoLookup[]): number | null {
  if (actual !== ESTADO_TICKET_ABIERTO) return null

  return estados.some((estado) => estado.id === ESTADO_TICKET_RESPONDIDO) ? ESTADO_TICKET_RESPONDIDO : null
}

/**
 * Nombre visible de un estado o una prioridad.
 *
 * @param catalogo el catalogo
 * @param id el valor del ticket
 * @param rotulo «Estado», «Prioridad»
 * @param modo lo que dice la fuente para un valor sin nombre
 * @returns el nombre, «Estado #7», o `null` si no hay que dibujar nada
 */
export function nombreEnCatalogo (
  catalogo: EstadoLookup[],
  id: number,
  rotulo: string,
  modo: FuenteDeTicket['catalogoSinNombre']
): string | null {
  const nombre = catalogo.find((item) => item.id === id)?.name

  if (typeof nombre === 'string' && nombre.trim() !== '') return nombre

  return modo === 'ocultar' ? null : `${rotulo} #${id}`
}

/**
 * Nombre accesible del modal: «Ticket #12 · No carga el logo».
 *
 * @param id el ticket
 * @param asunto el asunto, o `null` mientras carga
 * @returns el titulo del dialogo
 */
export function tituloDelModal (id: number, asunto: string | null): string {
  const base = `Ticket #${id}`
  const recortado = asunto?.trim() ?? ''

  return recortado === '' ? base : `${base} · ${recortado}`
}

/** Que se estaba haciendo cuando la API dijo que no. Cambia como se explica el mismo codigo. */
export type AccionDeTicket = 'responder' | 'crear' | 'cerrar' | 'reabrir' | 'editar'

/** Un rechazo de la API, con lo que `escribirEnBff` deja ver de el. */
export interface RechazoDeTicket {
  mensaje: string
  estado?: number
  codigo?: string
  detalles?: Record<string, unknown>
  reintentarEnSegundos?: number | null
}

/**
 * Motivos de un 422 de `PATCH /tickets/{id}` y del vinculo con una Tarea que merecen una frase
 * propia: el generico diria «Proyecto otro cliente», que no explica que hacer.
 */
const MOTIVOS_DE_EDICION: Record<string, string> = {
  otro_cliente: 'Lo elegido es de otro cliente que el del ticket.',
  otro_espacio: 'La Tarea es de otro Proyecto que el del ticket.',
  no_visible: 'No tienes acceso a lo que elegiste.',
  ticket_sin_cliente: 'El ticket no tiene cliente: asígnale uno antes.'
}

/**
 * La primera frase propia que corresponda a los `details` de un 422, si hay alguna.
 *
 * @param detalles `{ campo: [motivo, ...] }`
 * @returns la frase, o `null` para usar el mensaje de la API
 */
function motivoDeEdicion (detalles: Record<string, unknown> | undefined): string | null {
  for (const motivos of Object.values(detalles ?? {})) {
    if (!Array.isArray(motivos)) continue

    for (const motivo of motivos) {
      const frase = typeof motivo === 'string' ? MOTIVOS_DE_EDICION[motivo] : undefined

      if (frase !== undefined) return frase
    }
  }

  return null
}

/** El rechazo explicado para la persona, y cuanto esperar si es un tope. */
export interface FalloDeTicket {
  texto: string
  /** Segundos hasta poder reintentar, en un 429. `null` si no hay que esperar o no se sabe. */
  esperarSegundos: number | null
}

/**
 * Explica un rechazo de la API segun su codigo y lo que se estaba haciendo.
 *
 * Los 409 del contrato son carreras: el ticket cambio mientras la persona miraba. El texto dice que
 * paso y que lo escrito sigue ahi, en vez del mensaje tecnico. El 429 dice cuanto esperar. Todo lo
 * demas usa el mensaje de la API, que ya viene legible.
 *
 * @param rechazo lo que devolvio `escribirEnBff`
 * @param accion lo que se estaba haciendo
 * @returns el texto y, si corresponde, la espera
 */
export function falloDeTicket (rechazo: RechazoDeTicket, accion: AccionDeTicket): FalloDeTicket {
  const sinEspera = (texto: string): FalloDeTicket => ({ texto, esperarSegundos: null })

  switch (rechazo.codigo) {
    case 'ticket_cerrado':
      return sinEspera(accion === 'cerrar'
        ? 'Esta solicitud ya estaba cerrada.'
        : 'El ticket se cerró mientras escribías. Tu mensaje sigue aquí.')
    case 'ticket_sin_respuesta_del_equipo':
      return sinEspera('El equipo aún no responde tu solicitud; podrás responder cuando lo haga. Tu mensaje sigue aquí.')
    case 'ticket_abierto':
      return sinEspera('Esta solicitud ya está abierta.')
    case 'reapertura_vencida':
      return sinEspera('Pasó demasiado tiempo desde el cierre para reabrirla. Si el problema sigue, envía una solicitud nueva.')
    case 'rate_limited':
      return { texto: textoDeTope(accion, rechazo.reintentarEnSegundos ?? null), esperarSegundos: rechazo.reintentarEnSegundos ?? null }
    default:
      return sinEspera((rechazo.estado === 422 ? motivoDeEdicion(rechazo.detalles) : null) ?? rechazo.mensaje)
  }
}

/**
 * El aviso de un 429, con la espera en palabras.
 *
 * @param accion responder o crear, que son los dos topes del portal
 * @param segundos cuanto falta, si la API lo dijo
 * @returns la frase para la persona
 */
function textoDeTope (accion: AccionDeTicket, segundos: number | null): string {
  const que = accion === 'crear' ? 'Enviaste muchas solicitudes seguidas.' : 'Enviaste muchas respuestas seguidas.'

  if (segundos === null || segundos <= 0) return `${que} Espera un rato antes de volver a intentarlo.`

  const minutos = Math.ceil(segundos / 60)

  return `${que} Podrás volver a intentarlo en ${minutos === 1 ? '1 minuto' : `${minutos} minutos`}.`
}

/**
 * Segundos de espera de un 429: de `details.reintentar_en_segundos` o, si no, de `Retry-After`.
 *
 * @param detalles los `details` del error
 * @param cabecera el valor de `Retry-After`, si llego
 * @returns los segundos, o `null` si ninguno dice nada util
 */
export function segundosParaReintentar (detalles: unknown, cabecera: string | null): number | null {
  if (detalles !== null && typeof detalles === 'object' && 'reintentar_en_segundos' in detalles) {
    const valor = Number(detalles.reintentar_en_segundos)

    if (Number.isFinite(valor) && valor > 0) return Math.ceil(valor)
  }

  const deCabecera = Number(cabecera)

  return cabecera !== null && Number.isFinite(deCabecera) && deCabecera > 0 ? Math.ceil(deCabecera) : null
}

/** Lo minimo de `Storage` que usa el borrador: asi se prueba sin navegador. */
export type AlmacenDeBorrador = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/**
 * Clave del borrador de respuesta de un ticket: `ticket-borrador:{sujeto}:{id}`.
 *
 * El sujeto va en la clave porque el mismo navegador puede tener abiertos el panel y el portal, y el
 * borrador del equipo no puede aparecer en la caja del cliente.
 *
 * @param fuente de donde es el ticket
 * @param id el ticket
 * @returns la clave de `sessionStorage`
 */
export function claveDeBorrador (fuente: FuenteDeTicket, id: number): string {
  return `ticket-borrador:${fuente.sujeto}:${id}`
}

/**
 * Lee un borrador guardado.
 *
 * `sessionStorage` lanza en modo privado de algunos navegadores o con la cuota llena: ahi no hay
 * borrador, y la caja arranca vacia como siempre.
 *
 * @param almacen `sessionStorage`, o `null` fuera del navegador
 * @param clave la de {@link claveDeBorrador}
 * @returns lo guardado, o cadena vacia
 */
export function leerBorrador (almacen: AlmacenDeBorrador | null, clave: string): string {
  if (almacen === null) return ''

  try {
    return almacen.getItem(clave) ?? ''
  } catch {
    return ''
  }
}

/**
 * Guarda (o borra, si esta vacio) el borrador.
 *
 * @param almacen `sessionStorage`, o `null` fuera del navegador
 * @param clave la de {@link claveDeBorrador}
 * @param texto lo escrito
 * @returns `true` si quedo guardado; `false` si el almacen no lo acepto (el texto sigue en pantalla)
 */
export function guardarBorrador (almacen: AlmacenDeBorrador | null, clave: string, texto: string): boolean {
  if (almacen === null) return false

  try {
    if (texto.trim() === '') almacen.removeItem(clave)
    else almacen.setItem(clave, texto)

    return true
  } catch {
    return false
  }
}

/**
 * Inserta una respuesta predefinida en lo escrito.
 *
 * Se suma al final, separada por una linea en blanco, y no reemplaza: quien ya escribio un saludo no
 * quiere perderlo por elegir una plantilla.
 *
 * @param actual lo que hay en la caja
 * @param plantilla el `message` de la predefinida (HTML de Perfex)
 * @returns el texto nuevo de la caja
 */
export function insertarPredefinida (actual: string, plantilla: string): string {
  const texto = textoDeMensaje(plantilla)

  if (texto === '') return actual
  if (actual.trim() === '') return texto

  return `${actual.replace(/\s+$/, '')}\n\n${texto}`
}

/**
 * Avisa a la ventana que un ticket cambio. Ver {@link EVENTO_TICKETS_CAMBIADOS}.
 *
 * @param id el ticket
 * @param ventana la ventana; por defecto la global, si existe
 */
export function avisarCambioDeTicket (id: number, ventana: Pick<Window, 'dispatchEvent'> | null = typeof window === 'undefined' ? null : window): void {
  ventana?.dispatchEvent(new CustomEvent(EVENTO_TICKETS_CAMBIADOS, { detail: { id } }))
}
