import type { DefinicionRecurso } from './tipos.ts'
import type { TicketEspacio } from '../datos/recursos.ts'
import { GLOSARIO } from '../dominio/glosario.ts'
import { formatearFecha } from '../lib/fechas.ts'

/**
 * Definicion del recurso Tickets acotado a un Proyecto.
 *
 * El panel preselecciona los estados 1, 2 y 4, pero eso es decision de la vista y no del contrato:
 * aca se listan todos y el filtro queda a mano.
 *
 * Fuente: `CONTRATO-NUEVO.md` seccion 2.
 */
export const TICKETS: DefinicionRecurso<TicketEspacio> = {
  ruta: 'tickets',
  titulo: GLOSARIO.ticket,

  columnas: [
    { clave: 'ticketid', encabezado: '#', numerica: true, presentar: (t) => String(t.ticketid) },
    { clave: 'subject', encabezado: 'Asunto', ordenPor: 'subject', presentar: (t) => t.subject },
    { clave: 'status', encabezado: 'Estado', ordenPor: 'status', comoInsignia: 'ticket_statuses', presentar: (t) => t.status },
    { clave: 'priority', encabezado: 'Prioridad', ordenPor: 'priority', comoInsignia: 'ticket_priorities', presentar: (t) => t.priority },
    { clave: 'department', encabezado: 'Departamento', presentar: (t) => t.department?.name ?? '' },
    { clave: 'assigned', encabezado: 'Asignado', presentar: (t) => t.assigned?.full_name ?? 'Sin asignar' },
    { clave: 'date', encabezado: 'Creado', ordenPor: 'date', presentar: (t) => formatearFecha(t.date) },
    { clave: 'lastreply', encabezado: 'Última respuesta', ordenPor: 'lastreply', ocultaPorDefecto: true, presentar: (t) => formatearFecha(t.lastreply) }
  ],

  filtros: [
    { clave: 'status', etiqueta: 'Estado', tipo: 'multiple', desdeLookup: 'ticket_statuses' },
    { clave: 'priority', etiqueta: 'Prioridad', tipo: 'seleccion', desdeLookup: 'ticket_priorities' },
    { clave: 'department', etiqueta: 'Departamento', tipo: 'seleccion', desdeLookup: 'departments' },
    { clave: 'assigned', etiqueta: 'Asignado', tipo: 'seleccion' }
  ],

  ordenables: ['subject', 'status', 'priority', 'date', 'lastreply'],
  ordenPorDefecto: '-date',
  busqueda: true,
  includes: []
}
