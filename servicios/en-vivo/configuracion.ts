import {
  LARGO_MINIMO_DE_SECRETO_DE_BOLETO
} from '../../src/lib/en-vivo/boleto.ts'
import { LARGO_MINIMO_DE_SECRETO } from '../../src/lib/en-vivo/firma.ts'

/**
 * Configuración del servicio de «Ops en vivo», leída del entorno.
 *
 * Las variables son las mismas del `.env` de ops-v2 (ver `.env.example`, sección «En vivo»). Todo
 * error de validación nombra la variable pero nunca su valor: el secreto no puede terminar en un log.
 */

export interface ConfiguracionDelServicio {
  puerto: number
  host: string
  /** Prefijo de las rutas, con barra inicial y sin barra final (`/en-vivo`). */
  prefijo: string
  /** Orígenes (`https://ops.wiwo.me`) desde los que se acepta abrir un socket. */
  origenes: string[]
  /** Base de la API del board, sin barra final. */
  apiBase: string
  secreto: string
  secretoDeBoleto: string
  debounceMs: number
  maxDebounceMs: number
  tiempoApiMs: number
  maxConexiones: number
  /** Cuánto espera el servicio un `hola` antes de cerrar el socket. */
  esperaDeHolaMs: number
  /** Cada cuánto se hace ping a los sockets. */
  latidoMs: number
}

type Entorno = Record<string, string | undefined>

const PUERTO_POR_DEFECTO = 4010
const HOST_POR_DEFECTO = '127.0.0.1'
const PREFIJO_POR_DEFECTO = '/en-vivo'
const DEBOUNCE_POR_DEFECTO_MS = 2000
const MAX_DEBOUNCE_POR_DEFECTO_MS = 10_000
const TIEMPO_API_POR_DEFECTO_MS = 5000
const CONEXIONES_POR_DEFECTO = 2000
const ESPERA_DE_HOLA_POR_DEFECTO_MS = 5000
const LATIDO_POR_DEFECTO_MS = 30_000

function leerEntero (env: Entorno, nombre: string, defecto: number, minimo: number, maximo: number): number {
  const crudo = env[nombre]

  if (crudo === undefined || crudo.trim() === '') return defecto

  const valor = Number(crudo)

  if (!Number.isSafeInteger(valor) || valor < minimo || valor > maximo) {
    throw new Error(`${nombre} debe ser un entero entre ${minimo} y ${maximo}.`)
  }

  return valor
}

function leerSecreto (env: Entorno, nombre: string, largoMinimo: number): string {
  const valor = env[nombre] ?? ''

  if (valor.length < largoMinimo || /\s/.test(valor)) {
    throw new Error(`${nombre} requiere al menos ${largoMinimo} caracteres sin espacios.`)
  }

  return valor
}

function leerPrefijo (env: Entorno): string {
  const prefijo = (env.EN_VIVO_PREFIJO ?? '').trim() || PREFIJO_POR_DEFECTO

  if (!/^\/[A-Za-z0-9._~/-]*[A-Za-z0-9._~-]$/.test(prefijo)) {
    throw new Error('EN_VIVO_PREFIJO debe empezar con / y no terminar con /.')
  }

  return prefijo
}

function leerOrigenes (env: Entorno): string[] {
  const origenes = (env.EN_VIVO_ORIGENES ?? '').split(',').map((o) => o.trim()).filter((o) => o !== '')

  if (origenes.length === 0) throw new Error('EN_VIVO_ORIGENES requiere al menos un origen.')

  return origenes.map((origen) => {
    let url: URL

    try {
      url = new URL(origen)
    } catch {
      throw new Error('EN_VIVO_ORIGENES contiene un origen que no es una URL.')
    }

    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username !== '' || url.password !== '') {
      throw new Error('EN_VIVO_ORIGENES solo admite orígenes http o https sin credenciales.')
    }

    return url.origin
  })
}

function leerApiBase (env: Entorno): string {
  let url: URL

  try {
    url = new URL(env.API_BASE ?? '')
  } catch {
    throw new Error('API_BASE debe ser una URL válida.')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('API_BASE debe usar http o https.')
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new Error('API_BASE no puede llevar credenciales ni parámetros.')
  }

  return url.href.replace(/\/+$/, '')
}

/** Lo mínimo para escuchar en modo inactivo: dónde, sin secretos ni board. */
export interface ConfiguracionInactiva {
  puerto: number
  host: string
  prefijo: string
}

/** Los secretos sin los que el servicio no puede firmar ni verificar nada. */
const VARIABLES_DE_SECRETO = ['EN_VIVO_SECRETO', 'EN_VIVO_BOLETO_SECRETO'] as const

/**
 * Nombres de los secretos que no están definidos (ausentes o vacíos).
 *
 * Es el criterio del modo inactivo: mientras el servidor no tenga las variables, el servicio
 * arranca sin funciones en vez de caerse y dejar a PM2 reiniciándolo en bucle. Un secreto presente
 * pero inválido (corto, repetido) no es «faltante»: `leerConfiguracion` lo sigue rechazando.
 *
 * @param env las variables de entorno; por defecto `process.env`
 * @returns los nombres (nunca los valores) de los secretos que faltan; vacío si están todos
 */
export function secretosFaltantes (env: Entorno = process.env): string[] {
  return VARIABLES_DE_SECRETO.filter((nombre) => (env[nombre] ?? '').trim() === '')
}

/**
 * Valida solo dónde escuchar (puerto, host, prefijo) para el modo inactivo.
 *
 * @param env las variables de entorno; por defecto `process.env`
 * @returns puerto, host y prefijo
 * @throws Error si el puerto o el prefijo son inválidos
 */
export function leerConfiguracionInactiva (env: Entorno = process.env): ConfiguracionInactiva {
  return {
    puerto: leerEntero(env, 'EN_VIVO_PUERTO', PUERTO_POR_DEFECTO, 0, 65_535),
    host: (env.EN_VIVO_HOST ?? '').trim() || HOST_POR_DEFECTO,
    prefijo: leerPrefijo(env)
  }
}

/**
 * Valida el entorno y arma la configuración del servicio.
 *
 * @param env las variables de entorno; por defecto `process.env`
 * @returns la configuración validada
 * @throws Error si falta algo o es inválido; el mensaje nombra la variable pero no su valor
 */
export function leerConfiguracion (env: Entorno = process.env): ConfiguracionDelServicio {
  const secreto = leerSecreto(env, 'EN_VIVO_SECRETO', LARGO_MINIMO_DE_SECRETO)
  const secretoDeBoleto = leerSecreto(env, 'EN_VIVO_BOLETO_SECRETO', LARGO_MINIMO_DE_SECRETO_DE_BOLETO)

  if (secreto === secretoDeBoleto) {
    throw new Error('EN_VIVO_SECRETO y EN_VIVO_BOLETO_SECRETO deben ser distintos.')
  }

  const debounceMs = leerEntero(env, 'EN_VIVO_DEBOUNCE_MS', DEBOUNCE_POR_DEFECTO_MS, 100, 60_000)
  const maxDebounceMs = leerEntero(env, 'EN_VIVO_MAX_DEBOUNCE_MS', MAX_DEBOUNCE_POR_DEFECTO_MS, 100, 120_000)

  if (maxDebounceMs < debounceMs) throw new Error('EN_VIVO_MAX_DEBOUNCE_MS no puede ser menor que EN_VIVO_DEBOUNCE_MS.')

  return {
    puerto: leerEntero(env, 'EN_VIVO_PUERTO', PUERTO_POR_DEFECTO, 0, 65_535),
    host: (env.EN_VIVO_HOST ?? '').trim() || HOST_POR_DEFECTO,
    prefijo: leerPrefijo(env),
    origenes: leerOrigenes(env),
    apiBase: leerApiBase(env),
    secreto,
    secretoDeBoleto,
    debounceMs,
    maxDebounceMs,
    tiempoApiMs: leerEntero(env, 'EN_VIVO_TIEMPO_API_MS', TIEMPO_API_POR_DEFECTO_MS, 200, 60_000),
    maxConexiones: leerEntero(env, 'EN_VIVO_MAX_CONEXIONES', CONEXIONES_POR_DEFECTO, 1, 100_000),
    esperaDeHolaMs: leerEntero(env, 'EN_VIVO_ESPERA_HOLA_MS', ESPERA_DE_HOLA_POR_DEFECTO_MS, 100, 60_000),
    latidoMs: leerEntero(env, 'EN_VIVO_LATIDO_MS', LATIDO_POR_DEFECTO_MS, 100, 300_000)
  }
}
