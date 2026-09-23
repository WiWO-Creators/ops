import type { Columna, DefinicionRecurso, Filtro, OpcionFiltro } from './tipos.ts'
import type { TicketEspacio } from '../datos/recursos.ts'
import { GLOSARIO } from '../dominio/glosario.ts'
import { esperaDelTicket, ultimaActividad } from '../dominio/tickets-listados.ts'
import { formatearFecha, formatearRelativo } from '../lib/fechas.ts'

/**
 * Definiciones de los dos listados de tickets del equipo: la bandeja global (`GET /tickets`) y la
 * pestaña Tickets de un Proyecto (`GET /projects/{id}/tickets`).
 *
 * Desde el contrato v2 (CONTRATO2 F) las dos rutas tienen la misma forma y aceptan los mismos filtros
 * —los de `RecursoTickets::consulta()` mas `filter[esperando]`—, asi que comparten columnas. La
 * diferencia es de alcance: la bandeja cruza Proyectos y por eso muestra la columna Proyecto y ofrece
 * el filtro "Sin Proyecto"; la pestaña ya esta dentro de uno.
 *
 * Los presentadores de aca devuelven texto. La pantalla que monta la definicion reemplaza los que
 * necesitan un componente (el asunto como enlace al modal, la espera como insignia, el Proyecto por su
 * nombre): una definicion en `.ts` se puede probar con `node --test`, y una con JSX no.
 */

/** Quien puede usar `department` y `assigned`: la API los rechaza con 422 para el resto. */
export interface AlcanceDeTickets {
  /** `is_admin || is_superadmin` de `/me`, lo mismo que `Permisos::esAdmin()` del backend. */
  esAdmin: boolean
}

/**
 * Valor del filtro de Proyecto que pide los tickets sin ninguno.
 *
 * `tbltickets.project_id` es `INT NOT NULL DEFAULT 0` (migracion 118 de Perfex): un ticket sin
 * Proyecto tiene 0, no NULL, y `filter[project_id]=0` es exactamente esa condicion. No es el
 * `ninguno` de las Tareas, que es un valor sintetico que `RecursoTickets` no entiende.
 */
export const SIN_PROYECTO_EN_TICKETS = '0'

/** Clave del catalogo de Proyectos del filtro. No viene de `/lookups`: lo arma la pantalla. */
export const CATALOGO_PROYECTOS_DE_TICKETS = 'ticket_projects'

/** Las dos respuestas de `filter[esperando]`. */
export const OPCIONES_DE_ESPERA: OpcionFiltro[] = [
  { valor: 'equipo', etiqueta: 'Al equipo' },
  { valor: 'cliente', etiqueta: 'Al cliente' }
]

/**
 * Nombre de quien abrio el ticket, en el orden en que el panel lo muestra.
 *
 * Un ticket de contacto trae el contacto; uno abierto por correo trae `name`/`email` sueltos.
 *
 * @param ticket la fila del listado
 * @returns el nombre, el correo o "Sin solicitante"
 */
export function nombreDelSolicitante (ticket: Pick<TicketEspacio, 'solicitante'>): string {
  const solicitante = ticket.solicitante

  if (solicitante === undefined || solicitante === null) return 'Sin solicitante'

  return solicitante.contact?.full_name ??
    solicitante.name ??
    solicitante.email ??
    solicitante.client?.name ??
    'Sin solicitante'
}

/**
 * Texto de la columna "Esperando a", para quien no monta el componente (el CSV, las pruebas).
 *
 * @param ticket la fila del listado
 * @param ahora referencia para el tiempo relativo
 * @returns "Esperando al equipo · hace 2 horas", o cadena vacia si no espera a nadie
 */
export function textoDeEspera (ticket: TicketEspacio, ahora: Date = new Date()): string {
  const espera = esperaDelTicket(ticket, ahora)

  if (espera === null) return ''

  return espera.desde === null ? espera.etiqueta : `${espera.etiqueta} · ${espera.desde}`
}

/**
 * Columnas comunes a los dos listados.
 *
 * @param conProyecto si se muestra la columna Proyecto (solo la bandeja global)
 * @returns las columnas en el orden en que se ven
 */
function columnasDeTickets (conProyecto: boolean): Array<Columna<TicketEspacio>> {
  return [
    // El numero con el que el equipo nombra un ticket ("el 412") es `id`. **No es `ticketkey`**: pese
    // al nombre, esa clave es el hash aleatorio con el que Perfex arma el enlace publico.
    { clave: 'id', encabezado: '#', numerica: true, sinCortar: true, presentar: (t) => String(t.id) },
    { clave: 'subject', encabezado: 'Asunto', ordenPor: 'subject', presentar: (t) => t.subject },
    ...(conProyecto
      ? [{
          clave: 'project',
          encabezado: GLOSARIO.espacio.singular,
          presentar: (t: TicketEspacio) => (t.project_id === null || t.project_id === undefined
            ? `Sin ${GLOSARIO.espacio.singular.toLowerCase()}`
            : `#${t.project_id}`)
        }]
      : []),
    { clave: 'solicitante', encabezado: 'Solicitante', presentar: nombreDelSolicitante },
    { clave: 'status', encabezado: 'Estado', ordenPor: 'status', comoInsignia: 'ticket_statuses', presentar: (t) => t.status },
    { clave: 'priority', encabezado: 'Prioridad', ordenPor: 'priority', comoInsignia: 'ticket_priorities', presentar: (t) => t.priority },
    { clave: 'esperando', encabezado: 'Esperando a', presentar: (t) => textoDeEspera(t) },
    { clave: 'assigned', encabezado: 'Asignado', presentar: (t) => t.assigned?.full_name ?? 'Sin asignar' },
    {
      clave: 'lastreply',
      encabezado: 'Última actividad',
      ordenPor: 'lastreply',
      presentar: (t) => formatearRelativo(ultimaActividad(t))
    },
    // La Tarea enganchada se puede mirar desde la bandeja, pero arranca oculta: lo que se recorre
    // primero es quien espera a quien.
    { clave: 'task', encabezado: GLOSARIO.proceso.singular, ocultaPorDefecto: true, presentar: (t) => t.task?.name ?? `Sin ${GLOSARIO.proceso.singular.toLowerCase()}` },
    { clave: 'department', encabezado: 'Departamento', ocultaPorDefecto: true, presentar: (t) => t.department?.name ?? '' },
    { clave: 'date', encabezado: 'Creado', ordenPor: 'date', ocultaPorDefecto: true, presentar: (t) => formatearFecha(t.date) }
  ]
}

/**
 * Filtros que la API acepta para todos (`RecursoTickets::consulta()` mas `esperando`).
 *
 * @returns la lista, en el orden en que se ofrecen
 */
function filtrosComunes (): Filtro[] {
  return [
    { clave: 'esperando', etiqueta: 'Esperando a', tipo: 'seleccion', opciones: OPCIONES_DE_ESPERA },
    { clave: 'status', etiqueta: 'Estado', tipo: 'multiple', desdeLookup: 'ticket_statuses' },
    { clave: 'priority', etiqueta: 'Prioridad', tipo: 'seleccion', desdeLookup: 'ticket_priorities' }
  ]
}

/**
 * `department` y `assigned`, solo para quien administra.
 *
 * La API los declara en la whitelist **solo** con `esAdmin` (`RecursoTickets::consulta()`); para el
 * resto son `422 unknown`, no filtros ignorados. Ofrecerlos a quien no administra es ofrecerle un
 * error, asi que no se declaran y `construirConsulta` los poda si llegan en una URL compartida.
 *
 * @param alcance quien mira
 * @returns los dos filtros, o ninguno
 */
function filtrosDeAdministracion (alcance: AlcanceDeTickets): Filtro[] {
  if (!alcance.esAdmin) return []

  return [
    { clave: 'department', etiqueta: 'Departamento', tipo: 'seleccion', desdeLookup: 'departments' },
    { clave: 'assigned', etiqueta: 'Asignado', tipo: 'seleccion', desdeLookup: 'staff' }
  ]
}

/** Ordenables comunes: la whitelist de orden de `RecursoTickets::consulta()`. */
const ORDENABLES = ['subject', 'status', 'priority', 'date', 'lastreply']

/**
 * La bandeja global de tickets del equipo (`GET /tickets`).
 *
 * El orden por defecto es `-date` y no el `-lastreply` de la API: con `-lastreply` los tickets sin
 * ninguna respuesta —los recien abiertos, que son los que mas urgen— van al final en las dos
 * direcciones. Por fecha de apertura el nuevo queda arriba.
 *
 * @param alcance quien mira; decide si se ofrecen departamento y asignado
 * @returns la definicion lista para `PanelRecurso`
 */
export function definicionDeTickets (alcance: AlcanceDeTickets): DefinicionRecurso<TicketEspacio> {
  return {
    ruta: 'tickets',
    titulo: GLOSARIO.ticket,
    columnas: columnasDeTickets(true),
    filtros: [
      ...filtrosComunes(),
      {
        clave: 'project_id',
        etiqueta: GLOSARIO.espacio.singular,
        tipo: 'seleccion',
        desdeLookup: CATALOGO_PROYECTOS_DE_TICKETS
      },
      ...filtrosDeAdministracion(alcance),
      { clave: 'ticketid', etiqueta: 'ID', tipo: 'campo', tipoDato: 'numero' },
      // El asunto solo admite `contains` en la API: igualdad exacta sobre un asunto no es una pregunta
      // que nadie haga, y el backend la rechaza con 422.
      { clave: 'subject', etiqueta: 'Asunto', tipo: 'campo', tipoDato: 'texto', operadores: ['contains', 'empty', 'not_empty'] },
      { clave: 'date', etiqueta: 'Creado', tipo: 'campo', tipoDato: 'fecha' },
      { clave: 'lastreply', etiqueta: 'Última respuesta', tipo: 'campo', tipoDato: 'fecha' }
    ],
    ordenables: ORDENABLES,
    ordenPorDefecto: '-date',
    busqueda: true,
    includes: []
  }
}

/**
 * La bandeja global con todos los filtros declarados. La usa `pruebas/definiciones.test.js` para
 * vigilar la coherencia con la whitelist; una pantalla monta {@link definicionDeTickets} con el
 * alcance de quien mira.
 */
export const TICKETS: DefinicionRecurso<TicketEspacio> = definicionDeTickets({ esAdmin: true })

/**
 * Opciones del filtro de Proyecto de la bandeja: "Sin Proyecto" primero, despues los Proyectos.
 *
 * "Sin Proyecto" va arriba porque es la unica forma de encontrar los tickets que llegaron por correo
 * sin Proyecto: repartidos entre las paginas no se ven.
 *
 * @param proyectos los Proyectos visibles
 * @returns las opciones para el selector
 */
export function opcionesDeProyectoDeTickets (proyectos: Array<{ id: number, name: string }>): OpcionFiltro[] {
  return [
    { valor: SIN_PROYECTO_EN_TICKETS, etiqueta: `Sin ${GLOSARIO.espacio.singular.toLowerCase()}` },
    ...proyectos.map((p) => ({ valor: String(p.id), etiqueta: p.name }))
  ]
}

/**
 * Tickets de un Proyecto, para su pestaña en la ficha del equipo (`GET /projects/{id}/tickets`).
 *
 * Acotar por ruta y no por `filter[project_id]` deja el Proyecto fuera de la URL, donde quien mira
 * podria editarlo. Estado y prioridad se pintan con el nombre del catalogo tal como lo manda la API
 * (T1: ya viene en español); aca no se traduce nada.
 *
 * Departamento y asignado no se ofrecen ni a quien administra: piden catalogos que la pestaña no
 * carga y no aportan en un Proyecto con un puñado de tickets.
 *
 * @param proyectoId el Proyecto que se esta mirando
 * @returns la definicion lista para `PanelRecurso`
 */
export function definicionDeTicketsDelProyecto (proyectoId: number): DefinicionRecurso<TicketEspacio> {
  return {
    ruta: `projects/${encodeURIComponent(String(proyectoId))}/tickets`,
    titulo: GLOSARIO.ticket,
    columnas: columnasDeTickets(false),
    filtros: filtrosComunes(),
    ordenables: ORDENABLES,
    ordenPorDefecto: '-date',
    busqueda: true,
    includes: []
  }
}
