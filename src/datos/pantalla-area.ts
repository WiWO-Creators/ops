/**
 * El contrato de `GET /public/display/{token}`: lo que la API manda a un televisor colgado en la
 * pared de un area.
 *
 * Solo tipos. La logica que decide que se muestra y en que orden vive en
 * `src/dominio/pantalla-area.ts`, que es puro y se prueba sin navegador.
 *
 * === POR QUE NO HAY DURACIONES ACA ===
 *
 * Todo lo que corre —una jornada, un cronometro— viaja como el INSTANTE en que empezo, y la pantalla
 * cuenta los segundos en el navegador. Es una decision del backend con una razon concreta: si la API
 * mandara los segundos, cada respuesta seria distinta de la anterior aunque no hubiera pasado nada, y
 * el `ETag` con el que la API contesta `304` no ahorraria un solo byte. Ver `Respuesta::datosCacheables()`.
 *
 * Por eso tambien viaja `server_time`: un televisor barato tiene el reloj mal a menudo, a veces en
 * UTC, y los contadores se cuentan contra el reloj del servidor y no contra el del aparato.
 */

/** Una persona con jornada abierta. */
export interface PersonaTrabajando {
  staff_id: number
  name: string
  avatar: string | null
  cargo: string | null
  /** ISO 8601. Desde cuando esta la jornada abierta. */
  jornada_started_at: string | null
  /** ISO 8601. Ultimo latido de presencia, o `null` si nunca abrio el panel. */
  last_seen_at: string | null
}

/** Un cronometro corriendo, con lo que esta midiendo. */
export interface CronometroEnPantalla {
  staff_id: number
  name: string
  avatar: string | null
  /** ISO 8601. Desde cuando corre. */
  started_at: string | null
  /** `null` cuando se mide contra un Proyecto sin Tarea, o cuando la Tarea esta en la papelera. */
  task: { id: number, name: string | null } | null
  project: { id: number, name: string } | null
}

/** Un valor de catalogo: estado o prioridad, con el color que ya usa el panel. */
export interface ValorDeCatalogo {
  id: number
  name: string
  color: string | null
}

/** Avance medido en items de checklist. `percent` es `null` cuando no hay checklist. */
export interface AvanceEnPantalla {
  checklist_total: number
  checklist_done: number
  percent: number | null
}

/** Una Tarea abierta del area. */
export interface TareaEnPantalla {
  id: number
  name: string
  status: ValorDeCatalogo | null
  priority: ValorDeCatalogo | null
  /** `YYYY-MM-DD`, o `null` si no tiene fecha. */
  due_date: string | null
  overdue: boolean
  progress: AvanceEnPantalla
  project: { id: number, name: string } | null
  assignees: Array<{ staff_id: number, name: string, avatar: string | null }>
}

/** Un Proyecto donde el area tiene trabajo abierto. */
export interface ProyectoEnPantalla {
  id: number
  name: string
  /** `YYYY-MM-DD`, o `null`. */
  deadline: string | null
  /** 0 a 100, calculado sobre las Tareas: `tblprojects.progress` miente y no se usa. */
  progress: number
  procesos_abiertos: number
  procesos_atrasados: number
}

/** Los contadores de la portada. */
export interface ContadoresDePortada {
  personas: number
  jornadas_abiertas: number
  cronometros_corriendo: number
  procesos_abiertos: number
  procesos_atrasados: number
  espacios_activos: number
}

/**
 * Las cinco escenas del contrato, discriminadas por `kind`.
 *
 * Llegan SIEMPRE las cinco y en este orden, aunque `items` venga vacio: es lo que deja distinguir
 * "nadie esta midiendo" de "no cargo la lista".
 */
export type EscenaDeApi =
  | { kind: 'portada', counts: ContadoresDePortada }
  | { kind: 'trabajando', items: PersonaTrabajando[] }
  | { kind: 'cronometros', items: CronometroEnPantalla[] }
  | { kind: 'procesos', items: TareaEnPantalla[], total: number }
  | { kind: 'espacios', items: ProyectoEnPantalla[] }

/** El bloque `data` de la respuesta. */
export interface PaqueteDePantalla {
  area: { id: number, name: string }
  scenes: EscenaDeApi[]
}

/**
 * El bloque `meta`.
 *
 * **No llega en un `304`**, que es lo normal cuando nada cambio: ahi la pantalla se queda con el
 * paquete que ya tenia y con el `meta` de la ultima lectura completa. Por eso nada critico puede
 * depender de recibirlo en cada vuelta.
 */
export interface MetaDePantalla {
  /** ISO 8601, en la zona del negocio. Contra este reloj se cuentan los contadores. */
  server_time: string | null
  /** Zona IANA, para formatear sin confiar en el reloj del televisor. */
  timezone: string
  /** Cada cuantos segundos volver a preguntar. Lo decide el backend: ver `PantallaDeArea::meta()`. */
  poll_after_seconds: number
  /** Cuanto dura cada escena, por defecto. Un `?escena=` en la URL manda sobre esto. */
  scene_seconds: number
}

/** La respuesta entera. */
export interface RespuestaDePantalla {
  data: PaqueteDePantalla
  meta?: MetaDePantalla
}
