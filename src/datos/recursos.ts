import type { StaffReferencia } from './tipos.ts'

/**
 * Tipos de los recursos de negocio, con los nombres de campo de la API.
 *
 * No se traducen: la traduccion ocurre una sola vez, al presentar (ver `src/dominio/glosario.ts`).
 * Renombrarlos aca obligaria a mantener dos vocabularios y a traducir en cada consulta.
 *
 * Fuente: `docs/contrato-api.md` y las fichas de `docs/modulos/`.
 */

export interface Etiqueta {
  id: number
  name: string
}

export interface Referencia {
  id: number
  name: string
}

export interface CampoPersonalizado {
  id: number
  slug: string
  name: string
  type: string
  value: string | null
}

/** Proceso. `task` en Perfex. */
export interface Proceso {
  id: number
  name: string
  status: number
  priority: number
  start_date: string | null
  due_date: string | null
  date_added: string | null
  date_finished: string | null
  added_from: number
  rel_type: string | null
  rel_id: number | null
  project: Referencia | null
  milestone: Referencia | null
  billable: boolean
  billed: boolean
  hourly_rate: number
  is_public: boolean
  visible_to_client: boolean
  recurring: boolean
  kanban_order: number
  assignees: StaffReferencia[]
  followers: StaffReferencia[]
  tags: Etiqueta[]
  counts: {
    comments: number
    checklist: number
    checklist_done: number
    attachments: number
  }
  /** Cronometro abierto de quien mira, o `null`. Es global: una persona tiene a lo sumo uno. */
  timer_activo: { id: number, staff_id: number, start_time: string } | null
  /** Solo en el detalle o con `include=description`. */
  description?: string
  custom_fields?: CampoPersonalizado[]
}

/** Espacio. `project` en Perfex. Ojo con el glosario: "Proyecto" en la interfaz es otra cosa. */
export interface Espacio {
  id: number
  name: string
  description: string | null
  status: number
  client: { id: number, company: string } | null
  billing_type: number
  start_date: string | null
  deadline: string | null
  date_finished: string | null
  /** Derivado por el backend, no es la columna de la base. No se edita. */
  progress: number
  progress_from_tasks: boolean
  project_cost: number | null
  project_rate_per_hour: number | null
  estimated_hours: number | null
  added_from: number
  project_created: string | null
  tags: Etiqueta[]
  counts: { tasks: number, tasks_open: number, milestones: number }
  custom_fields?: CampoPersonalizado[]
  members?: StaffReferencia[]
}

export interface Cliente {
  /** Es `userid` en la base; la API lo expone como `id`. */
  id: number
  /** Ya viene con respaldo aplicado: contacto primario, o "Cliente #N". Nunca vacio. */
  company: string
  vat: string | null
  phonenumber: string | null
  city: string | null
  state: string | null
  zip: string | null
  address: string | null
  country_id: number
  website: string
  active: boolean
  default_currency: number
  default_language: string
  datecreated: string
  /** No nulo si el cliente nacio de convertir un prospecto. */
  lead_id: number | null
  billing: {
    street: string | null
    city: string | null
    state: string | null
    zip: string | null
    country_id: number
  }
  tags: Etiqueta[]
  custom_fields?: CampoPersonalizado[]
  contacts?: Contacto[]
}

export interface Contacto {
  id: number
  full_name: string
  email: string
  phonenumber: string | null
  title: string | null
  is_primary: boolean
}

/** Miembro del equipo. `staff` queda en ingles por convencion del glosario. */
export interface MiembroEquipo {
  id: number
  email: string
  firstname: string
  lastname: string
  /** Campo virtual del backend. No concatenar en el frontend: viene hecho. */
  full_name: string
  profile_image_url: string | null
  is_admin: boolean
  role_id: number | null
  active: boolean
  /** Cuentas que existen pero no son personal operativo: no van en los selectores de asignacion. */
  is_not_staff: boolean
  last_login: string | null
}

/** Una columna del tablero, tal como la declara `lookups`. */
export interface EstadoLookup {
  id: number
  name: string
  color?: string
  order?: number
  filter_default?: unknown
}

/** Respuesta de `GET /lookups`. */
export interface Lookups {
  task_statuses: EstadoLookup[]
  task_priorities: EstadoLookup[]
  project_statuses: EstadoLookup[]
  tags: Referencia[]
  roles: Referencia[]
  departments: Referencia[]
}

/**
 * Hito de un espacio. `milestone` en Perfex.
 *
 * `counts.tasks_done` cuenta las tareas del hito ya completadas: es lo que permite dibujar el avance
 * sin pedir el listado entero.
 */
export interface Hito {
  id: number
  name: string
  description: string | null
  start_date: string | null
  due_date: string | null
  project_id: number
  color: string | null
  order: number
  counts: { tasks: number, tasks_done: number }
}

/**
 * Archivo adjunto a un espacio.
 *
 * `external` distingue los que viven en Drive o Dropbox —esos si se pueden abrir por `url`— de los
 * internos, que hoy la API no sabe descargar (ver `docs/contrato-api.md`).
 */
export interface ArchivoProyecto {
  id: number
  file_name: string
  original_file_name: string | null
  subject: string | null
  filetype: string | null
  rel_type: string
  rel_id: number
  staff_id: number
  date_added: string | null
  visible_to_customer: boolean
  external: string | null
  url: string | null
  thumbnail_url: string | null
}

/**
 * Marcaje de tiempo sobre un proceso. `taskstimer` en Perfex.
 *
 * `end_time` en `null` significa que corre ahora mismo, y entonces `segundos` tambien viene en
 * `null`: el total en vivo lo calcula quien presenta, no el backend.
 */
export interface Cronometro {
  id: number
  task_id: number
  staff_id: number
  start_time: string
  end_time: string | null
  segundos: number | null
  note: string | null
}

/** Comentario de un proceso. */
export interface ComentarioProceso {
  id: number
  task_id: number
  content: string
  staff: { id: number, full_name: string } | null
  date_added: string | null
}

/** Item de la lista de control de un proceso. */
export interface ItemChecklist {
  id: number
  task_id: number
  description: string
  finished: boolean
  order: number
  assigned: number | null
}

// frente: tareas
// Bloque agregado por el frente de Tareas y Registro de horas. Se suma al final a proposito: otros
// frentes editan este mismo archivo y un bloque contiguo hace trivial el merge.

/** Tipo de tarea (`tbltask_types`). Trae sus dos colores porque la insignia los usa tal cual. */
export interface TipoTarea {
  id: number
  name: string
  label_color: string | null
  text_color: string | null
}

/**
 * Valor de un campo personalizado tal como viaja en `include=custom_fields`.
 *
 * `value` puede ser una lista: un `multiselect` devuelve array, no cadena. `CampoPersonalizado` lo
 * declara solo como cadena, y ensanchar aquel tipo obligaria a tocar codigo de otros frentes.
 */
export interface ValorCampoPersonalizado extends Omit<CampoPersonalizado, 'value'> {
  value: string | string[] | null
}

/**
 * Definicion de un campo personalizado (`GET /custom-fields?para=tasks`).
 *
 * `show_on_table` es lo unico que decide si el campo se convierte en columna: el panel viejo hace
 * exactamente eso y las tareas tienen mas campos de los que entran en una fila.
 */
export interface DefinicionCampoPersonalizado {
  id: number
  slug: string
  name: string
  type: string
  options: string[] | null
  required: boolean
  order: number
  default_value: string | null
  only_admin: boolean
  show_on_table: boolean
}

/**
 * Proceso con los campos que agrega la pestaña de Tareas de un proyecto.
 *
 * Son opcionales porque el backend los esta agregando: mientras no lleguen, la columna muestra un
 * guion en vez de romper la tabla.
 */
export interface ProcesoAmpliado extends Omit<Proceso, 'custom_fields'> {
  task_type?: TipoTarea | null
  counts: Proceso['counts'] & { iterations?: number }
  custom_fields?: ValorCampoPersonalizado[]
}

/** Una tarjeta del resumen de tareas por estado (`GET /projects/{id}/tasks/summary`). */
export interface ResumenEstadoTareas {
  status: number
  name: string
  color: string | null
  order: number
  total: number
  /** Cuantas de ese estado tengo asignadas. */
  mias: number
}

/** Acciones que acepta `POST /tasks/bulk`. */
export type AccionMasiva = 'status' | 'priority' | 'assignees' | 'milestone' | 'billable' | 'tags' | 'delete'

/** Respuesta de `POST /tasks/bulk`: cuantas se aplicaron y cuales se saltearon por permisos. */
export interface ResultadoAccionMasiva {
  aplicados: number
  omitidos: number[]
}

/**
 * Un registro del Registro de horas (`GET /projects/{id}/timesheets`).
 *
 * `duration_hm` y `duration_decimal` los calcula el backend y el frontend los muestra tal cual: son
 * horas que alguien factura, y recalcularlas aca seria duplicar una regla de negocio. Lo unico que
 * el frontend calcula es el conteo en vivo de un registro con `corriendo: true`.
 *
 * Los tres `puede_*` tambien los decide el backend, con las reglas del panel viejo.
 */
export interface RegistroTiempo {
  id: number
  staff: { id: number, full_name: string, profile_image_url: string | null, sigue_asignado: boolean }
  task: { id: number, name: string, status: number, billable: boolean, billed: boolean }
  tags: Etiqueta[]
  start_time: string
  end_time: string | null
  note: string | null
  duration_seconds: number
  duration_hm: string
  duration_decimal: number
  corriendo: boolean
  puede_editar: boolean
  puede_borrar: boolean
  puede_detener: boolean
}

/** Persona que registro tiempo en el proyecto (`GET /projects/{id}/timesheets/staff`). */
export interface PersonaConTiempo {
  id: number
  full_name: string
  profile_image_url: string | null
}

/** Tarea elegible para registrar horas (`GET /projects/{id}/timesheets/tasks`). */
export interface TareaElegible {
  id: number
  name: string
}

/** Asignado de una tarea (`GET /tasks/{taskId}/assignees`). */
export interface AsignadoTarea {
  id: number
  full_name: string
  es_miembro_del_proyecto: boolean
}

// frente: detalle — tipos de las pestañas del detalle de Proyecto (contrato secciones 2 y 5).

/** Bloque de tiempo registrado del resumen. Los importes solo tienen sentido con `muestra_finanzas`. */
export interface TiempoRegistradoResumen {
  total_seconds: number
  billable_seconds: number
  billed_seconds: number
  unbilled_seconds: number
  billable_amount: number
  billed_amount: number
  unbilled_amount: number
  /**
   * `true` solo si quien mira tiene `create projects` **y** el proyecto factura por horas (2 o 3).
   * Cuando es `false` los importes vienen en 0 y no se pintan: mostrar "$0" donde no hay dato es
   * inventar una cifra.
   */
  muestra_finanzas: boolean
}

/** Respuesta de `GET /projects/{id}/overview`. Todo lo que pinta la pestaña Descripcion. */
export interface ResumenEspacio {
  progress: number
  tasks: { total: number, open: number, completed: number, completed_percent: number }
  /** `null` cuando el proyecto no tiene fecha de entrega: no hay plazo que contar. */
  days: { total: number, left: number, left_percent: number } | null
  logged_time: TiempoRegistradoResumen
  expenses: { total: number, billable: number, billed: number, unbilled: number }
  estimated_hours: number | null
  estimated_hours_excedidas: boolean
  currency: { id: number, symbol: string, name: string } | null
}

/** Periodos que acepta `GET /projects/{id}/overview/chart`. */
export type PeriodoGrafico = 'esta_semana' | 'semana_pasada' | 'este_mes' | 'mes_pasado'

/** Una serie del grafico de horas. Los valores son horas decimales, no segundos. */
export interface SerieGrafico {
  clave: string
  nombre: string
  valores: number[]
}

/** Respuesta de `GET /projects/{id}/overview/chart`. */
export interface GraficoHoras {
  periodo: PeriodoGrafico
  etiquetas: string[]
  series: SerieGrafico[]
}

/** Entrada del feed de actividad del proyecto. `description` y `additional_data` llegan resueltas. */
export interface ActividadEspacio {
  id: number
  description: string
  additional_data: string | null
  date_added: string | null
  visible_to_customer: boolean
  staff: StaffReferencia | null
  contact: { id: number, full_name: string } | null
}

/** Nota privada del proyecto. Cada persona solo ve las suyas: el backend filtra por la sesion. */
export interface NotaEspacio {
  id: number
  title: string
  content: string | null
  date_added: string | null
  staff_id: number
}

/** Discusion del proyecto. */
export interface Discusion {
  id: number
  subject: string
  description: string | null
  show_to_customer: boolean
  date_created: string | null
  last_activity: string | null
  counts: { comments: number }
  staff: StaffReferencia | null
  contact: { id: number, full_name: string } | null
}

/** Comentario de una discusion o del hilo de un archivo. */
export interface ComentarioDiscusion {
  id: number
  content: string
  created: string | null
  modified: string | null
  parent: number | null
  author: { id: number, full_name: string, profile_image_url: string | null, es_cliente: boolean } | null
  file: { name: string, mime: string, url: string } | null
}

/** Ticket asociado al proyecto. */
export interface TicketEspacio {
  id: number
  ticketid: number
  subject: string
  status: number
  priority: number
  department: Referencia | null
  assigned: StaffReferencia | null
  client: { id: number, company: string } | null
  date: string | null
  lastreply: string | null
}

/** Contrato asociado al proyecto. Solo lectura desde esta pantalla. */
export interface ContratoEspacio {
  id: number
  subject: string
  contract_type: Referencia | null
  client: { id: number, company: string } | null
  datestart: string | null
  dateend: string | null
  contract_value: number
  signed: boolean
  trash: boolean
}

/** Gasto del proyecto. `total` ya incluye impuestos. */
export interface GastoEspacio {
  id: number
  expense_name: string | null
  note: string | null
  category: Referencia | null
  amount: number
  tax_total: number
  total: number
  currency: { id: number, symbol: string } | null
  date: string | null
  reference_no: string | null
  billable: boolean
  invoice: { id: number, number: string, status: number } | null
  payment_mode: Referencia | null
  file: { id: number, url: string } | null
}

/** Factura o presupuesto del proyecto. Las dos listas comparten forma. */
export interface DocumentoVenta {
  id: number
  number: string
  date: string | null
  duedate: string | null
  status: number
  total: number
  currency: { id: number, symbol: string } | null
}

/** Barra de una tarea dentro del Gantt. */
export interface TareaGantt {
  id: number
  name: string
  start: string | null
  end: string | null
  progress: number
  status: number
  color: string | null
}

/** Grupo del Gantt: un hito, un miembro o un estado, con sus tareas. Los grupos vacios no se emiten. */
export interface GrupoGantt {
  id: string
  nombre: string
  grupo: boolean
  start: string | null
  end: string | null
  tareas: TareaGantt[]
}

/** Como agrupa el Gantt. `milestones` es el modo por defecto del panel. */
export type AgrupacionGantt = 'milestones' | 'members' | 'status'

/**
 * Hito con los campos que suma el contrato del detalle.
 *
 * Extiende `Hito` en vez de modificarlo para que el listado de Espacios, que solo usa la forma
 * corta, no dependa de campos que su endpoint no manda.
 */
export interface HitoDetallado extends Hito {
  description_visible_to_customer: boolean
  hide_from_customer: boolean
  date_created: string | null
  total_logged_seconds: number
  /** Hoy paso la fecha de vencimiento **y** el hito todavia tiene tareas sin completar. */
  vencido: boolean
}

/** Tarjeta del kanban de hitos. */
export interface TarjetaHito {
  id: number
  name: string
  status: number
  start_date: string | null
  due_date: string | null
  total_logged_seconds: number
  assignees: StaffReferencia[]
  current_user_is_assigned: boolean
  vencida: boolean
}

/** Columna del kanban de hitos. La sintetica "Sin categorizar" viaja con `id: 0`. */
export interface ColumnaHito {
  id: number
  name: string
  color: string | null
  order: number
  total_logged_seconds: number
}

// frente: listado
/**
 * Contador de Espacios por estado, de `GET /projects/stats`.
 *
 * Trae `name`, `color` y `order` propios en vez de resolverlos contra `lookups`: las pastillas se
 * pintan con lo que el backend cuenta, y asi un estado recien creado en Perfex aparece sin que el
 * frontend sepa nada de el.
 */
export interface EstadisticaEstado {
  status: number
  name: string
  color: string | null
  order: number
  total: number
}

/**
 * Metadato de un campo personalizado, de `GET /custom-fields?para=projects`.
 *
 * Es la definicion del campo, no su valor: `CampoPersonalizado` es lo que trae cada fila.
 * `show_on_table` es lo que decide si el campo se convierte en columna del listado.
 */
export interface CampoPersonalizadoMeta {
  id: number
  slug: string
  name: string
  type: string
  options: string[] | null
  required: boolean
  order: number
  default_value: string
  only_admin: boolean
  show_on_table: boolean
}
