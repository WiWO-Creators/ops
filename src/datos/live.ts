/**
 * Formas de LIVE: la jornada de quien mira, su medidor y el tablero del equipo.
 *
 * Un modulo aparte de `datos/auditoria.ts` porque contesta otra pregunta. La auditoria mira
 * **navegacion** —quien esta conectado y en que pantalla—; LIVE mira **trabajo declarado**: quien
 * abrio jornada, sobre que la esta midiendo y cuanto lleva. Mezclarlos obligaria a que un tipo
 * sirviera a las dos, y ya paso: `PersonaConectada` vive de `activity` y `route`, que aca no existen.
 */

/** Quien aparece en una fila del tablero. `avatar` y `cargo` pueden faltar en la ficha. */
export interface StaffEnVivo {
  id: number
  name: string
  avatar: string | null
  cargo: string | null
  area: string | null
}

/** Jornada abierta, tal como viaja en el tablero. `seconds` lo calcula el servidor. */
export interface JornadaEnVivo {
  id: number
  started_at: string
  seconds: number
}

/** Lo que se abre al arrancar la jornada. */
export interface JornadaAbierta {
  id: number
  started_at: string
  note: string | null
}

/** Lo que devuelve el cierre. `auto_closed` avisa que la cerro el sistema, no la persona. */
export interface CierreDeJornada {
  id: number
  started_at: string
  ended_at: string
  seconds: number
  auto_closed: boolean
  timers_stopped: number
}

/**
 * El medidor corriendo: sobre que se esta midiendo tiempo ahora.
 *
 * `project` y `task` son excluyentes en la practica —se mide un Espacio o un proceso dentro de el—
 * pero los dos pueden venir: un medidor de proceso tambien dice a que Espacio pertenece. Los dos en
 * `null` es un medidor huerfano, y la interfaz lo muestra igual en vez de esconderlo.
 *
 * `GET /me/jornada` devolvia esto **plano** (`project_id`, `project_name`, `task_id`, `task_name`,
 * con `task_id: 0` por "sin Tarea") y por eso el control pintaba "Sin destino" con cualquier
 * cronometro corriendo. El backend lo unifico: las dos rutas mandan la forma anidada, y un medidor de
 * Tarea ahora tambien trae su `project`, derivado de `rel_type`/`rel_id`. Verificado contra la API.
 */
export interface MedidorEnVivo {
  id: number
  project: { id: number, name: string } | null
  /**
   * `status` es el estado de la Tarea (`task_statuses`), para que el tablero diga en que va lo que
   * se esta midiendo y no solo como se llama.
   *
   * Es opcional porque esta misma forma sirve al `timer` de `GET /me/jornada`, que no lo manda:
   * `RecursoJornadas::medidoresCorriendo()` lo agrego y `Escritura\Jornada::cronometroAbierto()` no.
   * Llega `null` cuando la Tarea esta en la papelera, nunca `0`.
   */
  task: { id: number, name: string, status?: number | null } | null
  start_time: string
  seconds: number
}

/** Ultima señal de vida. Los segundos los calcula el servidor; ver `haceCuanto()`. */
export interface PresenciaEnVivo {
  last_seen: string
  seconds_ago: number
}

/** Una persona en el tablero `GET /live`. */
export interface FilaDeLive {
  staff: StaffEnVivo
  jornada: JornadaEnVivo | null
  medidor: MedidorEnVivo | null
  presencia: PresenciaEnVivo | null
  seconds_today: number
}

/**
 * Hasta donde alcanza a ver quien pidio el tablero, segun la API.
 *
 * `subordinados` y `area` traen el MISMO recorte —la rama del organigrama— y se distinguen por de
 * donde salio: el arbol de `tblareas` o el cargo Director de antes. Ver
 * `Recursos\RecursoJornadas::visibilidad()`.
 */
export type AlcanceApi = 'all' | 'subordinados' | 'area' | 'self'

/** `meta` de `GET /live`. */
export interface MetaDeLive {
  scope: AlcanceApi
}

/**
 * Estado de la jornada propia (`GET /me/jornada`).
 *
 * `measured_seconds` es lo que cubren los medidores y `uncovered_seconds` lo que no: la jornada mide
 * presencia declarada, los medidores miden trabajo imputado, y la diferencia es justamente el dato
 * que la pantalla existe para mostrar.
 *
 * `open` viene en `null` cuando no hay jornada abierta. Es la unica señal que la interfaz mira para
 * decidir entre "Iniciar jornada" y el contador.
 */
export interface EstadoDeJornada {
  open: JornadaEnVivo | null
  seconds: number
  measured_seconds: number
  uncovered_seconds: number
  over_journey: boolean
  timer: MedidorEnVivo | null
}

/**
 * Una linea del resumen de cierre: cuanto se midio y sobre que.
 *
 * `task` en `null` es tiempo medido sobre el Espacio sin bajar a una Tarea —lo que deja el medidor de
 * la cabecera cuando nadie eligio Tarea— y `project` en `null` es una Tarea que no cuelga de ningun
 * Espacio. Los dos casos existen en la base, asi que los dos se nombran en vez de esconderse.
 */
export interface ItemDeResumen {
  project: { id: number, name: string } | null
  task: { id: number, name: string } | null
  seconds: number
  corriendo: boolean
}

/**
 * Resumen del dia para el modal de cierre (`GET /me/jornada/resumen`).
 *
 * `uncovered_seconds` es la razon de existir de esa pantalla: la jornada mide presencia declarada y
 * los medidores miden trabajo imputado, y la diferencia es el tiempo que al dia siguiente nadie sabe
 * a que cargar. Por eso se muestra antes de confirmar el cierre y no despues.
 *
 * La API responde **404** cuando no hay jornada abierta.
 */
export interface ResumenDeJornada {
  jornada: JornadaEnVivo
  measured_seconds: number
  uncovered_seconds: number
  items: ItemDeResumen[]
}

/** Valor por defecto del intervalo del tablero, en segundos. */
const LIVE_POR_DEFECTO = 30

/** Piso y techo. Menos de 10 s martilla la API; mas de 10 min ya no es "en vivo". */
const LIVE_MINIMO = 10
const LIVE_MAXIMO = 600

/**
 * Cada cuantos segundos se repregunta la jornada y el tablero.
 *
 * Misma forma que `intervaloDeLatido()` y por el mismo motivo: la lee el **servidor** y viaja al
 * navegador como prop. No es `NEXT_PUBLIC_` para no abrir una segunda forma de configurar lo mismo,
 * editable desde el `.env` del build en vez del `.env` del servidor.
 *
 * Se acota en vez de fallar: un valor mal escrito no puede dejar el tablero congelado ni convertirlo
 * en un martillo contra la API.
 *
 * @returns el intervalo en segundos, siempre dentro de los limites
 */
export function intervaloDeLive (): number {
  const crudo = Number(process.env.LIVE_INTERVALO_SEGUNDOS)

  if (!Number.isFinite(crudo) || crudo <= 0) return LIVE_POR_DEFECTO

  return Math.min(Math.max(Math.round(crudo), LIVE_MINIMO), LIVE_MAXIMO)
}
