import { PARAMETRO_TICKET } from './ticket-estados.ts'

/**
 * La fuente de un ticket: de donde bajan sus datos, a donde apuntan sus enlaces y como se nombra
 * ante quien lo mira.
 *
 * Mismo criterio que `dominio/fuente-proyecto.ts`: lo que cambia entre sujetos son **rutas** (la
 * fuente, todo texto) y **capacidades** (otra prop). Nada de funciones en la fuente: la arma un
 * Server Component en el portal y cruza al cliente.
 */

/** Clave de la pestaña Tickets en la ficha del Proyecto del equipo (`?tab=tickets`). */
export const PESTANA_TICKETS = 'tickets'

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
   * Adjuntos del mensaje de apertura. Plantilla con `:id`. `null` en el portal: la ficha del contacto
   * ya trae `attachments` (y los de cada respuesta), asi que no hace falta un viaje aparte. La API
   * tambien responde `GET /portal/tickets/:id/archivos`, pero el modal no lo pide.
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
  /**
   * Como se le dice al ticket en pantalla: «ticket», tanto para el equipo como para el cliente. Es una
   * clave de {@link NOMBRES_DE_TICKET} y no el objeto, para que la fuente siga siendo solo texto.
   */
  nombre: ClaveDeNombreDeTicket
}

/** Las palabras con las que se nombra un ticket, ya concordadas en genero. */
export interface NombreDeTicket {
  /** Con mayuscula, para titulos: «Ticket». */
  titulo: string
  /** Con articulo: «el ticket». */
  el: string
  /** Con demostrativo: «este ticket». */
  este: string
}

/** Las formas de nombrar un ticket que usa el producto. */
export const NOMBRES_DE_TICKET = {
  ticket: { titulo: 'Ticket', el: 'el ticket', este: 'este ticket' }
} as const satisfies Record<string, NombreDeTicket>

export type ClaveDeNombreDeTicket = keyof typeof NOMBRES_DE_TICKET

/**
 * Las palabras con las que la fuente nombra al ticket.
 *
 * @param fuente la fuente del modal
 * @returns titulo, forma con articulo y forma con demostrativo
 */
export function nombreDelTicket (fuente: Pick<FuenteDeTicket, 'nombre'>): NombreDeTicket {
  return NOMBRES_DE_TICKET[fuente.nombre]
}

/** Primera letra en mayuscula, para abrir una oracion con «este ticket». */
function conMayuscula (texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
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
  catalogoSinNombre: 'numero',
  nombre: 'ticket'
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
  catalogoSinNombre: 'ocultar',
  nombre: 'ticket'
}

/**
 * El aviso que reemplaza a la caja de respuesta.
 *
 * @param motivo lo que dijo la API; `null` cuando no dio motivo
 * @param nombre como se nombra el ticket ante quien mira; por defecto, «ticket»
 * @returns el texto para la persona
 */
export function avisoSinRespuesta (motivo: MotivoSinRespuesta | null, nombre: NombreDeTicket = NOMBRES_DE_TICKET.ticket): string {
  if (motivo === 'cerrado') return `${conMayuscula(nombre.este)} ya se cerró.`
  if (motivo === 'esperando_equipo') {
    return 'El equipo aún no responde tu ticket; podrás responder cuando lo haga.'
  }

  return `Por ahora no se puede responder ${nombre.este}.`
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
 * Nombre accesible del modal: «Ticket #12 · No carga el logo», igual en el panel y en el portal.
 *
 * @param id el ticket
 * @param asunto el asunto, o `null` mientras carga
 * @param nombre como se nombra el ticket ante quien mira; por defecto, «ticket»
 * @returns el titulo del dialogo
 */
export function tituloDelModal (id: number, asunto: string | null, nombre: NombreDeTicket = NOMBRES_DE_TICKET.ticket): string {
  const base = `${nombre.titulo} #${id}`
  const recortado = asunto?.trim() ?? ''

  return recortado === '' ? base : `${base} · ${recortado}`
}
