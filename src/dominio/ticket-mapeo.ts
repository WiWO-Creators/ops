import type { AdjuntoTicket, EstadoLookup, Referencia, RespuestaTicket, SolicitanteTicket, TicketDetalle } from '../datos/recursos.ts'
import type { RespuestaTicketPortal, TicketPortalDetalle } from '../datos/portal.ts'
import { ESTADO_TICKET_ABIERTO, ESTADO_TICKET_CERRADO, ESTADO_TICKET_RESPONDIDO } from './ticket-estados.ts'
import type { FuenteDeTicket, MotivoSinRespuesta } from './ticket-fuente.ts'

/**
 * La traduccion de las dos formas de la API (ficha del panel y ficha del contacto) a la vista unica
 * del ticket, mas las reglas puras que dibujan el modal: texto de mensajes, adjuntos, hilo, estados
 * y Proyectos elegibles.
 *
 * El equipo y el cliente miran el mismo ticket con dos contratos distintos; se traducen aca, una
 * vez, y el modal dibuja esa forma sin saber de quien es.
 */

/** Un mensaje del hilo, incluido el que abrio el ticket. */
export interface MensajeDeTicket {
  /** Clave estable para React: el mensaje de apertura no tiene id de respuesta. */
  clave: string
  autor: string
  /**
   * Id de staff del autor, para enlazarlo con `EnlacePersona`. `undefined` cuando el autor no es del
   * equipo (`lado === 'cliente'`) o cuando la API no lo trajo.
   */
  autorStaffId?: number
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
  /** El cliente del ticket, para ofrecer solo sus Proyectos. `null` sin cliente o donde no se sabe (portal). */
  clienteId: number | null
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
 * Es la regla comun de la ficha y de los listados: el listado agrega por su cuenta la empresa y un
 * texto de respaldo (`nombreDelSolicitante`, en `definiciones/tickets.ts`); la ficha prefiere no
 * inventar un nombre y deja `null`.
 *
 * @param solicitante el solicitante de la ficha o de la fila del listado
 * @returns el nombre del contacto, el del remitente del correo o su direccion; `null` si no hay nada
 */
export function nombreDelRemitente (solicitante: Pick<SolicitanteTicket, 'contact' | 'name' | 'email'>): string | null {
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
  const solicitante = nombreDelRemitente(detalle.solicitante)
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
    clienteId: detalle.solicitante.client?.id ?? null,
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
    autorStaffId: respuesta.autor.tipo === 'staff' ? (respuesta.autor.id ?? undefined) : undefined,
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
    clienteId: null,
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

/** Un Proyecto a mano del modal; `clienteId` permite ofrecer solo los del cliente del ticket. */
export interface ProyectoElegible extends Referencia {
  /** El cliente del Proyecto. Ausente donde la lista no lo trae: ahi no se descarta por cliente. */
  clienteId?: number | null
}

/**
 * Los Proyectos a los que se puede mover un ticket: los de su cliente.
 *
 * `PATCH /tickets/{id}` rechaza con 422 `otro_cliente` un Proyecto de otro cliente, asi que ofrecerlo
 * es ofrecer un error. Se filtra aca para que no aparezca; la API sigue siendo quien decide, por eso
 * un ticket sin cliente conocido (`ticket_sin_cliente`) o un Proyecto sin cliente en la lista no se
 * descartan: la persona recibe la explicacion del 422 en vez de una lista vacia que no dice por que.
 *
 * @param proyectos los Proyectos que quien mira tiene a mano
 * @param ticket el ticket que se quiere mover
 * @returns los Proyectos elegibles, sin repetir el actual, en el orden recibido
 */
export function proyectosElegibles (
  proyectos: ProyectoElegible[],
  ticket: Pick<TicketVista, 'proyectoId' | 'clienteId'>
): ProyectoElegible[] {
  return proyectos.filter((proyecto) => (
    proyecto.id !== ticket.proyectoId &&
    (ticket.clienteId === null || proyecto.clienteId === undefined || proyecto.clienteId === ticket.clienteId)
  ))
}

/**
 * Los Proyectos cuyo nombre contiene lo buscado, sin distinguir mayusculas ni tildes.
 *
 * @param proyectos la lista a recorrer
 * @param busqueda lo tipeado; vacio devuelve la lista entera
 * @returns los que coinciden, en el orden recibido
 */
export function buscarProyectos (proyectos: ProyectoElegible[], busqueda: string): ProyectoElegible[] {
  const quitarTildes = (texto: string): string => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const buscado = quitarTildes(busqueda.trim())

  return buscado === '' ? proyectos : proyectos.filter((p) => quitarTildes(p.name).includes(buscado))
}
