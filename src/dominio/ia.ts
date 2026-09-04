/**
 * Contrato de la capa de IA, del lado del navegador.
 *
 * Aca viven los tipos que F1 (resumen del Inicio), F2 (chat del Espacio) y F3 (alta de tarea)
 * comparten, y la lectura de un frame SSE. `datos/sse.ts` parte el texto en frames; este archivo es
 * el unico que sabe que significan.
 *
 * **Desviacion declarada de `docs/convenciones.md`**: la convencion dice que todo lo que entra del
 * usuario pasa por zod, pero zod **no esta instalado** en este proyecto y agregar una dependencia
 * para validar cuatro formas conocidas no se paga. La validacion es un type guard propio, escrito a
 * mano y con prueba runnable (`pruebas/ia.test.js`). El borde igual se valida de verdad: lo que
 * llega es texto de la red, generado por un modelo, y una sola propiedad asumida de mas tumba el
 * panel con un `TypeError` en medio de la animacion de escritura.
 *
 * Por eso `leerEventoIA()` **devuelve `null` en vez de lanzar**: un frame que no se entiende se
 * ignora y el stream sigue. Lanzar convertiria un token raro en una pantalla rota.
 */

/** Una referencia que el modelo cito y el servidor ya verifico contra la base. */
export interface Cita {
  tipo: 'tarea' | 'hito' | 'espacio'
  id: number
  /** El titulo que salio del `SELECT`, nunca el que escribio el modelo. */
  titulo: string
}

/**
 * Estado del cupo de regeneracion, tal como lo calcula el backend.
 *
 * Viaja en el `GET`, en el `POST` y en el `429`. El navegador **no** recalcula la regla de 2 por dia
 * con 4 horas de espera: duplicar logica de negocio del backend viola la convencion, y ademas se
 * saltearia con un `localStorage.clear()`.
 */
export interface Regeneracion {
  restantes_hoy: number
  puede_ahora: boolean
  /** ISO-8601 desde cuando se puede volver a generar, o `null` si ya se puede. */
  disponible_desde: string | null
  motivo: 'espera' | 'cupo' | null
}

/** Tokens de una llamada. Sirve para diagnosticar, no se muestra en la interfaz. */
export interface UsoIA {
  entrada: number
  salida: number
}

/** Lo que devuelve `GET /ia/inicio`. `texto: null` significa que nunca se genero. */
export interface ResumenIA {
  texto: string | null
  generado_en: string | null
  regeneracion: Regeneracion
}

/**
 * Lo que devuelve `POST /ia/tareas/interpretar`.
 *
 * Los nombres de campo son los de la API (`due_date`, `rel_id`) porque este objeto se fusiona con el
 * resultado de `interpretarAltaRapida()` y termina siendo el cuerpo de `POST /tasks`. Todo id ya
 * viene resuelto contra la base; lo que el modelo nombro y no se pudo resolver queda en
 * `no_resuelto` para mostrarlo, nunca para mandarlo.
 */
export interface CamposTarea {
  name: string | null
  description: string | null
  due_date: string | null
  start_date: string | null
  priority: number | null
  rel_type: 'project' | null
  rel_id: number | null
  milestone: number | null
  assignees: number[]
  tags: string[]
  no_resuelto: string[]
}

/** Un frame del stream, ya interpretado. El `tipo` es el nombre del `event:` del contrato. */
export type EventoIA =
  | { tipo: 'delta', texto: string }
  | { tipo: 'citas', citas: Cita[] }
  | { tipo: 'fin', generado_en: string | null, regeneracion: Regeneracion | null, uso: UsoIA | null }
  | { tipo: 'error', codigo: string, mensaje: string }

/** Los cuatro tipos de cita que el contrato reconoce. */
const TIPOS_CITA = ['tarea', 'hito', 'espacio'] as const

/** `true` si el valor es un objeto JSON plano. Descarta `null` y los arrays, que tambien son `object`. */
function esObjeto (valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

/**
 * Separa un frame SSE en su nombre de evento y su `data` ya parseado.
 *
 * Las lineas que empiezan con `:` son comentarios del protocolo —el `: ping` cada 15 segundos— y no
 * aportan nada. Las lineas `data:` se concatenan con salto de linea, como manda el protocolo, aunque
 * este contrato mande siempre una sola: si alguna vez llega partida, el JSON se rearma solo.
 *
 * @param crudo el frame completo, sin la linea en blanco final
 * @returns el nombre del evento y su payload, o `null` si falta el evento o el JSON no es un objeto
 */
function leerFrame (crudo: string): { nombre: string, datos: Record<string, unknown> } | null {
  let nombre = ''
  const partesDatos: string[] = []

  for (const linea of crudo.split(/\r\n|\r|\n/)) {
    if (linea.startsWith('event:')) nombre = linea.slice('event:'.length).trim()
    else if (linea.startsWith('data:')) partesDatos.push(linea.slice('data:'.length).trim())
  }

  if (nombre === '' || partesDatos.length === 0) return null

  try {
    const datos: unknown = JSON.parse(partesDatos.join('\n'))

    return esObjeto(datos) ? { nombre, datos } : null
  } catch {
    // `data` que no es JSON: el contrato dice que siempre lo es, asi que esto es un frame corrupto.
    return null
  }
}

/**
 * Interpreta un frame SSE de la capa de IA.
 *
 * Es un trust boundary: el texto viene de la red y lo escribio un modelo. Todo lo que no encaje en
 * una de las cuatro formas del contrato se descarta.
 *
 * El `fin` es la excepcion deliberada a esa estrictez: si sus bloques opcionales (`regeneracion`,
 * `uso`) vienen mal, el evento **igual se acepta** con esos campos en `null`. Descartar el `fin`
 * dejaria a la interfaz escribiendo para siempre, que es un fallo peor que perder el cupo restante.
 *
 * @param crudo un frame como lo entrega `partirEventos()`
 * @returns el evento tipado, o `null` si el frame es desconocido o esta malformado
 */
export function leerEventoIA (crudo: string): EventoIA | null {
  const frame = leerFrame(crudo)

  if (frame === null) return null

  const { nombre, datos } = frame

  if (nombre === 'delta') {
    return typeof datos.t === 'string' ? { tipo: 'delta', texto: datos.t } : null
  }

  if (nombre === 'citas') {
    return Array.isArray(datos.citas)
      ? { tipo: 'citas', citas: datos.citas.map(leerCita).filter((cita) => cita !== null) }
      : null
  }

  if (nombre === 'fin') {
    return {
      tipo: 'fin',
      generado_en: typeof datos.generado_en === 'string' ? datos.generado_en : null,
      regeneracion: leerRegeneracion(datos.regeneracion),
      uso: leerUso(datos.uso)
    }
  }

  if (nombre === 'error') {
    return typeof datos.code === 'string' && typeof datos.message === 'string'
      ? { tipo: 'error', codigo: datos.code, mensaje: datos.message }
      : null
  }

  return null
}

/**
 * Valida una cita suelta.
 *
 * Una cita invalida se descarta sola y las demas sobreviven, por el mismo criterio que el backend
 * aplica con `citas_descartadas`: un id inventado desaparece en vez de convertirse en un enlace a la
 * tarea de otro proyecto.
 *
 * @param valor una entrada del array `citas`
 * @returns la cita, o `null` si le falta algo o el tipo no es de los tres del contrato
 */
function leerCita (valor: unknown): Cita | null {
  if (!esObjeto(valor)) return null

  const { tipo, id, titulo } = valor
  const conocido = TIPOS_CITA.find((candidato) => candidato === tipo)

  if (conocido === undefined) return null
  if (typeof id !== 'number' || !Number.isFinite(id)) return null
  if (typeof titulo !== 'string') return null

  return { tipo: conocido, id, titulo }
}

/**
 * Valida el bloque de cupo del evento `fin`.
 *
 * @param valor el campo `regeneracion` del payload
 * @returns el bloque, o `null` si falta o no tiene la forma del contrato
 */
function leerRegeneracion (valor: unknown): Regeneracion | null {
  if (!esObjeto(valor)) return null

  const { restantes_hoy: restantes, puede_ahora: puede, disponible_desde: desde, motivo } = valor

  if (typeof restantes !== 'number' || typeof puede !== 'boolean') return null
  if (desde !== null && typeof desde !== 'string') return null
  if (motivo !== null && motivo !== 'espera' && motivo !== 'cupo') return null

  return { restantes_hoy: restantes, puede_ahora: puede, disponible_desde: desde, motivo }
}

/**
 * Valida el bloque de consumo del evento `fin`.
 *
 * @param valor el campo `uso` del payload
 * @returns el bloque, o `null` si falta o no trae los dos contadores
 */
function leerUso (valor: unknown): UsoIA | null {
  if (!esObjeto(valor)) return null

  const { entrada, salida } = valor

  return typeof entrada === 'number' && typeof salida === 'number' ? { entrada, salida } : null
}
