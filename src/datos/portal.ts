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
  /** `null` cuando el equipo todavia no engancho ninguna {proceso} al ticket. */
  task: TareaDeTicketPortal | null
}

/**
 * La {proceso} que atiende el ticket, en las dos formas que la API distingue.
 *
 * La forma corta —solo `progress`— es una tarea **interna**: el equipo la abrio para trabajar el
 * ticket pero no la compartio con el cliente, y lo unico que le corresponde ver es cuanto avanzo.
 * Llega sin nombre a proposito, asi que la pantalla tampoco puede inventarle uno: un titulo
 * fabricado seria filtrar el tablero interno con palabras nuestras.
 *
 * Se distinguen por la presencia de `id` (`'id' in tarea`) y no por una bandera aparte, porque asi
 * el tipo impide leer `name` donde la API no lo mando.
 */
export type TareaDeTicketPortal =
  | { progress: number }
  | { id: number, name: string, status: number, progress: number }

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

/**
 * Claves de pestaña que la API puede devolver en `tabs`.
 *
 * Es el contrato de la API, no la lista de lo que el portal dibuja: `VisibilidadContacto::PESTANIAS`
 * sigue emitiendo `contracts`, `proposals`, `estimates` e `invoices`, y el portal las ignora a
 * proposito porque produccion no usa el modulo de ventas. Se declaran para que el tipo describa lo
 * que llega y no lo que nos gustaria que llegara.
 */
export type PestaniaPortal =
  | 'overview'
  | 'tasks'
  | 'timesheets'
  | 'milestones'
  | 'files'
  | 'discussions'
  | 'gantt'
  /** Calendario de entregas. Exige las mismas dos condiciones que `tasks`, pero se exige aparte. */
  | 'calendar'
  /** Meeting Paper. Su flag por proyecto (`wiwo_portal_actas`) nace apagado y se enciende a mano. */
  | 'actas'
  | 'activity'
  | 'tickets'
  | 'contracts'
  | 'proposals'
  | 'estimates'
  | 'invoices'

/**
 * Tarea de un proyecto, ya podada de todo lo interno.
 *
 * Sin `tags`: el portal no publica etiquetas. Son vocabulario interno de gestion y ninguna pantalla
 * del cliente las pinta; declararlas hacia que viajaran en el payload para nada.
 */
export interface TareaPortal {
  id: number
  /** Identificador visible del Proceso. Ver `Proceso.patente`. */
  patente: string | null
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
  counts: Record<string, number>
  /**
   * Aprobacion del cliente, **podada**: sin quien la pidio ni el id del contacto que respondio.
   *
   * Opcional porque el guard de tabla del backend omite el bloque entero cuando `wiwo_core` no esta
   * instalado. El ETA, la desviacion y el estado de SLA **no viajan al portal**: miden al equipo
   * contra su propio compromiso interno y no son asunto del cliente.
   */
  approval?: AprobacionPortal
  /** Solo con `view_task_total_logged_time`. */
  total_logged_seconds?: number
  duration_hm?: string
}

/** El bloque de aprobacion tal como lo ve un contacto. */
export interface AprobacionPortal {
  requerida: boolean
  estado: 'pendiente' | 'aprobada' | 'rechazada' | null
  solicitada_en: string | null
  resuelta_en: string | null
  comentario: string | null
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

/*
 * Los comentarios de una discusion NO estan aca: llegan en la misma forma que al panel
 * (`ComentarioDiscusion` de `recursos.ts`), y el mismo panel los dibuja para los dos sujetos. Una
 * segunda declaracion de la misma forma solo para el portal es lo que hacia que las dos pantallas
 * se pudieran separar sin que nadie se enterara.
 */

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

/*
 * Los grupos del gantt tampoco estan aca, y por lo mismo: `RecursoGantt::paraContacto()` arma las
 * columnas con el mismo presentador que el del equipo, asi que lo que llega es un `GrupoGantt` de
 * `recursos.ts` y lo dibuja el mismo `PanelGantt`. La declaracion que vivia aca decia `grupo:
 * string` y `dependencies: number[]`, que no es lo que la API manda: dos formas del mismo dato se
 * separan, y la que nadie ejecuta se separa primero.
 */

/**
 * El tablero de control de gestión mensual: `GET /portal/gestion?mes=YYYY-MM`.
 *
 * Los quince bloques que arma `Recursos\RecursoGestion` y recorta `FormasDelPortal::GESTION`. Se
 * declara entero acá —y no por pedazos donde se usa— porque es la ruta que más cifras publica de
 * todo el portal, y la lista de lo que llega tiene que poder leerse de arriba abajo.
 *
 * Los `| null` no son descuido ni comodidad: `null` NUNCA es 0. Un mes sin aprobaciones resueltas
 * devuelve `null` en `porcentaje_primera_ronda`, y un cero ahí se leería «no aprobamos nada a la
 * primera». El tipo obliga a que la pantalla decida qué escribir en ese caso.
 */
export interface TableroGestion {
  alcance: AlcanceGestion
  volumen: VolumenGestion
  abiertas_al_cierre: AbiertasAlCierre
  plazos: PlazosGestion
  tiempos: TiemposGestion
  etapas: EtapasGestion
  calidad: CalidadGestion
  cambios: CambiosGestion
  trabas: TrabaGestion[]
  vencidas: VencidaGestion[]
  estancadas: EstancadaGestion[]
  deuda_de_aprobacion: DeudaDeAprobacion
  por_hito: HitoGestion[]
  antiguedad_abiertas: TramoDeAntiguedad[]
  por_espacio: EspacioDeGestion[]
}

/**
 * Si los días por etapa son un dato medido o todavía no se registran.
 *
 * `sin_datos` es el valor de hoy en producción: `tblwiwo_task_status_log` está vacía. La pantalla
 * que reciba esto NO puede dibujar ceros —cuatro ceros se leen «el equipo no tarda nada»—; dice que
 * todavía no se registra.
 */
export type MedicionPorEtapa = 'medida' | 'sin_datos'

/**
 * De dónde salió el estado que tenía cada {proceso} al cierre del mes.
 *
 * Con `estimado` el estado se dedujo del `status` de hoy, y los cuatro cubos PUEDEN NO SUMAR el
 * total: una {proceso} que hoy dice Completo pero al cierre seguía abierta no se clasifica en
 * ninguno, porque se sabe que el cubo es falso y no cuál era el verdadero.
 */
export type EstadoAlCierre = 'medido' | 'estimado'

/** De quién depende destrabar un {proceso} bloqueado. Enum de la migración 0699, no una persona. */
export type ResponsableDeTraba = 'cliente' | 'equipo' | 'tercero'

/**
 * Una mediana con su tamaño de muestra.
 *
 * `n` viaja al lado por una sola razón: para que la pantalla pueda decidir NO dibujar la mediana.
 * Una mediana de dos {procesos} no es una mediana, es una anécdota.
 */
export interface ResumenEstadistico {
  n: number
  mediana: number | null
  p90: number | null
}

export interface AlcanceGestion {
  /** `YYYY-MM`. */
  mes: string
  /** `YYYY-MM-DD`, primer día del mes. */
  desde: string
  /** `YYYY-MM-DD`, último día del mes. */
  hasta: string
  /** `false` en el mes en curso: lo que se ve todavía se puede mover. */
  cerrado: boolean
  /** Instante hasta el que se midió: el fin del mes, o ahora si el mes está en curso. */
  medido_hasta: string
  dias_del_mes: number
  medicion_por_etapa: MedicionPorEtapa
  espacios: Array<{ id: number, name: string }>
}

export interface VolumenGestion {
  recibidas: number
  cerradas: number
  abiertas_al_cierre: number
}

/**
 * Los cuatro cubos de estado más `bloqueadas`.
 *
 * `bloqueadas` es ORTOGONAL a los cubos —una {proceso} bloqueada sigue teniendo su estado y ya se
 * contó en su cubo—, así que los cinco números no suman el total y no se pueden apilar.
 */
export interface AbiertasAlCierre {
  produccion: number
  revision_interna: number
  revision_vp: number
  terminado: number
  bloqueadas: number
  estado_al_cierre: EstadoAlCierre
}

export interface PlazosGestion {
  comprometidas: number
  en_plazo: number
  /** `null` si no había nada comprometido. No es 0: «cero en plazo» es lo contrario de «nada». */
  porcentaje_en_plazo: number | null
  vencidas_al_cierre: number
  atraso_dias: { n: number, mediana: number | null, suma: number | null }
}

export interface TiemposGestion {
  /** Días que el cliente tardó en responder una aprobación. */
  respuesta_cliente: ResumenEstadistico
  /** Días hasta la primera solicitud de aprobación. */
  entrega_equipo: ResumenEstadistico
  /** Otra población: {procesos} sin aprobación requerida. No se mezcla con la anterior. */
  entrega_equipo_sin_aprobacion: ResumenEstadistico
  punta_a_punta: ResumenEstadistico
}

export interface EtapasGestion {
  medicion: MedicionPorEtapa
  /** El «tiempo acordado» del ciclo completo, en días HÁBILES. `null` si nadie acordó ninguno. */
  compromiso_dias: number | null
  /** Siempre `true`: recuerda que el compromiso no está en la misma unidad que los cubos. */
  compromiso_dias_habiles: boolean
  /** Días CORRIDOS del ciclo completo. Es lo único comparable contra `compromiso_dias`. */
  ciclo: ResumenEstadistico
  cubos: CuboDeEtapa[]
}

export interface CuboDeEtapa extends ResumenEstadistico {
  cubo: string
  rotulo: string
}

export interface CalidadGestion {
  resueltas: number
  aprobadas_primera_ronda: number
  porcentaje_primera_ronda: number | null
  rondas_promedio: number | null
}

export interface CambiosGestion {
  entradas_no_planificadas: number
  /** Siempre `true`: el número es un proxy y la pantalla tiene que decirlo. */
  estimado: boolean
}

/** Los campos que comparten las tres listas de {procesos} del tablero. */
export interface ProcesoDeGestion {
  id: number
  patente: string | null
  name: string
  status: number
  project: { id: number, name: string | null }
  date_added: string | null
  due_date: string | null
  date_finished: string | null
}

export interface TrabaGestion extends ProcesoDeGestion {
  /** Escrito para que el cliente lo lea: es el motivo del bloqueo, no una nota interna. */
  motivo: string
  accion_necesaria: string | null
  responsable: ResponsableDeTraba | null
  bloqueado_en: string | null
  dias_bloqueada: number | null
}

export interface VencidaGestion extends ProcesoDeGestion {
  /** Contra `due_date`, que es la fecha que el cliente ya tiene en pantalla. */
  dias_de_atraso: number
}

export interface EstancadaGestion extends ProcesoDeGestion {
  /** La ventana con la que se preguntó «se movió», no la fecha del último movimiento. */
  dias_sin_movimiento: number
  dias_abierta: number | null
}

/**
 * Los días que el trabajo pasó esperando al PROPIO cliente.
 *
 * `porcentaje_del_mes` es sobre el tiempo disponible de los {procesos} que esperaron (`n` × días
 * del mes), no sobre los días del mes a secas: con cinco esperando daría 400%.
 */
export interface DeudaDeAprobacion {
  dias: number | null
  n: number
  dias_del_mes: number
  porcentaje_del_mes: number | null
}

/** `id` y `name` en `null` es la fila de lo que no cuelga de ningún {hito}. */
export interface HitoGestion {
  id: number | null
  name: string | null
  project_id: number | null
  comprometidas: number
  en_plazo: number
  cerradas: number
  abiertas_al_cierre: number
}

export interface TramoDeAntiguedad {
  rango: string
  desde_dias: number
  /** `null` es el tramo abierto de la derecha. */
  hasta_dias: number | null
  total: number
}

/** Sólo conteos: son lo único aditivo. Una mediana por {espacio} no se compone con la de otro. */
export interface EspacioDeGestion {
  id: number
  name: string
  recibidas: number
  cerradas: number
  abiertas_al_cierre: number
  bloqueadas: number
  comprometidas: number
  en_plazo: number
  vencidas_al_cierre: number
}
