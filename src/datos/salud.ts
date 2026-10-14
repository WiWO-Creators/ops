/**
 * Chequeo de salud de Ops: el BFF (este proceso) y la API de wiwo-board.
 *
 * Existe para que UN monitor externo vigile los dos con una sola URL (`GET /api/salud`). El BFF se
 * comprueba a si mismo (responder ya prueba que el proceso vive; ademas se revisa que tenga la
 * configuracion minima) y a la API le pregunta por su propio `GET /health`, que revisa base, disco y
 * cola de correo.
 *
 * Sin React ni acceso a `process.env`: todo entra por argumentos para poder probarlo sin red.
 */

/** Tiempo maximo que se espera a la API antes de darla por caida. */
export const TIEMPO_API_MS = 5000

/** Cabecera con la que el monitor pide el detalle; la misma que entiende `GET /health` de la API. */
export const CABECERA_TOKEN = 'x-salud-token'

/** Estado de un componente. `ms`, `motivo` y `detalle` solo se publican con token. */
export interface ComponenteDeSalud {
  ok: boolean
  ms?: number
  motivo?: string
  detalle?: unknown
}

/** Lo que devuelve {@link comprobarSalud}. */
export interface ResultadoDeSalud {
  ok: boolean
  componentes: { bff: ComponenteDeSalud, api: ComponenteDeSalud }
}

/** Entradas de {@link comprobarSalud}. */
export interface EntradaDeSalud {
  /** `API_BASE` sin barra final, o `null` si falta. */
  baseApi: string | null
  /** `SESION_CLAVE` tal cual, para comprobar que tiene la forma que exige el BFF. */
  claveSesion: string | undefined
  /** Token que se reenvia a la API para obtener su detalle; `null` si el monitor no mando uno valido. */
  token: string | null
  /** `fetch` inyectable. */
  consultar?: typeof fetch
  /** Espera maxima a la API, en milisegundos. */
  tiempoMs?: number
  /** Reloj inyectable, en milisegundos. */
  ahora?: () => number
}

/**
 * Comprueba que el BFF tenga lo minimo para atender: la API a la que reenvia y la clave de sesion.
 *
 * @param baseApi valor de `API_BASE`
 * @param claveSesion valor de `SESION_CLAVE`
 * @returns el estado del componente
 */
export function comprobarBff (baseApi: string | null, claveSesion: string | undefined): ComponenteDeSalud {
  if (baseApi === null || baseApi.trim() === '') return { ok: false, motivo: 'falta_api_base' }
  if (!/^[0-9a-f]{64}$/i.test(claveSesion?.trim() ?? '')) return { ok: false, motivo: 'sesion_clave_invalida' }

  return { ok: true }
}

/**
 * Le pregunta a la API por su `GET /health`.
 *
 * @param entrada la base de la API, el token opcional y los inyectables
 * @returns `ok` solo si la API contesto 200 con `data.ok === true`; con token, el detalle que mande
 */
export async function comprobarApi (entrada: EntradaDeSalud): Promise<ComponenteDeSalud> {
  const { baseApi, token, consultar = fetch, tiempoMs = TIEMPO_API_MS, ahora = Date.now } = entrada

  if (baseApi === null || baseApi.trim() === '') return { ok: false, motivo: 'falta_api_base' }

  const inicio = ahora()
  const cabeceras: Record<string, string> = { accept: 'application/json' }

  if (token !== null) cabeceras[CABECERA_TOKEN] = token

  try {
    const respuesta = await consultar(`${baseApi}/health`, {
      headers: cabeceras,
      cache: 'no-store',
      signal: AbortSignal.timeout(tiempoMs)
    })
    const ms = ahora() - inicio
    const cuerpo = await respuesta.json().catch(() => null) as { data?: { ok?: unknown } } | null
    const ok = respuesta.ok && cuerpo?.data?.ok === true

    return {
      ok,
      ms,
      ...(ok ? {} : { motivo: `api_respondio_${respuesta.status}` }),
      ...(cuerpo?.data !== undefined ? { detalle: cuerpo.data } : {})
    }
  } catch (fallo) {
    const agotado = fallo instanceof Error && (fallo.name === 'TimeoutError' || fallo.name === 'AbortError')

    return { ok: false, ms: ahora() - inicio, motivo: agotado ? 'api_tiempo_agotado' : 'api_inalcanzable' }
  }
}

/**
 * Corre las dos comprobaciones.
 *
 * @param entrada configuracion y token del monitor
 * @returns `ok` general y el estado de cada componente
 */
export async function comprobarSalud (entrada: EntradaDeSalud): Promise<ResultadoDeSalud> {
  const bff = comprobarBff(entrada.baseApi, entrada.claveSesion)
  const api = await comprobarApi(entrada)

  return { ok: bff.ok && api.ok, componentes: { bff, api } }
}

/**
 * Lo que se publica sin token: solo si cada componente esta bien, nada de motivos, tiempos ni detalle.
 *
 * @param resultado el resultado completo
 * @returns el cuerpo publico
 */
export function resumenPublico (resultado: ResultadoDeSalud): {
  ok: boolean
  status: 'ok' | 'degradado'
  componentes: { bff: { ok: boolean }, api: { ok: boolean } }
} {
  return {
    ok: resultado.ok,
    status: resultado.ok ? 'ok' : 'degradado',
    componentes: {
      bff: { ok: resultado.componentes.bff.ok },
      api: { ok: resultado.componentes.api.ok }
    }
  }
}

/**
 * Compara el token recibido con el configurado en tiempo constante.
 *
 * Sin token configurado nadie ve el detalle.
 *
 * @param recibido valor de la cabecera `x-salud-token`
 * @param esperado valor de `WIWO_SALUD_TOKEN`
 * @param iguales comparacion en tiempo constante, inyectada para no atar este modulo a `node:crypto`
 * @returns `true` si coinciden
 */
export function tokenValido (
  recibido: string | null,
  esperado: string | undefined,
  iguales: (a: string, b: string) => boolean
): boolean {
  const token = esperado?.trim() ?? ''

  return token !== '' && recibido !== null && iguales(token, recibido)
}
