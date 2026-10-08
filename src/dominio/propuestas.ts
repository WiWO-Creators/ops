/**
 * Propuestas que otros sistemas dejaron para que una persona las apruebe en Ops.
 *
 * Una propuesta externa es la misma fila que una de Thinking Orb (`tblapi_ia_acciones`), con el
 * sistema de origen y, a veces, el vínculo con lo que la originó. Se confirma o rechaza con el mismo
 * `POST /ia/acciones/{id}`; por eso `aAccionIA` la convierte a la forma que ya entiende la tarjeta
 * canónica, y la bandeja no escribe una segunda.
 */
import type { AccionIA } from './ia.ts'

export type EstadoDePropuesta = 'pendiente' | 'ejecutando' | 'ejecutada' | 'rechazada' | 'fallida' | 'expirada'

const ESTADOS: readonly EstadoDePropuesta[] = ['pendiente', 'ejecutando', 'ejecutada', 'rechazada', 'fallida', 'expirada']

/** Una fila de `GET /ia/propuestas`. */
export interface PropuestaExterna {
  id: number
  tool: string
  summary: string
  detail: string[]
  assumptions: string[]
  state: EstadoDePropuesta
  result: string | null
  expires_at: string | null
  created_at: string | null
  origin: { system: string, name: string }
  link: { external_id: string, url: string } | null
  /** Huella de lo que se propuso; la decisión remota va ligada a ella. */
  args_hash: string | null
  /** Enlace profundo a esta propuesta en Ops (`/propuestas/{id}`), si el board conoce la URL pública. */
  url_ops: string | null
  /** `true` si lo que la propuesta hace lo va a poder leer el cliente. */
  visible_to_client: boolean
  /** Lo que el sistema dijo de dónde sacó la propuesta: nunca verificado por Ops. */
  provenance: Procedencia | null
}

/**
 * La procedencia declarada por el sistema de origen. `trusted` es siempre `false`: Ops no la verifica,
 * y por eso se muestra como texto plano y rotulada, jamás como HTML ni como enlace.
 */
export interface Procedencia {
  trusted: false
  data: Record<string, string>
}

/** Un vínculo de una tarea con el sistema que la originó (`vinculos` de `GET /tasks/{id}`). */
export interface VinculoExterno {
  system: string
  external_id: string
  url: string | null
}

function esObjeto (valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function textos (valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : []
}

/**
 * `url` solo si es https: un enlace que viene de otro sistema no puede ser `javascript:` ni `http:`.
 *
 * @param valor lo que trajo la API
 */
export function urlHttps (valor: unknown): string | null {
  if (typeof valor !== 'string') return null

  try {
    const url = new URL(valor)

    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * Lee la procedencia declarada: pares clave-valor de texto plano, o `null` si no hay ninguno.
 *
 * Aunque la API la marque, `trusted` se fuerza a `false`; los valores que no son texto, número o
 * booleano se descartan.
 *
 * @param valor `provenance` de la fila
 */
export function leerProcedencia (valor: unknown): Procedencia | null {
  if (!esObjeto(valor) || !esObjeto(valor.data)) return null

  const data: Record<string, string> = {}

  for (const [clave, dato] of Object.entries(valor.data)) {
    if (typeof dato === 'string' || typeof dato === 'number' || typeof dato === 'boolean') data[clave] = String(dato)
  }

  return Object.keys(data).length === 0 ? null : { trusted: false, data }
}

/**
 * Lee el listado de propuestas, descartando las filas que no tienen la forma del contrato.
 *
 * @param valor el `data` de la respuesta
 */
export function leerPropuestas (valor: unknown): PropuestaExterna[] {
  if (!Array.isArray(valor)) return []

  const lista: PropuestaExterna[] = []

  for (const fila of valor) {
    if (!esObjeto(fila) || typeof fila.id !== 'number' || typeof fila.tool !== 'string' || typeof fila.summary !== 'string' || fila.summary === '') continue

    const estado = ESTADOS.find((e) => e === fila.state)

    if (estado === undefined) continue

    const origen = esObjeto(fila.origin) ? fila.origin : {}
    const enlace = esObjeto(fila.link) && typeof fila.link.external_id === 'string'
      ? { external_id: fila.link.external_id, url: urlHttps(fila.link.url) ?? '' }
      : null

    lista.push({
      id: fila.id,
      tool: fila.tool,
      summary: fila.summary,
      detail: textos(fila.detail),
      assumptions: textos(fila.assumptions),
      state: estado,
      result: typeof fila.result === 'string' ? fila.result : null,
      expires_at: typeof fila.expires_at === 'string' ? fila.expires_at : null,
      created_at: typeof fila.created_at === 'string' ? fila.created_at : null,
      origin: {
        system: typeof origen.system === 'string' ? origen.system : '',
        name: typeof origen.name === 'string' && origen.name !== '' ? origen.name : String(origen.system ?? 'Otro sistema')
      },
      link: enlace,
      args_hash: typeof fila.args_hash === 'string' && fila.args_hash !== '' ? fila.args_hash : null,
      url_ops: urlHttps(fila.url_ops),
      visible_to_client: fila.visible_to_client === true,
      provenance: leerProcedencia(fila.provenance)
    })
  }

  return lista
}

/**
 * La propuesta en la forma que entiende `TarjetaPropuestaIA`.
 *
 * @param propuesta la fila de la bandeja
 */
export function aAccionIA (propuesta: PropuestaExterna): AccionIA {
  return {
    id: propuesta.id,
    herramienta: propuesta.tool,
    resumen: propuesta.summary,
    detalle: propuesta.detail,
    supuestos: propuesta.assumptions,
    estado: propuesta.state,
    resultado: propuesta.result,
    expira_en: propuesta.expires_at
  }
}

/**
 * Lee los vínculos de una tarea, tolerando que el campo no exista todavía.
 *
 * @param valor `vinculos` de la respuesta de la tarea
 */
export function leerVinculos (valor: unknown): VinculoExterno[] {
  if (!Array.isArray(valor)) return []

  return valor
    .filter(esObjeto)
    .filter((v) => typeof v.system === 'string' && v.system !== '')
    .map((v) => ({
      system: String(v.system),
      external_id: typeof v.external_id === 'string' ? v.external_id : '',
      url: urlHttps(v.url)
    }))
}

/**
 * «Caduca en …» para plazos de minutos a días: las externas duran horas, no 30 minutos.
 *
 * @param segundos lo que falta
 */
export function textoDeRestante (segundos: number): string {
  if (segundos < 60) return 'menos de un minuto'

  const minutos = Math.ceil(segundos / 60)

  if (minutos < 60) return minutos === 1 ? '1 minuto' : `${minutos} minutos`

  const horas = Math.ceil(minutos / 60)

  if (horas < 48) return horas === 1 ? '1 hora' : `${horas} horas`

  return `${Math.ceil(horas / 24)} días`
}

/**
 * Cuántas propuestas siguen esperando respuesta.
 *
 * @param propuestas la lista
 * @param ahora milisegundos
 */
export function contarPendientes (propuestas: readonly PropuestaExterna[], ahora: number): number {
  return propuestas.filter((p) => {
    if (p.state !== 'pendiente') return false
    if (p.expires_at === null) return true

    const limite = Date.parse(p.expires_at)

    return Number.isNaN(limite) || limite > ahora
  }).length
}
