/**
 * Recursos que ve el cliente en su portal.
 *
 * Viven aparte de `recursos.ts` a proposito: aunque una factura sea la misma fila de `tblinvoices`,
 * lo que el portal recibe NO es lo que recibe el panel. El portal nunca ve el `hash` publico del
 * documento, ni quien lo cargo, ni el agente de venta. Compartir el tipo invitaria a pintar en el
 * portal un campo que la API no manda, y a descubrirlo recien en pantalla.
 */

export interface TicketPortal {
  id: number
  subject: string
  date: string | null
  last_reply: string | null
  status: number
  priority: number
  project_id: number | null
}

export interface TicketPortalDetalle extends TicketPortal {
  message: string
  replies: RespuestaTicketPortal[]
}

/**
 * Respuesta de un ticket.
 *
 * `from` viene ya resuelto por la API: el panel distingue autor de staff y de contacto mirando si la
 * columna `admin` esta vacia, y esa convencion no tiene por que cruzar la red.
 */
export interface RespuestaTicketPortal {
  id: number
  message: string
  date: string | null
  from: 'cliente' | 'equipo'
  name: string
}

/**
 * Proyecto tal como lo ve el cliente.
 *
 * Los campos opcionales lo son de verdad: la API **no los emite** cuando el proyecto no los
 * comparte, en vez de mandarlos en null. `undefined` significa "no corresponde mostrarlo", que es
 * distinto de "esta vacio".
 */
export interface EspacioPortal {
  id: number
  name: string
  description: string | null
  status: number
  start_date: string | null
  deadline: string | null
  date_finished: string | null
  progress: number
  counts: { tasks: number, tasks_open: number, milestones: number }
  /** Solo en el detalle: las pestañas que este contacto puede abrir en este proyecto. */
  tabs?: PestaniaPortal[]
  /** Solo con `view_finance_overview`. */
  project_cost?: number | null
  project_rate_per_hour?: number | null
  estimated_hours?: number | null
  /** Solo con `view_team_members`. */
  members?: Array<{ id: number, full_name: string, profile_image_url: string | null }>
}

/** Claves de pestaña que la API puede devolver en `tabs`. */
export type PestaniaPortal =
  | 'overview'
  | 'tasks'
  | 'timesheets'
  | 'milestones'
  | 'files'
  | 'discussions'
  | 'gantt'
  | 'activity'
  | 'tickets'
  | 'contracts'
  | 'proposals'
  | 'estimates'
  | 'invoices'

/** Tarea de un proyecto, ya podada de todo lo interno. */
export interface TareaPortal {
  id: number
  name: string
  description: string | null
  status: number
  priority: number
  start_date: string | null
  due_date: string | null
  date_finished: string | null
  milestone: number
  milestone_order: number
  task_type: number
  tags: Array<{ id: number, name: string }>
  counts: Record<string, number>
  /** Solo con `view_task_total_logged_time`. */
  total_logged_seconds?: number
  duration_hm?: string
}

export interface HitoPortal {
  id: number
  name: string
  /** `null` cuando el equipo no marco la descripcion como compartible. */
  description: string | null
  start_date: string | null
  due_date: string | null
  project_id: number
  color: string | null
  order: number
  date_created: string | null
  counts: { tasks: number, tasks_done: number }
  vencido: boolean
  total_logged_seconds?: number
}

export interface ArchivoPortal {
  id: number
  file_name: string
  original_file_name: string | null
  subject: string | null
  filetype: string | null
  date_added: string | null
  url: string | null
  thumbnail_url: string | null
}

/** Anuncio dirigido a clientes. */
export interface AnuncioPortal {
  id: number
  name: string
  message: string
  date_added: string | null
  /** Si el contacto ya lo descarto en el portal viejo. Se usa para bajarle el tono, no para ocultarlo. */
  dismissed: boolean
}

/** Grupo de la base de conocimiento, con sus articulos visibles. */
export interface GrupoAyudaPortal {
  id: number
  name: string
  slug: string
  description: string | null
  color: string | null
  articles: Array<{ id: number, subject: string, slug: string, date: string | null }>
}

export interface ArticuloAyudaPortal {
  id: number
  subject: string
  /** HTML redactado en el panel. Se muestra aislado, nunca inyectado en la pagina. */
  description: string
  slug: string
  date: string | null
  group: { id: number, name: string, slug: string }
}

/**
 * Discusion compartida con el cliente.
 *
 * Sin `show_to_customer`: al portal solo llegan las que la tienen, asi que el campo seria siempre
 * `true` y delataria que existe la distincion.
 */
export interface DiscusionPortal {
  id: number
  subject: string
  description: string | null
  date_created: string | null
  last_activity: string | null
  counts: { comments: number }
  staff: { id: number, full_name: string } | null
  contact: { id: number, full_name: string } | null
}

export interface ComentarioPortal {
  id: number
  content: string
  created: string | null
  parent: number | null
  author: { id: number, full_name: string, es_cliente: boolean } | null
  file: { name: string, mime: string, url: string } | null
}

/** Entrada del registro de actividad, sin la marca de visibilidad. */
export interface ActividadPortal {
  id: number
  description: string
  additional_data: string | null
  date_added: string | null
  staff: { id: number, full_name: string } | null
  contact: { id: number, full_name: string } | null
}

/** Registro de horas, sin tarifa ni banderas de edicion. */
export interface TiempoPortal {
  id: number
  staff: { id: number, full_name: string } | null
  task: { id: number, name: string }
  start_time: string
  end_time: string | null
  note: string | null
  duration_seconds: number
  duration_hm: string
}

/**
 * Columna del gantt: un hito con sus barras.
 *
 * Las claves mezclan español e ingles porque asi las devuelve el contrato del panel, que este
 * endpoint reusa: `nombre` y `tareas` de la columna, `name` y `start` de la barra.
 */
export interface ColumnaGanttPortal {
  id: string
  nombre: string
  grupo: string
  start: string | null
  end: string | null
  tareas: Array<{
    id: number
    name: string
    start: string | null
    end: string | null
    status: number
    progress: number
    color: string | null
    dependencies: number[]
  }>
}
