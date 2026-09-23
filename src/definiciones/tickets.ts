import type { DefinicionRecurso } from './tipos.ts'
import type { TicketDelProyecto, TicketEspacio } from '../datos/recursos.ts'
import { GLOSARIO } from '../dominio/glosario.ts'
import { formatearFecha } from '../lib/fechas.ts'

/**
 * Definicion del recurso Tickets en la bandeja global (`GET /tickets`).
 *
 * **Todavia no la monta ninguna pantalla del panel.** La pestaña Tickets del Proyecto usa
 * {@link definicionDeTicketsDelProyecto}, que lee `GET /projects/{id}/tickets` —otra forma: sin
 * `task` ni `solicitante`—. Esta queda para una bandeja transversal, y mientras tanto la ejercita
 * `pruebas/definiciones.test.js`.
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
  // usarlos devuelve 422 `unknown` en vez de ignorarse. La pantalla que monte esto va a tener que
  // quitarlos cuando no corresponda; aca se declaran porque el contrato los tiene.
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

/**
 * Tickets de un Proyecto, para su pestaña en la ficha del equipo (`GET /projects/{id}/tickets`).
 *
 * Acotar por ruta y no por `filter[project_id]` deja el Proyecto fuera de la URL, donde quien mira
 * podria editarlo. Estado y prioridad se pintan con el nombre del catalogo tal como lo manda la API
 * (T1: ya viene en español); aca no se traduce nada.
 *
 * Los filtros son los que `RecursoVentas::tickets()` declara para todos: estado y prioridad. Los de
 * departamento y asignado existen, pero piden catalogos que la pestaña no carga y no aportan en un
 * Proyecto que tiene un puñado de tickets.
 *
 * @param proyectoId el Proyecto que se esta mirando
 * @returns la definicion lista para `PanelRecurso`
 */
export function definicionDeTicketsDelProyecto (proyectoId: number): DefinicionRecurso<TicketDelProyecto> {
  return {
    ruta: `projects/${encodeURIComponent(String(proyectoId))}/tickets`,
    titulo: GLOSARIO.ticket,

    columnas: [
      { clave: 'id', encabezado: '#', numerica: true, sinCortar: true, presentar: (t) => String(t.id) },
      { clave: 'subject', encabezado: 'Asunto', ordenPor: 'subject', presentar: (t) => t.subject },
      { clave: 'status', encabezado: 'Estado', ordenPor: 'status', comoInsignia: 'ticket_statuses', presentar: (t) => t.status },
      { clave: 'priority', encabezado: 'Prioridad', ordenPor: 'priority', comoInsignia: 'ticket_priorities', presentar: (t) => t.priority },
      { clave: 'assigned', encabezado: 'Asignado', presentar: (t) => t.assigned?.full_name ?? 'Sin asignar' },
      { clave: 'date', encabezado: 'Creado', ordenPor: 'date', presentar: (t) => formatearFecha(t.date) },
      { clave: 'lastreply', encabezado: 'Última respuesta', ordenPor: 'lastreply', presentar: (t) => formatearFecha(t.lastreply) }
    ],

    filtros: [
      { clave: 'status', etiqueta: 'Estado', tipo: 'multiple', desdeLookup: 'ticket_statuses' },
      { clave: 'priority', etiqueta: 'Prioridad', tipo: 'seleccion', desdeLookup: 'ticket_priorities' }
    ],

    ordenables: ['subject', 'status', 'priority', 'date', 'lastreply'],
    ordenPorDefecto: '-date',
    busqueda: true,
    includes: []
  }
}
