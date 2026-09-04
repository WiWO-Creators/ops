import { leerError } from './errores.ts'
import type { StaffReferencia } from './tipos.ts'

/**
 * Tipos de los recursos de negocio, con los nombres de campo de la API.
 *
 * No se traducen: la traduccion ocurre una sola vez, al presentar (ver `src/dominio/glosario.ts`).
 * Renombrarlos aca obligaria a mantener dos vocabularios y a traducir en cada consulta.
 *
 * Fuente: `docs/contrato-api.md` y las fichas de `docs/modulos/`.
 *
 * Es un archivo de tipos salvo por las escrituras del final, que pasan por el BFF y por lo tanto
 * corren en el navegador. Nada de aca puede importar `server-only`: media aplicacion lo importa.
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
  /**
   * Fecha comprometida (`YYYY-MM-DD`), derivada del tipo de Proceso en ese Espacio.
   *
   * Las cuatro claves de plazo son **opcionales**: si `wiwo_core` no esta instalado, el guard de
   * tabla del backend las omite enteras y el frontend no dibuja nada. `null` es otra cosa: la clave
   * llego, pero el Proceso no tiene tipo, el tipo no tiene ETA, o el reloj no arranco.
   */
  eta?: string | null
  /** Dias contra el vencimiento. **Positivo = tarde.** `null` sin `due_date`. */
  desviacion_dias?: number | null
  estado_sla?: EstadoSla | null
  approval?: AprobacionProceso
  /** Solo en el detalle o con `include=description`. */
  description?: string
  custom_fields?: CampoPersonalizado[]
}

/** Estado del compromiso de plazo. `null` cuando no hay con que compararlo. */
export type EstadoSla = 'en_plazo' | 'en_riesgo' | 'incumplido'

/**
 * Aprobacion del cliente sobre un Proceso.
 *
 * Las claves nunca faltan; lo que falta es su valor. `resuelta_en` no es un dato mas: es el origen
 * del reloj del ETA, y por eso reabrir una aprobacion lo borra.
 *
 * Las dos claves de autoria son opcionales porque **el portal recibe el bloque podado**: al cliente
 * no le viaja quien pidio la aprobacion ni el id del contacto que respondio.
 */
export interface AprobacionProceso {
  requerida: boolean
  estado: 'pendiente' | 'aprobada' | 'rechazada' | null
  solicitada_en: string | null
  solicitada_por?: number | null
  resuelta_en: string | null
  resuelta_por_contacto?: number | null
  comentario: string | null
}

/** Espacio. `project` en Perfex. Ojo con el glosario: "Proyecto" en la interfaz es otra cosa. */
export interface Espacio {
  id: number
  name: string
  /** Imagen propia del proyecto; si es `null`, la interfaz usa el logo del cliente. */
  image_url: string | null
  description: string | null
  status: number
  client: { id: number, company: string, image_url: string | null } | null
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
  image_url: string | null
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
  /**
   * Rol propio por encima de `is_admin` (`modules/wiwo_core/superadmin.php`): suma la configuracion
   * de la instalacion. Solo otro superadministrador lo reparte, y la API rechaza con 422
   * `solo_superadmin` a cualquier otro que lo intente.
   */
  is_superadmin: boolean
  role_id: number | null
  active: boolean
  /** Cuentas que existen pero no son personal operativo: no van en los selectores de asignacion. */
  is_not_staff: boolean
  /** Organizacion propia del staff (`modules/wiwo_core/cargos_areas.php`), separada de `role_id`. */
  cargo_id: number | null
  area_id: number | null
  /** Cargo "Director": gate de la seccion "Mi Área". No se deduce comparando por nombre. */
  is_director: boolean
  phonenumber: string | null
  /** Tarifa por hora. Se usa para valorizar el tiempo registrado. */
  hourly_rate: number
  last_login: string | null
  /** Cuando se creo la cuenta. Es la antiguedad de la persona en el sistema, no su fecha de ingreso. */
  date_created: string | null
  /**
   * Ultimo movimiento en el panel viejo.
   *
   * Lo escribe **solo** el panel (`AdminController`), no la API: alguien que trabaja unicamente desde
   * Ops la deja congelada. Sirve para saber quien sigue entrando al panel, no quien esta activo hoy.
   */
  last_activity: string | null
  two_factor_enabled: boolean
}

/**
 * Tiempo registrado por una persona, en segundos (bloque `tiempo` de `GET /staff/{id}`).
 *
 * Los cortes de mes y semana los calcula el backend en la zona del negocio. `corriendo` es el
 * cronometro abierto, que es a lo sumo uno en todo el sistema.
 */
export interface TiempoDePersona {
  total_segundos: number
  este_mes_segundos: number
  esta_semana_segundos: number
  corriendo: {
    id: number
    task_id: number
    task_name: string | null
    start_time: string | null
    segundos: number
  } | null
}

/**
 * Ficha de una persona (`GET /staff/{id}`).
 *
 * Los cinco bloques que agrega sobre el listado solo existen en el detalle: en una lista costarian
 * una consulta por fila. `permissions` son los permisos efectivos de ESA persona, no los de quien
 * mira, y para un administrador viene el catalogo completo.
 */
export interface FichaPersona extends MiembroEquipo {
  role: Referencia | null
  cargo: Referencia | null
  area: Referencia | null
  departments: Referencia[]
  permissions: Record<string, string[]>
  tiempo: TiempoDePersona
  counts: ContadoresDePersona
}

/**
 * Cuanto trabajo tiene encima una persona (`counts` de `GET /staff/{id}`).
 *
 * `por_estado` es el resumen de sus Tareas asignadas: un contador por estado, y solo de los estados
 * que efectivamente tiene. Llega sin nombre ni color porque los resuelve la pantalla contra
 * `task_statuses` de `GET /lookups`, que ya baja ahi.
 *
 * `tareas_abiertas` es la suma de `por_estado` menos el estado "Completo": el backend los saca de la
 * misma consulta, asi que los dos numeros no pueden discrepar.
 */
export interface ContadoresDePersona {
  tareas_abiertas: number
  espacios: number
  por_estado: Array<{ status: number, total: number }>
}

/**
 * Un area de `GET /roles/catalogo`: la lista de features y capacidades con la que Perfex arma su
 * formulario de permisos.
 *
 * Es el catalogo de lo que se **puede escribir**, que es mas grande que el que la API lee en `/me`.
 * Se pide para dibujar la matriz en vez de copiarla en el frontend: una feature nueva del panel
 * aparece sola, y una que se va deja de ofrecerse.
 */
export interface AreaDeCatalogo {
  feature: string
  name: string
  capabilities: Array<{ key: string, name: string }>
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
  /** Cargos del staff (`modules/wiwo_core/cargos_areas.php`). "Director" es uno de ellos. */
  cargos: Referencia[]
  areas: Referencia[]
  /**
   * Tipos de Proceso (`tbltask_types`). Opcional porque el contrato escrito no los enumeraba y el
   * mock todavia no los sirve; la API real si los devuelve.
   *
   * **Trae uno por Espacio, no uno por nombre**: `project_id` es nullable y el panel duplica los
   * tres globales (Bug, Feature, Task) en cada Espacio, asi que la lista real tiene cientos de
   * entradas con tres nombres. Quien la use para elegir un tipo tiene que deduplicar antes — ver
   * `tiposDeProcesoUnicos()` en `lib/plantillas.ts`.
   */
  task_types?: EstadoLookup[]
}

/**
 * Respuesta de `GET /me/mi-area`: el área propia de un Director y quién la integra.
 *
 * `area: null` es "sin área asignada": la pantalla se pinta vacía, no es un error.
 */
export interface MiArea {
  area: Referencia | null
  area_staff: MiembroEquipo[]
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
  /**
   * Nombre de la Tarea o del Proyecto del que cuelga.
   *
   * Solo viaja en `GET /staff/{id}/files`: en la pestaña de un Proyecto seria su propio nombre
   * repetido en cada fila. Es lo unico que ubica un archivo cuando la lista mezcla varios origenes.
   */
  rel_name?: string
  staff_id: number
  date_added: string | null
  visible_to_customer: boolean
  external: string | null
  url: string | null
  thumbnail_url: string | null
}

/** Un nodo del arbol de carpetas de Drive: una carpeta o un archivo. */
export interface NodoDrive {
  id: string
  name: string
  is_folder: boolean
  web_view_link: string
  /**
   * Solo en archivos. `null`/ausente si el archivo esta en Drive pero no se subio por acá (o si el
   * nodo es una carpeta, que nunca los trae).
   */
  uploaded_by?: { id: number, name: string } | null
  size_bytes?: number | null
  mime_type?: string | null
}

/** Una carpeta del arbol de Drive, con el primer nivel de hijos ya resuelto. */
export interface CarpetaDrive {
  id: string
  children: NodoDrive[]
}

/**
 * Respuesta de `POST /drive/{folder_id}/files`: el archivo recien subido.
 *
 * `id` es el id propio de la fila (numerico), distinto de `drive_file_id` (el id de Google). El resto
 * del árbol identifica sus nodos por `NodoDrive.id`, que en los archivos ya subidos por acá coincide
 * con este `id` propio convertido a texto — ver `nodoDeSubida` en `ArbolDrive.tsx`.
 */
export interface ArchivoDriveSubido {
  id: number
  drive_file_id: string
  name: string
  is_folder: boolean
  web_view_link: string
  mime_type: string | null
  size_bytes: number | null
  uploaded_by: { id: number, name: string }
  dateadded: string
}

/**
 * Rol de un permiso sobre una carpeta de Drive.
 *
 * `writer` y `commenter` son los del equipo, igual que Encargado/Revisor. `reader` es el de los
 * contactos del cliente, que entran desde el portal y solo miran.
 */
export type RolPermisoDrive = 'writer' | 'commenter' | 'reader'

/**
 * De quien es un permiso de Drive: alguien del equipo o un contacto del cliente.
 *
 * PENDIENTE DE CONFIRMAR con el backend: el nombre y los valores del campo (`subject_type`) todavia
 * no estan cerrados, por eso `PermisoDrive.subject_type` es opcional y una fila sin el se trata como
 * del equipo, que es lo unico que la API devolvia hasta ahora.
 */
export type SujetoPermisoDrive = 'staff' | 'contact'

/**
 * Si Drive llego a dar el acceso o no.
 *
 * `sin_cuenta_google` es la unica falla que el backend no puede resolver solo: Google rechaza
 * compartir con un correo que no tiene cuenta salvo que se le mande su correo de notificacion, y
 * este panel no lo manda nunca. El backend lo reintenta en cada sincronizacion, asi que la fila se
 * arregla sola el dia que esa persona crea la cuenta.
 */
export type EstadoPermisoDrive = 'otorgado' | 'sin_cuenta_google'

/**
 * Fila de `GET /drive/{folder_id}/permissions`: el acceso real que esa persona tiene hoy en Drive.
 *
 * No es una intencion local ni una lista aparte. El backend la sincroniza solo —en una Tarea el
 * encargado queda `writer` y el revisor `commenter`; en un Espacio sus miembros quedan `writer`; en
 * un Cliente sus contactos activos quedan `reader`— y sobre esa misma lista admite altas y bajas
 * manuales del equipo.
 */
export interface PermisoDrive {
  /** Id del sujeto. Es el `staff_id` del equipo; en un contacto lo emite el backend con esta clave. */
  staff_id: number
  name: string
  email: string
  role: RolPermisoDrive
  /** Ausente mientras el backend no lo emita: una fila sin esto se lee como del equipo. */
  subject_type?: SujetoPermisoDrive
  /** Ausente mientras el backend no lo emita: una fila sin esto se lee como acceso otorgado. */
  estado?: EstadoPermisoDrive
}

/** Respuesta de `GET|PATCH /clients/{id}/drive`. `folder: null` es un Cliente sin backfill, no un error. */
export interface DriveCliente {
  letras: string | null
  folder: CarpetaDrive | null
}

/** Respuesta de `GET /projects/{id}/drive`. `folder: null` es un Espacio sin backfill, no un error. */
export interface DriveEspacio {
  patente: string | null
  folder: CarpetaDrive | null
}

/** Respuesta de `GET /tasks/{id}/drive`. `folder: null` es una Tarea sin carpeta todavia, no un error. */
export interface DriveTarea {
  folder: CarpetaDrive | null
}

/** Entidad de la que cuelga un arbol de Drive: es el prefijo de su ruta, `GET /{raiz}/{id}/drive`. */
export type RaizDrive = 'clients' | 'projects' | 'tasks'

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

/**
 * Iteracion de un proceso (`GET|POST /tasks/{id}/iterations`): una vuelta atras, con su motivo.
 *
 * No hay numero de iteracion: el `#N` del panel es la posicion en la lista ordenada por `id`, asi que
 * `id` no sirve para numerar nada. Tampoco hay edicion ni borrado — una iteracion es un hecho
 * asentado— y por eso el tipo no tiene contraparte de escritura mas alla del `reason` del alta.
 *
 * `staff` puede ser `null`: `addedfrom` arranca en `0` y la persona pudo darse de baja.
 */
export interface IteracionProceso {
  id: number
  task_id: number
  /** **Texto plano**, no HTML: se pinta escapado, nunca con `dangerouslySetInnerHTML`. */
  reason: string
  /** Instante ISO-8601 en UTC. Lo pone el servidor. */
  date_added: string | null
  staff: { id: number, full_name: string, profile_image_url: string | null } | null
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

/** Un tipo de Proceso tal como lo ofrece un Espacio, con el ETA que compromete. */
export interface TipoDeProcesoDelEspacio extends TipoTarea {
  /** `sort_order` del catalogo. */
  order: number
  /** Dias habiles. `null` = el tipo se ofrece pero no compromete plazo. */
  eta_dias: number | null
}

/** Respuesta de `GET|PUT /projects/{id}/task-types`: el panel de configuracion del Espacio. */
export interface ConfiguracionTiposEspacio {
  /** Si los Procesos nuevos del Espacio nacen pidiendo el visto bueno del cliente. */
  aprobacion_requerida_por_defecto: boolean
  task_types: TipoDeProcesoDelEspacio[]
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

/**
 * Estado del enlace publico de una Tarea (`GET /tasks/{id}/share`).
 *
 * **No trae el token**, y ese es todo su motivo de existir: de la base solo sale el `sha256`, asi que
 * el unico modo de tener el valor en claro es acuñar uno nuevo con el `POST` —que revoca el anterior.
 * Preguntar por el estado no puede costar el enlace que ya se mando.
 */
export interface EstadoEnlaceProceso {
  /** `true` solo si hay un enlace ni revocado ni vencido. */
  shared: boolean
  /** ISO-8601 UTC, o `null` cuando no hay enlace vivo. */
  expires_at: string | null
}

/**
 * Enlace recien acuñado (`POST /tasks/{id}/share`).
 *
 * `token` es la **unica vez** que el valor existe sin cifrar en todo el sistema: si se pierde de esta
 * respuesta, no se recupera, se acuña otro. Armar la URL es cosa del frontend — la API no sabe en que
 * dominio vive.
 */
export interface EnlaceProcesoGenerado {
  token: string
  expires_at: string
}

/**
 * La ficha que ve cualquiera con el enlace (`GET /public/tasks/{token}`).
 *
 * Son **nueve claves y ninguna mas**: la API construye la proyeccion a mano en su propio `SELECT`, no
 * poda el objeto del staff. No hay `include` que agregue nada, asi que esta interfaz es la lista
 * blanca entera. Fuera quedan a proposito la descripcion, los asignados, el Proyecto, los
 * comentarios, el dinero, los adjuntos y **el id interno de la Tarea**.
 */
export interface ProcesoPublico {
  name: string
  status: { id: number, name: string, color: string | null } | null
  priority: { id: number, name: string, color: string | null } | null
  start_date: string | null
  due_date: string | null
  /** ISO-8601 UTC; `null` mientras no este cerrada. */
  date_finished: string | null
  is_completed: boolean
  /** Solo el nombre del tipo. `null` si la Tarea no tiene. */
  task_type: { name: string } | null
  progress: {
    checklist_total: number
    checklist_done: number
    /** `done/total`. Sin lista de control: `100` si esta completada, si no `null` — nunca un cero. */
    percent: number | null
  }
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
  /**
   * Proyecto de la Tarea. Solo viaja en `GET /staff/{id}/timesheets`, donde los registros son de
   * varios Proyectos; es `null` si la Tarea no cuelga de ninguno.
   */
  project?: Referencia | null
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
  /** Proyecto donde ocurrio. Solo viaja en `GET /staff/{id}/activity`, que cruza varios. */
  project?: Referencia
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

/** Barra de una tarea dentro del Gantt. */
export interface TareaGantt {
  id: number
  name: string
  start: string | null
  end: string | null
  progress: number
  status: number
  color: string | null
  /** De que tareas depende esta. Viaja dentro de la barra; ver `DependenciaGantt` al final del archivo. */
  dependencies: DependenciaGantt[]
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

// frente: hitos-gantt
/**
 * Dependencia entre dos tareas del Gantt, de `GET /projects/{id}/gantt`.
 *
 * Se lee "esta tarea depende de `depends_on`", asi que la flecha va **desde** `depends_on` **hacia**
 * la tarea que la contiene. Viaja dentro de la barra y no en un bloque aparte de la respuesta: asi
 * `data` sigue siendo la lista de grupos y el diagrama la recorre una sola vez.
 *
 * `type` es un varchar libre de `tblproject_task_dependencies`, que agrega el modulo
 * `project_management_enhancements`. Sus valores convenidos son `linked`, `blocking`, `waiting` y
 * `references`, pero el selector que los ofrecia esta comentado en el panel: en la practica casi
 * siempre llega `null`, y el dibujo no depende de el.
 */
export interface DependenciaGantt {
  depends_on: number
  type: string | null
}

// frente: clientes

/** Una direccion de `tblclients`: la principal, la de facturacion o la de envio. */
export interface DireccionCliente {
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  /** `0` significa "sin pais": no es una fila de `tblcountries`. */
  country_id: number
}

/**
 * Cliente con la direccion de envio.
 *
 * `shipping` solo viaja en `GET /clients/{id}`, no en el listado, asi que la pantalla de detalle
 * trabaja con este tipo y la tabla sigue con `Cliente`.
 */
export interface ClienteConEnvio extends Cliente {
  shipping: DireccionCliente
}

/**
 * Moneda de `GET /lookups`. Los simbolos llegan ya recortados por el backend.
 *
 * Exactamente una tiene `is_default`: es la moneda base de la instalacion, la que usa un cliente con
 * `default_currency: 0`.
 */
export interface Moneda {
  id: number
  name: string
  symbol: string
  is_default: boolean
}

/**
 * Nota de un Cliente (`tblnotes` con `rel_type = 'customer'`).
 *
 * **No es la nota privada de un Espacio**: estas las ve todo el staff, y por eso traen autor. No hay
 * `title` ni `content`; el texto vive en `description`.
 */
export interface NotaCliente {
  id: number
  description: string
  date_contacted: string | null
  date_added: string
  staff: StaffReferencia | null
}

/**
 * Sala de reunion.
 *
 * `panel_token` solo viaja para administradores: es la llave de `/sala/<token>`, la pantalla sin
 * sesion que va colgada en la puerta. Si llegara en el listado que ve todo el equipo dejaria de ser
 * un secreto.
 */
export interface Sala {
  id: number
  name: string
  capacity: number
  location: string | null
  active: boolean
  date_created: string | null
  panel_token?: string
}

/**
 * Reserva de una sala.
 *
 * `start` y `end` son instantes ISO en UTC, no fechas sueltas: una reunion ocurre a una hora.
 *
 * `staff` trae el correo a proposito — el pedido que origino la feature es poder contactar a quien
 * reservo para confirmar si va a usar la sala. Es `null` solo si la persona ya no esta en `tblstaff`.
 */
export interface Reserva {
  id: number
  room_id: number
  room_name: string
  room_capacity: number
  staff_id: number
  staff: { id: number, full_name: string, email: string, profile_image_url: string | null } | null
  title: string
  start: string
  end: string
  /**
   * Quienes del equipo van. Es otra cosa que `attendees`: ese es el numero total y puede incluir
   * gente de afuera —un cliente, un proveedor— que no tiene fila en `tblstaff`.
   */
  participants: StaffReferencia[]
  attendees: number | null
  notes: string | null
  cancelled_at: string | null
  date_created: string | null
}

/**
 * Persona que se puede anotar en una reserva (`GET /rooms/people`).
 *
 * No es `MiembroEquipo`: ese viene de `GET /staff`, que exige el permiso `staff.view` y trae el
 * legajo entero. Para anotar a un compañero alcanza con el nombre y la foto, y no puede depender de
 * un permiso que casi nadie tiene.
 */
export type PersonaDeSala = StaffReferencia

/** Respuesta de `GET /rooms/panel/{token}`: lo minimo que necesita la pantalla de puerta. */
export interface PanelDeSala {
  room: Sala
  now: string
  current: Reserva | null
  upcoming: Reserva[]
}

/** Secciones del portal que un contacto puede ver. Son los `short_name` de Perfex, no ids. */
export type PermisoPortal = 'invoices' | 'estimates' | 'contracts' | 'proposals' | 'support' | 'projects'

/** Las siete banderas de aviso por correo de `tblcontacts`. */
export type AvisosDeContacto = Record<
  'invoice_emails' | 'estimate_emails' | 'credit_note_emails' | 'contract_emails'
  | 'task_emails' | 'project_emails' | 'ticket_emails',
  boolean
>

/**
 * Contacto en su forma completa (`GET /clients/{id}/contacts`).
 *
 * No es `Contacto`: aquel es la forma corta que viaja en `include=contacts` del listado de clientes,
 * y **solo trae los activos**. Este trae tambien los dados de baja —marcados con `active: false`—
 * porque esconderlos hacia que un cliente con contactos inactivos se viera igual que uno sin
 * ninguno, sin forma de reactivarlos ni de saber que existieron.
 */
export interface ContactoCompleto {
  id: number
  client_id: number
  firstname: string
  lastname: string
  full_name: string
  email: string
  phonenumber: string | null
  title: string | null
  is_primary: boolean
  active: boolean
  date_created: string | null
  /** `null` significa que nunca entro al portal, no que entro hace mucho. */
  last_login: string | null
  email_verified_at: string | null
  direction: string | null
  permissions: PermisoPortal[]
  email_notifications: AvisosDeContacto
}

/** Los tres modos del interruptor de correo (`GET|PUT /notifications/settings`). */
export type ModoCorreo = 'apagado' | 'prueba' | 'real'

/**
 * El interruptor de efectos externos del correo. Global de la instalación, no por persona.
 *
 * `warning` viaja resuelto desde la API y la pantalla lo muestra tal cual: apagar esto no apaga el
 * correo que manda el cron del panel clásico ni los recordatorios de vencimiento, que corren en otro
 * proceso.
 */
export interface ConfiguracionCorreo {
  email_mode: ModoCorreo
  email_modes: ModoCorreo[]
  test_recipient: string | null
  email_enabled: boolean
  queue_enabled: boolean
  sender: string
  warning: string
}

/** Estados de una fila de `tblmail_queue` (`GET /notifications/mail-queue`). */
export type EstadoCorreo = 'pending' | 'sending' | 'sent' | 'failed'

/** Una fila del visor de la cola de correo. Solo lectura: no hay reintentar ni borrar. */
export interface FilaColaCorreo {
  id: number
  to: string
  cc: string | null
  bcc: string | null
  subject: string
  from: string
  status: EstadoCorreo
  engine: string
  date: string
  attachments: number
}

/** Los tres estados de `tblwiwo_correo_cliente_cola`. Hoy ninguna fila sale de `pendiente`. */
export type EstadoCorreoCliente = 'pendiente' | 'enviado' | 'error'

/**
 * Una fila de la cola de correo al cliente (`GET /notifications/client-mail-queue`).
 *
 * Solo lectura, y mas radical que la de Perfex: la API no expone reintentar, borrar ni despachar,
 * porque no hay nada que despache.
 *
 * `contact` es `null` cuando el contacto se borro despues de encolar: la fila se muestra igual, con
 * el hueco a la vista, en vez de desaparecer del listado. `payload` es el objeto que se anoto al
 * encolar —nunca el token del enlace, que no se guarda— y llega `null` si la columna trae algo que
 * no es un objeto JSON.
 */
export interface FilaColaCorreoCliente {
  id: number
  contact: { id: number, name: string, email: string } | null
  template: string
  payload: Record<string, unknown> | null
  status: EstadoCorreoCliente
  created_at: string | null
  sent_at: string | null
  error: string | null
}

/** Resultado de `POST /notifications/test`: qué pasó con cada canal al probar un aviso. */
export interface PruebaDeAviso {
  event: string | null
  notification_id: number
  in_app_silenced: boolean
  email_silenced: boolean
  email_mode: ModoCorreo
  email_sent: boolean
  email_delivered_to: string | null
}

/**
 * Las vistas que guardan presets de filtros. Coincide con `RecursoPresetsFiltro::TABLEROS`.
 *
 * No son solo kanban: `projects` es el listado de Proyectos y `timesheets` el registro de horas de
 * un proyecto. Un valor fuera de esta lista devuelve 422.
 *
 * `milestones` y `milestones-tabla` son dos vistas de los mismos Hitos y no comparten presets: el
 * kanban filtra las TAREAS de cada hito y la tabla filtra los HITOS. Un preset cruzado se aplicaria
 * vacio, porque `construirConsulta` poda lo que la definicion de la otra vista no declara.
 */
export type TableroDePreset = 'tasks' | 'milestones' | 'milestones-tabla' | 'projects' | 'timesheets'

/** Un preset de filtros guardado para una vista de lista, privado por staff. */
export interface PresetFiltro {
  id: number
  board: TableroDePreset
  name: string
  filters: Record<string, string[]>
  date_created: string
}

// --- Ajustes de la instalacion (`GET /settings`, `PATCH /settings`) ------------------------------

/**
 * Tipos de dominio que la API publica para cada opcion editable.
 *
 * Son los de `Escritura\Ajuste::EDITABLES`, no los de JavaScript: `entero` viaja como numero,
 * `enum` y `rol` como texto —son claves de un selector, no valores calculables— y `texto` es una
 * cadena libre. Estan enumerados para que un `switch` sobre `type` sea exhaustivo: si el backend
 * agrega un tipo nuevo, el compilador marca los lugares que no lo contemplan en vez de dejar que la
 * pantalla dibuje un control equivocado en silencio.
 */
export type TipoDeAjuste = 'bool' | 'entero' | 'enum' | 'rol' | 'texto'

/**
 * Una opcion editable con su dominio, tal como la publica `Recursos\RecursoAjustes::presentar()`.
 *
 * `value` es `null` cuando la opcion todavia no tiene fila en `tbloptions` — la API lo devuelve
 * explicitamente, no ausente, para que la pantalla pueda mostrar el campo vacio y escribirlo.
 *
 * `min`/`max` solo viajan en `entero` y `options` solo en `enum`: por eso son opcionales y no
 * `null`. La forma del valor depende del tipo y esa union no se puede estrechar sola, asi que quien
 * lea un ajuste usa los lectores de `ajustes.ts` en vez de castear.
 */
export interface AjusteEditable {
  group: string
  type: TipoDeAjuste
  value: string | number | boolean | null
  min?: number
  max?: number
  options?: string[]
}

/**
 * El cuerpo de `GET /settings` y tambien el de la respuesta de `PATCH /settings`.
 *
 * `readonly` son los seis valores de formato que cualquiera necesita para pintar —fecha, hora,
 * separadores, zona— y que la API sirve pero no deja escribir. La lectura pide sesion y nada mas; la
 * escritura exige administrador.
 */
export interface Ajustes {
  editable: Record<string, AjusteEditable>
  readonly: Record<string, string | null>
}

/**
 * Lo que acepta el cuerpo de `PATCH /settings`: un objeto plano `clave -> valor`, sin envoltorio.
 *
 * Se escriben unicamente las claves PRESENTES, asi que mandar solo lo que cambio es lo correcto y no
 * una optimizacion. Una clave fuera de la whitelist —o de solo lectura— corta la operacion entera
 * con 422 antes de tocar la base: no hay escritura a medias.
 */
export type CambiosDeAjustes = Record<string, string | number | boolean>

/**
 * Resultado de escribir ajustes. El error es un valor, no una excepcion: el formulario que lo
 * provoca tiene que poder mostrarlo sin desmontarse.
 *
 * `detalles` es el `details` del 422 —`{ clave: ['no_editable' | 'invalid'] }`— y viaja aparte del
 * mensaje porque el de la API es uno solo para todo el cuerpo ("Hay ajustes que no se pueden
 * escribir"): sin el detalle, quien administra no sabe cual de las claves fue.
 */
export type ResultadoDeAjustes =
  | { ok: true, ajustes: Ajustes }
  | { ok: false, mensaje: string, detalles: Record<string, string[]> }

/**
 * Escribe ajustes por el BFF (`PATCH /settings`).
 *
 * No usa `escribirEnBff()` por una sola razon: ese helper reduce el error a un mensaje y pierde el
 * `details` del 422, que aca es la unica forma de saber que clave rechazo la whitelist.
 *
 * La lectura no esta en este archivo sino en `ajustes.ts`: necesita `pedir()`, que es `server-only`,
 * y a `recursos.ts` lo importan tambien componentes de cliente.
 *
 * @param cambios Solo las claves que cambiaron. La API escribe unicamente las presentes, y rechaza
 *                el cuerpo entero —sin escribir nada— si alguna no esta en la whitelist.
 * @returns Los ajustes releidos por la API, o el error ya legible con su detalle por campo.
 */
export async function guardarAjustes (cambios: CambiosDeAjustes): Promise<ResultadoDeAjustes> {
  let respuesta: Response

  try {
    respuesta = await fetch('/api/bff/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cambios)
    })
  } catch {
    return { ok: false, mensaje: 'No se pudo contactar al servidor. Revisa tu conexión.', detalles: {} }
  }

  if (!respuesta.ok) {
    const error = await leerError(respuesta)

    return { ok: false, mensaje: error.message, detalles: error.details ?? {} }
  }

  try {
    const sobre = await respuesta.json() as { data: Ajustes }

    return { ok: true, ajustes: sobre.data }
  } catch {
    // La API responde el cuerpo completo tambien en el PATCH. Si no llego, la escritura igual ocurrio:
    // decir que fallo mandaria a repetirla.
    return { ok: false, mensaje: 'Los ajustes se guardaron, pero la respuesta no se pudo leer. Recarga la pantalla.', detalles: {} }
  }
}

// frente: plantillas de Espacio
// Bloque agregado por el frente de Plantillas de Proyecto. Va al final a proposito: otros frentes
// editan este mismo archivo y un bloque contiguo hace trivial el merge.

/** Tipo de un item de plantilla, en el vocabulario del contrato (la base guarda `hito`/`proceso`). */
export type TipoItemPlantilla = 'milestone' | 'task'

/**
 * Item de una plantilla de Espacio.
 *
 * **No guarda fechas**: guarda posiciones relativas al inicio del Espacio. Al instanciar, el backend
 * las escala por el cociente entre la duracion pedida y la que declara la plantilla.
 */
export interface ItemPlantilla {
  id: number
  type: TipoItemPlantilla
  /** Id real del hito del que cuelga. `null` en un hito y en una tarea suelta. */
  parent_id: number | null
  /**
   * La misma relacion, por posicion en la lista.
   *
   * Es lo que permite releer una plantilla, editarla y volver a guardarla: la escritura manda la
   * lista entera de una vez, cuando los ids nuevos todavia no existen.
   */
  parent_index: number | null
  name: string
  description: string | null
  /** Distancia en dias desde el inicio del Espacio. Entero >= 0. */
  offset_days: number
  /** Cuanto dura el item. `0` = nace y vence el mismo dia. */
  duration_days: number
  /** Tipo de Proceso (`tbltask_types`). Si el tipo se borra, al instanciar se descarta en silencio. */
  task_type_id: number | null
  /** `staffid` de los responsables. Al instanciar se filtran los dados de baja. */
  assignees: number[]
  /** Posicion declarada: el indice en la lista que se mando. */
  order: number
}

/** Plantilla de Espacio tal como la devuelve `GET /project-templates` (el listado, sin `items`). */
export interface PlantillaEspacio {
  id: number
  name: string
  description: string | null
  /**
   * Duracion esperada declarada por la plantilla: el **denominador** del escalado.
   * `null` o `0` es "sin duracion declarada", y deja el factor en `1`.
   */
  duration_days: number | null
  /** La ven todos los que pueden crear Espacios; editarla y borrarla sigue siendo del autor. */
  is_public: boolean
  created_by: number
  date_created: string
  /** Lo resuelve el servidor (`created_by === yo` o administrador). El frontend no puede deducirlo. */
  can_edit: boolean
}

/** La misma plantilla con sus items, tal como la devuelve `GET /project-templates/{id}`. */
export interface PlantillaEspacioDetallada extends PlantillaEspacio {
  items: ItemPlantilla[]
}
