import type { DefinicionRecurso } from './tipos.ts'
import type { TicketEspacio } from '../datos/recursos.ts'
import { GLOSARIO } from '../dominio/glosario.ts'
import { formatearFecha } from '../lib/fechas.ts'

/**
 * Definicion del recurso Tickets acotado a un Proyecto.
 *
 * La monta `PanelTickets`, la pestaña Tickets del detalle del Espacio: el soporte volvio al panel y
 * se atiende desde el Espacio al que pertenece, que es donde ya esta la Tarea que lo resuelve.
 *
 * `ruta` queda neutra —`tickets`— y la pestaña la acota con `consultaFija` y no reemplazandola: la
 * API lista los tickets de un Proyecto por `filter[project_id]`, no por un subrecurso. Acotar por
 * `consultaFija` deja el proyecto fuera de la URL, donde seria editable por quien mira.
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
    // El numero con el que el equipo nombra un ticket ("el 412") es `id`. **No es `ticketkey`**: pese
    // al nombre, esa clave es el hash aleatorio con el que Perfex arma el enlace publico.
    { clave: 'id', encabezado: '#', numerica: true, sinCortar: true, presentar: (t) => String(t.id) },
    { clave: 'subject', encabezado: 'Asunto', ordenPor: 'subject', presentar: (t) => t.subject },
    // La Tarea enganchada se ve desde la bandeja y no solo al abrir el ticket: lo primero que se
    // mira al recorrerla es cual todavia no tiene a nadie trabajandolo. Sin nombre no se escribe un
    // guion sino la ausencia completa, que es una decision pendiente y no un dato que falta.
    { clave: 'task', encabezado: GLOSARIO.proceso.singular, presentar: (t) => t.task?.name ?? `Sin ${GLOSARIO.proceso.singular.toLowerCase()}` },
    { clave: 'status', encabezado: 'Estado', ordenPor: 'status', comoInsignia: 'ticket_statuses', presentar: (t) => t.status },
    { clave: 'priority', encabezado: 'Prioridad', ordenPor: 'priority', comoInsignia: 'ticket_priorities', presentar: (t) => t.priority },
    { clave: 'department', encabezado: 'Departamento', presentar: (t) => t.department?.name ?? '' },
    { clave: 'assigned', encabezado: 'Asignado', presentar: (t) => t.assigned?.full_name ?? 'Sin asignar' },
    { clave: 'date', encabezado: 'Creado', ordenPor: 'date', presentar: (t) => formatearFecha(t.date) },
    { clave: 'lastreply', encabezado: 'Última respuesta', ordenPor: 'lastreply', ocultaPorDefecto: true, presentar: (t) => formatearFecha(t.lastreply) }
  ],

  // `department` y `assigned` los acepta la API **solo para quien administra**: el panel viejo los
  // declara con `isVisible(fn () => is_admin())`, asi que para el resto no estan en la whitelist y
  // usarlos devuelve 422 `unknown` en vez de ignorarse. `PanelTickets` los quita cuando no
  // corresponde; aca se declaran porque el contrato los tiene.
  filtros: [
    { clave: 'ticketid', etiqueta: 'ID', tipo: 'campo', tipoDato: 'numero' },
    { clave: 'subject', etiqueta: 'Asunto', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'date', etiqueta: 'Creado', tipo: 'campo', tipoDato: 'fecha' },
    { clave: 'lastreply', etiqueta: 'Última respuesta', tipo: 'campo', tipoDato: 'fecha' },
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
