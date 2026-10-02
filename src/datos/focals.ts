/**
 * Los datos de la pantalla de Focals: el semáforo de las cuentas de las que uno responde.
 *
 * Vive en su propio archivo y no en `datos/recursos.ts` por el mismo motivo que `datos/auditoria.ts`:
 * no es un recurso de negocio —nadie crea ni edita un semáforo— sino la lectura que sostiene una
 * pantalla. `ScoreCliente` sí está en `recursos.ts`, y desde acá se reusa: el score por Proyecto es
 * la misma forma con `project_id`/`espacio` donde el otro trae `client_id`/`cliente`, y repetir los
 * tipos de las tres señales acá sería tener dos definiciones del mismo contrato.
 *
 * **Las lecturas no se piden acá.** No importa `datos/servidor`: las dos llamadas del semáforo las hace
 * la página, que es un Server Component. La única petición de este archivo es {@link pedirEstado},
 * que recibe el `fetch` por parámetro. Así todo se puede probar con `node --test` sin montar Next.
 */

import { ASISTENTE } from '../dominio/glosario.ts'
import { mensajeDeLectura } from './cliente.ts'
import type { PuntoScoreCliente, ScoreCliente, SemaforoCliente } from './recursos'

/** El parrafo con que la IA explica un semáforo. `null` mientras nadie lo haya pedido. */
export interface EstadoDeSalud {
  texto: string
  /** Instante en que se redactó, `YYYY-MM-DD HH:MM:SS`. */
  generado_en: string
  /**
   * `false` cuando las señales se movieron después de redactarlo. El texto sigue viajando —dice de
   * cuándo es y es mejor que nada—, pero cita números que ya cambiaron.
   */
  vigente: boolean
}

/**
 * La foto diaria del semáforo de un Proyecto, tal como la devuelven `GET /scores/espacios` y
 * `GET /scores/espacios/{projectId}`.
 *
 * Es la MISMA forma que `ScoreCliente` —mismo `score`, mismo `semaforo`, mismas tres señales con los
 * mismos pesos— para que la pantalla no tenga que aprender dos formatos. Lo único que cambia es qué
 * se está puntuando y el `estado`, que en el del cliente no existe.
 */
export interface ScoreEspacio {
  project_id: number
  /** Nombre del Proyecto, resuelto por el servidor para no pedir la ficha aparte. */
  espacio: string | null
  client_id: number | null
  cliente: string | null
  /** Día de la foto, `YYYY-MM-DD`. El cálculo corre una vez al día. */
  fecha: string
  score: number | null
  semaforo: SemaforoCliente
  /** Puntos ganados o perdidos contra la foto anterior. `null` si no hay con qué comparar. */
  variacion: number | null
  procesos: number
  /** Las mismas tres señales del score de cliente, con los mismos pesos. */
  senales: ScoreCliente['senales']
  estado: EstadoDeSalud | null
  /** Solo en `GET /scores/espacios/{projectId}`: las últimas fotos, de la más vieja a la más nueva. */
  historia?: PuntoScoreCliente[]
}

/** Lo que devuelve `POST /ia/proyectos/{id}/estado`. */
export interface EstadoRedactado extends EstadoDeSalud {
  /** `true` cuando el texto ya estaba pagado sobre estas mismas señales y no se llamó al modelo. */
  reutilizado: boolean
}

/** Un cliente del que uno es focal, con su semáforo y el de cada uno de sus Proyectos. */
export interface CuentaFocal {
  cliente: ScoreCliente
  espacios: ScoreEspacio[]
}

/** `GET /scores?focal=me`: los clientes de los que esta persona responde. */
export const RUTA_CLIENTES_FOCAL = '/scores?focal=me'

/** `GET /scores/espacios?focal=me`: los Proyectos de esos mismos clientes, de una sola vez. */
export const RUTA_ESPACIOS_FOCAL = '/scores/espacios?focal=me'

/**
 * `GET /scores`: la cartera entera, para quien la pantalla es de supervision y no la propia.
 *
 * Es la MISMA ruta sin `?focal=me`, no un endpoint nuevo ni un permiso nuevo: la API ya le devuelve
 * todos los clientes visibles a quien alcanza el escalon (`V1::scoresRuta()`). Lo unico que cambia
 * es que la pantalla deja de pedirle el recorte.
 */
export const RUTA_CLIENTES_TODOS = '/scores'

/** `GET /scores/espacios`: los Proyectos de esa misma cartera entera. */
export const RUTA_ESPACIOS_TODOS = '/scores/espacios'

/**
 * Cuánto se espera la respuesta de `POST /ia/proyectos/{id}/estado` antes de rendirse.
 *
 * Es más largo que el de una lectura porque detrás hay una llamada a un modelo. Existe como
 * constante para que quien lo necesite lo ajuste en un solo lugar.
 */
export const TIEMPO_MAXIMO_DE_ESTADO_MS = 60_000

/**
 * `POST /ia/proyectos/{id}/estado`, para el BFF (sin barra inicial), con el id ya escapado.
 *
 * @param espacioId el Proyecto cuyo estado se quiere redactar
 * @returns la ruta sin la base del BFF
 * @throws RangeError si el id no es un entero mayor que 0: un `NaN` o un negativo armarían una ruta
 *   que el BFF rechaza sin que se entienda por qué.
 */
export function rutaDeEstado (espacioId: number): string {
  if (!Number.isInteger(espacioId) || espacioId <= 0) {
    throw new RangeError(`El id del Proyecto debe ser un entero mayor que 0, y llegó ${String(espacioId)}.`)
  }

  return `ia/proyectos/${encodeURIComponent(String(espacioId))}/estado`
}

/** Un recuento por tramo con los cuatro tramos presentes y en cero. */
export function tramosEnCero (): Record<SemaforoCliente, number> {
  return { verde: 0, amarillo: 0, rojo: 0, sin_datos: 0 }
}

/**
 * Lo que devuelve {@link pedirEstado}: el párrafo, o el motivo por el que no hay.
 *
 * `esperado` distingue un desenlace normal del sistema —la IA apagada, la foto del día que aún no
 * corrió, la cuota agotada— de una falla real. La pantalla puede mostrar los primeros en tono neutro
 * y reservar el de error para los segundos.
 */
export type ResultadoDeEstado =
  | { ok: true, estado: EstadoDeSalud }
  | { ok: false, error: string, esperado: boolean }

/** Lo que se puede ajustar o inyectar al pedir un estado. */
export interface OpcionesDePedirEstado {
  /** Se dispara cuando quien pidió ya no espera la respuesta (por ejemplo, al desmontarse). */
  senal?: AbortSignal
  /** El `fetch` a usar; sirve para probar sin red. */
  traer?: typeof fetch
  /** Tiempo máximo de espera; por defecto {@link TIEMPO_MAXIMO_DE_ESTADO_MS}. */
  tiempoMaximoMs?: number
}

/** Lo que se dice cuando el servidor contestó bien pero con algo que la pantalla no entiende. */
const MENSAJE_RESPUESTA_ILEGIBLE = 'El servidor respondió algo que no se pudo leer.'

/** Los códigos con los que el sistema dice "esto no está roto" (ver {@link mensajeDeFalloDeEstado}). */
const ESTADOS_HTTP_ESPERADOS: readonly number[] = [404, 409, 429]

/**
 * Pide el párrafo al BFF y devuelve el estado, o el motivo por el que no hay.
 *
 * No usa `escribirEnBff` porque acá hace falta el **código** de la respuesta y no solo su mensaje:
 * un 404 significa "la IA está apagada", un 409, "todavía no corrió el cálculo del día" y un 429,
 * "se acabó la cuota". Esos tres se cuentan con otras palabras (ver {@link mensajeDeFalloDeEstado}) y
 * **no** pasan por `mensajeDeLectura`, que los trataría como una falla: registraría el incidente y
 * lanzaría un aviso en cada clic.
 *
 * Valida la forma de `data` antes de devolverla: un cuerpo que no trae `texto` ni `vigente` rompería
 * la tarjeta más abajo, lejos de su causa.
 *
 * @param espacioId el Proyecto cuyo estado se quiere redactar
 * @param opciones la señal de cancelación, el `fetch` y el tiempo máximo
 * @returns el estado, o el error con la línea que lo explica; nunca lanza por fallos de red
 * @throws RangeError si `espacioId` no es un entero mayor que 0
 */
export async function pedirEstado (
  espacioId: number,
  opciones: OpcionesDePedirEstado = {}
): Promise<ResultadoDeEstado> {
  const ruta = rutaDeEstado(espacioId)
  const { senal, traer = fetch, tiempoMaximoMs = TIEMPO_MAXIMO_DE_ESTADO_MS } = opciones
  const limite = AbortSignal.timeout(tiempoMaximoMs)
  let respuesta: Response

  try {
    respuesta = await traer(`/api/bff/${ruta}`, {
      method: 'POST',
      signal: senal === undefined ? limite : AbortSignal.any([senal, limite])
    })
  } catch (fallo) {
    return fallaAlContactar(fallo)
  }

  if (!respuesta.ok) return await falloDeRespuesta(respuesta, ruta)

  return await estadoDeRespuesta(respuesta)
}

/** El resultado cuando el `fetch` lanzó: se acabó el tiempo, se canceló, o no hay red. */
function fallaAlContactar (fallo: unknown): ResultadoDeEstado {
  const nombre = fallo instanceof DOMException ? fallo.name : ''

  if (nombre === 'TimeoutError') {
    return { ok: false, error: `${ASISTENTE} tardó demasiado en responder. Prueba de nuevo en un rato.`, esperado: false }
  }

  if (nombre === 'AbortError') return { ok: false, error: 'Se canceló la petición.', esperado: true }

  return { ok: false, error: 'No se pudo contactar al servidor. Revisa tu conexión.', esperado: false }
}

/**
 * El resultado de una respuesta con error.
 *
 * El cuerpo de 404, 409 y 429 ni se lee: el mensaje del servidor haría pasar por falla un desenlace
 * normal. El resto sí pasa por `mensajeDeLectura`, que registra los 5xx y dice "sesión cerrada" en
 * los 401.
 */
async function falloDeRespuesta (respuesta: Response, ruta: string): Promise<ResultadoDeEstado> {
  if (ESTADOS_HTTP_ESPERADOS.includes(respuesta.status)) {
    return { ok: false, error: mensajeDeFalloDeEstado(respuesta.status, ''), esperado: true }
  }

  const mensaje = await mensajeDeLectura(respuesta, { metodo: 'POST', ruta: `/api/bff/${ruta}` })

  return { ok: false, error: mensajeDeFalloDeEstado(respuesta.status, mensaje), esperado: false }
}

/** Lee y valida el cuerpo de una respuesta correcta. */
async function estadoDeRespuesta (respuesta: Response): Promise<ResultadoDeEstado> {
  let sobre: unknown

  try {
    sobre = await respuesta.json()
  } catch {
    return { ok: false, error: MENSAJE_RESPUESTA_ILEGIBLE, esperado: false }
  }

  const data = typeof sobre === 'object' && sobre !== null ? (sobre as { data?: unknown }).data : undefined

  if (!esEstadoRedactado(data)) return { ok: false, error: MENSAJE_RESPUESTA_ILEGIBLE, esperado: false }

  return { ok: true, estado: { texto: data.texto, generado_en: data.generado_en, vigente: data.vigente } }
}

/** `true` si `valor` trae un párrafo no vacío, su fecha y si sigue vigente. */
function esEstadoRedactado (valor: unknown): valor is EstadoRedactado {
  if (typeof valor !== 'object' || valor === null) return false

  const { texto, generado_en: generadoEn, vigente } = valor as Record<string, unknown>

  return typeof texto === 'string' && texto.trim() !== '' &&
    typeof generadoEn === 'string' && typeof vigente === 'boolean'
}

/**
 * Une las dos listas en una por cliente, en el orden en que llegaron los clientes.
 *
 * El orden lo pone el servidor —del peor score al mejor, y los `sin_datos` al final—, y acá no se
 * reordena: la pantalla mostraría un orden distinto del que el listado declara. Lo que sí se ordena
 * son los Proyectos dentro de cada cliente, porque llegan mezclados entre todos.
 *
 * Un Proyecto cuyo `client_id` no esté entre los clientes se descarta en vez de inventarle una
 * tarjeta: significaría que las dos llamadas vieron carteras distintas, y media pantalla con un
 * cliente sin nombre es peor que un Proyecto de menos.
 *
 * @param clientes lo que devolvió `GET /scores?focal=me`
 * @param espacios lo que devolvió `GET /scores/espacios?focal=me`
 * @returns una entrada por cliente, con sus Proyectos ya ordenados
 */
export function agruparPorCliente (clientes: ScoreCliente[], espacios: ScoreEspacio[]): CuentaFocal[] {
  const porCliente = new Map<number, ScoreEspacio[]>(clientes.map((c) => [c.client_id, []]))

  for (const espacio of espacios) {
    if (espacio.client_id === null) continue

    porCliente.get(espacio.client_id)?.push(espacio)
  }

  return clientes.map((cliente) => ({
    cliente,
    espacios: ordenarPorSemaforo(porCliente.get(cliente.client_id) ?? [])
  }))
}

/**
 * Del peor al mejor, y lo que no se puede puntuar al final.
 *
 * Es el mismo criterio con el que el servidor ordena los listados. Un `sin_datos` arriba de todo
 * ocuparía el lugar de lo urgente sin ser urgente: no es lo peor, es lo que no se sabe.
 *
 * @param espacios los Proyectos de un cliente, en cualquier orden
 * @returns una copia ordenada; el arreglo de entrada no se toca
 */
export function ordenarPorSemaforo (espacios: ScoreEspacio[]): ScoreEspacio[] {
  return [...espacios].sort((uno, otro) => {
    if (uno.score === null && otro.score === null) return nombreDe(uno).localeCompare(nombreDe(otro), 'es')
    if (uno.score === null) return 1
    if (otro.score === null) return -1
    if (uno.score !== otro.score) return uno.score - otro.score

    return nombreDe(uno).localeCompare(nombreDe(otro), 'es')
  })
}

/**
 * Cuántos Proyectos hay en cada tramo del semáforo.
 *
 * Es lo que deja leer una cuenta sin abrirla: "4 Proyectos, 3 en rojo" dice más que el promedio de
 * sus scores, que además no es el score del cliente —el servidor lo calcula sobre las Tareas, no
 * promediando Proyectos—.
 *
 * @param espacios los Proyectos de un cliente
 * @returns la cuenta de cada tramo, con los cuatro tramos siempre presentes
 */
export function contarPorTramo (espacios: ScoreEspacio[]): Record<SemaforoCliente, number> {
  const cuenta = tramosEnCero()

  for (const espacio of espacios) cuenta[espacio.semaforo] += 1

  return cuenta
}

/** El nombre del Proyecto, o una marca legible si el servidor no lo trae. */
export function nombreDe (espacio: ScoreEspacio): string {
  return espacio.espacio ?? `#${espacio.project_id}`
}

/**
 * Los nombres de quienes responden por una cuenta, listos para dibujar.
 *
 * Se filtran los vacíos porque un `full_name` en blanco —una persona dada de alta sin nombre— pinta
 * una insignia sin texto, que se lee como un error de la pantalla y no como lo que es. Una API vieja
 * que todavía no manda `focales` cae en el mismo lugar que un cliente sin focal nombrado: lista
 * vacía, y la pantalla lo dice con palabras.
 *
 * @param cliente la fila del semáforo, tal como llegó de `GET /scores`
 * @returns un nombre por persona, en el orden de alta que puso el servidor
 */
export function nombresDeFocales (cliente: Pick<ScoreCliente, 'focales'>): string[] {
  return (cliente.focales ?? [])
    .map((focal) => focal.full_name.trim())
    .filter((nombre) => nombre !== '')
}

/**
 * Qué decir cuando `POST /ia/proyectos/{id}/estado` no devolvió un párrafo.
 *
 * Los tres primeros códigos se traducen acá y no se muestra el mensaje del servidor porque los tres
 * significan "esto no está roto": la IA está apagada, todavía no corrió el cálculo del día, o se
 * acabó la cuota. Decirlo con las palabras del servidor —`Recurso desconocido: "ia"`— parece un
 * error de la aplicación, y manda a alguien a buscar un problema que no existe.
 *
 * El 404 es inconfundible: con el interruptor apagado la rama `/ia/*` entera responde 404, y la
 * falta de foto del día viaja como 409 justamente para no mezclarse con eso.
 *
 * @param estadoHttp el código con el que respondió el BFF
 * @param mensajeApi el mensaje del contrato, para lo que no está previsto acá
 * @returns una línea para mostrar debajo del semáforo, que sigue pintado
 */
export function mensajeDeFalloDeEstado (estadoHttp: number, mensajeApi: string): string {
  if (estadoHttp === 404) return `${ASISTENTE} está apagado: el semáforo se ve igual, pero nadie puede redactar el estado.`
  if (estadoHttp === 409) return 'Todavía no hay foto de hoy de este Proyecto. El cálculo corre una vez al día.'
  if (estadoHttp === 429) return `Se acabó la cuota de ${ASISTENTE} por ahora. El semáforo no depende de ella.`

  return mensajeApi
}
