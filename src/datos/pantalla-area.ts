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

/**
 * La gente con jornada abierta en TODA la compañia, que viaja dentro de la escena `trabajando`.
 *
 * === POR QUE SE SOLAPA CON `items` A PROPOSITO ===
 *
 * Quien pertenece al area sale en las dos listas: arriba entre los 42 de la empresa y abajo entre los
 * 8 del area. No es un descuido del backend ni algo que la pantalla tenga que deduplicar. Son dos
 * preguntas distintas —"cuanta gente hay trabajando en WiWO" y "cuanta hay en Content Studio"— y cada
 * tabla lleva su total real, asi que restarle el area a la empresa daria un numero que no contesta
 * ninguna de las dos.
 *
 * En la **pantalla global** (`area.id === null`) la de arriba es la unica que trae gente: `items`
 * llega vacio y `total` en cero, porque ahi no hay area de la que hablar.
 */
export interface TrabajandoEnLaCompania {
  items: PersonaTrabajando[]
  /** El conteo real. Es mayor que `items.length` cuando el backend recorta la lista. */
  total: number
}

/**
 * La escena `trabajando`, que es la unica con DOS listas.
 *
 * Tiene nombre propio —y no vive suelta dentro de la union— porque el dominio la pagina aparte y
 * necesita poder nombrar su tipo: ver `paginarTrabajando()` en `src/dominio/pantalla-area.ts`.
 */
export interface EscenaTrabajandoDeApi {
  kind: 'trabajando'
  /** La gente del AREA de esta pantalla. Vacia en la pantalla global. */
  items: PersonaTrabajando[]
  /** El conteo real del area. Mayor que `items.length` cuando el backend recorta. */
  total: number
  /** La gente de TODA la compañia. Ver `TrabajandoEnLaCompania`. */
  empresa: TrabajandoEnLaCompania
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

/** Los tres formatos de un anuncio. Los mismos que valida la API. */
export type TipoDeAnuncioEnPantalla = 'imagen' | 'imagen_con_texto' | 'texto'

/**
 * Un anuncio, ya filtrado por vigencia y ordenado por la API.
 *
 * Es lo unico de toda la pantalla que escribio una persona: el resto se calcula solo a partir de la
 * actividad del area. Por eso cada anuncio es una **pantalla propia** y no una fila de una lista — un
 * aviso con una foto de la terraza no se lee en la quinta linea de una tabla.
 *
 * Los tres formatos tienen su coherencia garantizada por la API, que contesta 422 al cargarlos:
 *
 * - `imagen`: `titulo` y `texto` son **siempre** `null`, y `image_url` nunca.
 * - `imagen_con_texto`: los tres vienen.
 * - `texto`: `image_url` es **siempre** `null`.
 *
 * La pantalla no vuelve a comprobarlo, pero tampoco lo asume al dibujar: cada campo se pinta si esta,
 * asi que un contrato que cambie deja la escena fea y nunca rota.
 */
export interface AnuncioEnPantalla {
  id: number
  tipo: TipoDeAnuncioEnPantalla
  titulo: string | null
  texto: string | null
  /**
   * URL absoluta de la imagen, servida por la ruta publica del televisor.
   *
   * Depende solo del codigo de la pantalla y del id del anuncio, o sea que es estable: cambiar la
   * imagen de un anuncio NO cambia la URL, asi que el `ETag` del paquete sigue contestando 304.
   */
  image_url: string | null
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
 * Una escena del paquete, discriminada por `kind`.
 *
 * **Solo llegan las que el area dejo encendidas**, en el orden configurado desde el panel, y cada una
 * con su propia duracion en `seconds`. Una escena apagada no viaja: lo que no se muestra tampoco se
 * publica.
 *
 * Dentro de una encendida, en cambio, `items` viaja aunque venga vacio. La distincion es la que hace
 * util a la pantalla: "nadie esta midiendo" se dice en pantalla, "esta escena no se muestra" se
 * saltea, y las dos cosas serian iguales si la API filtrara por contenido.
 *
 * === `trabajando` TRAE DOS LISTAS ===
 *
 * Es la unica escena con dos tablas: la compañia entera arriba y el area de la pantalla abajo. Las dos
 * viajan en la misma escena y no en dos, porque se leen juntas —"la empresa esta a medio gas y lo mio
 * esta lleno" es una sola frase— y porque partirlas en dos escenas duplicaria la vuelta entera para
 * decir lo mismo. Ver `TrabajandoEnLaCompania`.
 *
 * === `momento` NO TRAE NADA, Y ES A PROPOSITO ===
 *
 * Viaja con su `kind` y su `seconds` y ni un campo mas. El saludo segun la hora lo resuelve el
 * televisor con `meta.timezone`, porque calcularlo en el servidor haria que el paquete cambiara al
 * cruzar cada franja y que el `ETag` fallara justo a las nueve de la maniana, cuando toda la oficina
 * esta mirando. Ver `src/dominio/momento-del-dia.ts`.
 */
export type EscenaDeApi = { seconds?: number } & (
  | { kind: 'portada', counts: ContadoresDePortada }
  | EscenaTrabajandoDeApi
  | { kind: 'cronometros', items: CronometroEnPantalla[] }
  | { kind: 'procesos', items: TareaEnPantalla[], total: number }
  | { kind: 'espacios', items: ProyectoEnPantalla[] }
  | { kind: 'momento' }
  | { kind: 'anuncios', items: AnuncioEnPantalla[] }
)

/** El bloque `data` de la respuesta. */
export interface PaqueteDePantalla {
  /**
   * De quien es la pantalla.
   *
   * **`id` en `null` significa que la pantalla es global**: la de toda la compañia, que convive con
   * las de area y no las reemplaza. En ese caso `name` trae el titulo configurado o, si no hay, el
   * nombre de la compañia — asi que se dibuja igual y lo unico que cambia son los rotulos que dicen
   * "del área", que ahi no significarian nada.
   */
  area: { id: number | null, name: string }
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
  /**
   * Duracion de respaldo, en segundos.
   *
   * Cada escena trae la suya en `seconds`, configurada por area. Esto solo cubre el caso de una
   * respuesta incompleta, y un `?escena=` en la URL manda sobre las dos.
   */
  scene_seconds: number
}

/** La respuesta entera. */
export interface RespuestaDePantalla {
  data: PaqueteDePantalla
  meta?: MetaDePantalla
}
