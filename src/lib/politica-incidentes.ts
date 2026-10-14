/**
 * Que errores se registran como incidente y cuales no.
 *
 * Es una politica y no un detalle de cada reportador: el BFF (`api/bff`), la ruta del navegador
 * (`api/incidentes`) y los enganches globales del panel preguntan lo mismo, y repartir la respuesta
 * en tres listas hacia que cada una envejeciera por su lado. Todo lo de aca es puro —no toca `window`
 * ni la red— para poder probarlo sin navegador.
 *
 * El criterio: un incidente es algo que alguien tiene que investigar. Una respuesta que la pantalla
 * ya explica (no tienes permiso, la tarea que pedias se borro) o un error que el navegador emite sin
 * que nada se haya roto (un deploy nuevo, una red que parpadea) solo llena la tabla y tapa los que
 * si importan.
 */

/** Lo que se sabe de un error al decidir si se registra. */
export interface ErrorReportable {
  /** Clase del error: `TypeError`, `ChunkLoadError`, `RespuestaDeApi`. */
  tipo?: string
  mensaje: string
}

/**
 * Mensajes de un `404` que dicen "ese registro ya no existe", y por eso no son un incidente.
 *
 * La API los redacta asi para un id que no esta —«No existe esa tarea.», «No existe ese proceso.»— y
 * para el cronometro que nadie tenia en marcha —«No hay ningun cronometro…»—. Se compara contra el
 * comienzo del mensaje: un `404` con otro texto (`Recurso desconocido`, `Subrecurso desconocido`) es
 * un desajuste entre el panel y la API —el panel pide una ruta que la API no tiene— y ese SI se
 * registra, porque nadie mas se va a enterar.
 */
const REGISTRO_INEXISTENTE = /^no (existe|hay ning)/i

/**
 * `true` si una respuesta de la API es un desenlace previsto y no hay que registrarla.
 *
 * - `403`: la API decidio que la persona no puede hacer eso. La pantalla lo dice (`SinPermiso`) y
 *   esconder lo que no se puede hacer es trabajo del panel, no un incidente.
 * - `404` de un registro que no existe: se borro, o el enlace era viejo.
 *
 * Un `400`, un `404` de ruta desconocida y todo `5xx` devuelven `false`.
 *
 * @param estado el codigo HTTP de la respuesta
 * @param mensaje el `error.message` del envelope, o vacio si no habia
 * @returns `true` cuando no hay nada que investigar
 */
export function esRespuestaEsperada (estado: number, mensaje: string): boolean {
  if (estado === 403) return true
  if (estado === 404) return REGISTRO_INEXISTENTE.test(mensaje.trim())

  return false
}

/**
 * El formato con que el BFF guarda una respuesta de la API: `403 forbidden: Solo el creador…`.
 *
 * Sirve para aplicar la misma politica a un reporte que ya llego como texto, p. ej. el de una
 * pestana abierta con una version vieja del panel.
 */
const RESPUESTA_COMO_TEXTO = /^(\d{3}) [a-z_]+: ([\s\S]*)$/

/** Errores que son una descarga de codigo fallida: el navegador sigue con el JS de un deploy anterior. */
const ERRORES_DE_CHUNK: readonly RegExp[] = [
  /loading (css )?chunk [\w-]+ failed/i,
  /failed to load chunk/i,
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i
]

/**
 * `true` si el error es una descarga de codigo que fallo.
 *
 * Pasa justo despues de un deploy: la pestana abierta pide un archivo con un hash que el servidor ya
 * no tiene. No hay bug que arreglar, solo hay que cargar la version nueva.
 *
 * @param error lo que conto el navegador
 * @returns `true` cuando es un `ChunkLoadError` o su equivalente de cada navegador
 */
export function esErrorDeChunk (error: ErrorReportable): boolean {
  return error.tipo === 'ChunkLoadError' || ERRORES_DE_CHUNK.some((patron) => patron.test(error.mensaje))
}

/** Un `fetch` que no llego al servidor: la red, no la aplicacion. Cada navegador lo dice distinto. */
const RED_CAIDA = /^(network ?error|failed to fetch|load failed|networkerror when attempting to fetch)/i

/**
 * Mensajes de error que el navegador emite sin que nada se haya roto.
 *
 * La View Transitions API aborta la transicion en curso cuando la pantalla cambia antes de que la
 * animacion arranque —dos clics seguidos, una navegacion mientras otra corre— y lo avisa con un
 * `InvalidStateError` que el panel no puede atrapar: la promesa la crea el navegador dentro de la
 * transicion que envuelve la navegacion, no el codigo de la pagina. La pantalla termina dibujada
 * bien y la persona no pierde nada; lo unico que deja es una fila de incidente y un aviso flotante
 * por cada clic apurado, que entierra los errores que si importan.
 *
 * Se compara contra el mensaje y no contra el tipo porque el tipo cambia entre navegadores: Chrome
 * lanza `InvalidStateError` y Safari `AbortError` para el mismo aborto.
 */
const RUIDO_DE_TRANSICIONES: readonly RegExp[] = [
  /transition was aborted/i,
  /view ?transition/i,
  /multiple elements found with view-transition-name/i
]

/**
 * `true` si el error es ruido del navegador y no hay que mostrarlo ni registrarlo.
 *
 * Solo se aplica a los errores que llegan por los enganches globales (`error` y
 * `unhandledrejection`) y a los reportes que llegan a la ruta. Un error que el panel avisa a
 * proposito siempre se muestra: si alguien escribio el `avisarError()`, es porque una accion de la
 * persona quedo a medias.
 *
 * Los `TypeError` de red se filtran por tipo **y** mensaje: «Failed to fetch» como mensaje de otra
 * clase de error si podria ser un bug.
 *
 * @param error lo que conto el navegador
 * @returns `true` para un chunk viejo, una transicion abortada o una red caida
 */
export function esRuidoDelNavegador (error: ErrorReportable): boolean {
  if (esErrorDeChunk(error)) return true
  if (RUIDO_DE_TRANSICIONES.some((patron) => patron.test(error.mensaje))) return true

  return error.tipo === 'TypeError' && RED_CAIDA.test(error.mensaje.trim())
}

/**
 * La decision unica: `true` si el error merece una fila en Incidentes.
 *
 * @param error lo que se sabe del error; si el mensaje trae el formato `403 forbidden: …` del BFF se
 *   aplica ademas la politica de respuestas esperadas
 * @returns `false` para el ruido del navegador y para las respuestas que la pantalla ya explica
 */
export function debeReportarse (error: ErrorReportable): boolean {
  if (esRuidoDelNavegador(error)) return false

  const respuesta = RESPUESTA_COMO_TEXTO.exec(error.mensaje)

  if (respuesta === null) return true

  return !esRespuestaEsperada(Number(respuesta[1]), respuesta[2] ?? '')
}
