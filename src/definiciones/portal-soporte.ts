import type { DefinicionRecurso } from './tipos.ts'
import type { TicketPortal } from '../datos/portal.ts'
import { ultimaActividad } from '../dominio/tickets-listados.ts'
import { formatearFecha, formatearRelativo } from '../lib/fechas.ts'
import { GLOSARIO } from '../dominio/glosario.ts'

/**
 * Solicitudes del portal del cliente (`GET /portal/tickets`).
 *
 * Hacia el cliente se llaman Tickets, igual que hacia el equipo: es la palabra del boton de alta y la
 * del titulo de la pagina. La ruta y el permiso siguen siendo `tickets`/`support`.
 */
export const PORTAL_TICKETS: DefinicionRecurso<TicketPortal> = {
  ruta: 'portal/tickets',
  titulo: GLOSARIO.ticket,

  columnas: [
    { clave: 'subject', encabezado: 'Asunto', ordenPor: 'subject', presentar: (t) => t.subject },
    {
      clave: 'project',
      encabezado: GLOSARIO.espacio.singular,
      presentar: (t) => (t.project_id === null ? `Sin ${GLOSARIO.espacio.singular.toLowerCase()}` : `#${t.project_id}`)
    },
    { clave: 'status', encabezado: 'Estado', comoInsignia: 'ticket_statuses', presentar: (t) => t.status },
    { clave: 'priority', encabezado: 'Prioridad', comoInsignia: 'ticket_priorities', presentar: (t) => t.priority },
    { clave: 'date', encabezado: 'Abierto', ordenPor: 'date', presentar: (t) => formatearFecha(t.date) },
    {
      clave: 'last_reply',
      encabezado: 'Última actividad',
      ordenPor: 'lastreply',
      presentar: (t) => formatearRelativo(ultimaActividad(t))
    }
  ],

  filtros: [
    { clave: 'status', etiqueta: 'Estado', tipo: 'multiple', desdeLookup: 'ticket_statuses' },
    { clave: 'priority', etiqueta: 'Prioridad', tipo: 'seleccion', desdeLookup: 'ticket_priorities' }
  ],

  ordenables: ['subject', 'date', 'lastreply'],
  ordenPorDefecto: '-date',
  busqueda: true,
  includes: []
}
