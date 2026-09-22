import type { DefinicionRecurso } from './tipos.ts'
import type { TicketPortal } from '../datos/portal.ts'
import { formatearFecha } from '../lib/fechas.ts'
import { GLOSARIO } from '../dominio/glosario.ts'

/** Tickets de soporte del portal del cliente. */
export const PORTAL_TICKETS: DefinicionRecurso<TicketPortal> = {
  ruta: 'portal/tickets',
  titulo: GLOSARIO.ticket,

  columnas: [
    { clave: 'subject', encabezado: 'Asunto', ordenPor: 'subject', presentar: (t) => t.subject },
    { clave: 'status', encabezado: 'Estado', comoInsignia: 'ticket_statuses', presentar: (t) => t.status },
    { clave: 'priority', encabezado: 'Prioridad', comoInsignia: 'ticket_priorities', presentar: (t) => t.priority },
    { clave: 'date', encabezado: 'Abierto', ordenPor: 'date', presentar: (t) => formatearFecha(t.date) },
    {
      clave: 'last_reply',
      encabezado: 'Última respuesta',
      ordenPor: 'lastreply',
      presentar: (t) => formatearFecha(t.last_reply)
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
