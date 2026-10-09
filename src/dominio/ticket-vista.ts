/**
 * Barrel de los tickets: reexporta lo que viven en `ticket-fuente` (rutas y nombres), `ticket-mapeo`
 * (la vista unica del ticket), `ticket-fallos`, `ticket-borrador` y `ticket-estados`.
 *
 * Se conserva para que los importadores existentes no cambien; el codigo nuevo puede importar del
 * modulo que corresponda.
 */

export {
  NOMBRES_DE_TICKET,
  PESTANA_TICKETS,
  TICKET_DEL_PANEL,
  TICKET_DEL_PORTAL,
  avisoSinRespuesta,
  enlaceDelEquipoAlTicket,
  nombreDelTicket,
  rutaDeTicket,
  tituloDelModal,
  type ClaveDeNombreDeTicket,
  type FuenteDeTicket,
  type MotivoSinRespuesta,
  type NombreDeTicket
} from './ticket-fuente.ts'

export {
  agregarRespuestaAlHilo,
  buscarProyectos,
  cuerpoDeRespuesta,
  htmlDe,
  estadoInicialAlResponder,
  estadosParaResponder,
  nombreEnCatalogo,
  proyectosElegibles,
  reglaDeRespuestaLocal,
  rutaDeAdjunto,
  textoDe,
  textoDeMensaje,
  ticketDelPanel,
  ticketDelPortal,
  vistaDelTicket,
  vistaTrasResponder,
  type AdjuntoVista,
  type MensajeDeTicket,
  type PersonaDelTicket,
  type ProyectoElegible,
  type ReglaDeRespuesta,
  type TareaDelTicket,
  type TicketVista
} from './ticket-mapeo.ts'

export {
  falloDeTicket,
  segundosParaReintentar,
  type AccionDeTicket,
  type FalloDeTicket,
  type RechazoDeTicket
} from './ticket-fallos.ts'

export {
  almacenDeSesion,
  claveDeBorrador,
  guardarBorrador,
  insertarPredefinida,
  leerBorrador,
  type AlmacenDeBorrador
} from './ticket-borrador.ts'

export {
  ESTADOS_TICKET_ABIERTOS,
  ESTADO_TICKET_ABIERTO,
  ESTADO_TICKET_CERRADO,
  ESTADO_TICKET_EN_ESPERA,
  ESTADO_TICKET_EN_PROGRESO,
  ESTADO_TICKET_RESPONDIDO,
  EVENTO_TICKETS_CAMBIADOS,
  PARAMETRO_TICKET,
  avisarCambioDeTicket
} from './ticket-estados.ts'
