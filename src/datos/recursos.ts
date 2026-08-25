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
