import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'

import type { ParDeTokens } from './tipos'

/**
 * Sellado y apertura de la cookie de sesion.
 *
 * La cookie guarda los dos tokens de la API. `httpOnly` impide que el JavaScript de la pagina los
 * lea, pero no impide que alguien con acceso al disco del navegador la abra: por eso se **cifra**,
 * no se firma. AES-256-GCM ademas autentica, asi que una cookie manipulada falla al abrirse en vez
 * de producir datos plausibles.
 *
 * Vive separado de `sesion.ts` a proposito: aca no se importa nada de Next, y por eso se puede
 * probar con el runner de Node.
 */

const ALGORITMO = 'aes-256-gcm'
const BYTES_IV = 12
const BYTES_TAG = 16

export interface Sesion {
  acceso: string
  refresco: string
  /** Epoch en segundos en que vence el token de acceso. */
  venceEn: number
  staffId: number
}

/**
 * Cifra la sesion en una cadena apta para cookie.
 *
 * @param sesion Los tokens y su vencimiento.
 * @param clave 32 bytes.
 * @returns `base64url` de `iv || tag || cifrado`.
 */
export function sellar (sesion: Sesion, clave: Buffer): string {
  const iv = randomBytes(BYTES_IV)
  const cifrador = createCipheriv(ALGORITMO, clave, iv)
  const cifrado = Buffer.concat([
    cifrador.update(JSON.stringify(sesion), 'utf8'),
    cifrador.final()
  ])

  return Buffer.concat([iv, cifrador.getAuthTag(), cifrado]).toString('base64url')
}

/**
 * Abre una cookie sellada.
 *
 * @returns La sesion, o `null` si la cookie esta ausente, truncada, manipulada o cifrada con otra
 *          clave. Nunca lanza: una cookie invalida es un usuario sin sesion, no un error del
 *          servidor.
 */
export function abrir (sellada: string | undefined, clave: Buffer): Sesion | null {
  if (sellada === undefined || sellada === '') return null

  try {
    const crudo = Buffer.from(sellada, 'base64url')

    if (crudo.length <= BYTES_IV + BYTES_TAG) return null

    const iv = crudo.subarray(0, BYTES_IV)
    const tag = crudo.subarray(BYTES_IV, BYTES_IV + BYTES_TAG)
    const cifrado = crudo.subarray(BYTES_IV + BYTES_TAG)

    const descifrador = createDecipheriv(ALGORITMO, clave, iv)
    descifrador.setAuthTag(tag)

    const plano = Buffer.concat([descifrador.update(cifrado), descifrador.final()]).toString('utf8')
    const dato = JSON.parse(plano) as unknown

    return esSesion(dato) ? dato : null
  } catch {
    // GCM lanza si el tag no cuadra, y JSON.parse si el contenido no es el nuestro. En los dos casos
    // la respuesta correcta es la misma: no hay sesion.
    return null
  }
}

/** Valida la forma de lo descifrado: la cookie pudo sellarse con una version anterior del tipo. */
function esSesion (dato: unknown): dato is Sesion {
  if (typeof dato !== 'object' || dato === null) return false

  const s = dato as Record<string, unknown>

  return typeof s.acceso === 'string' && s.acceso !== '' &&
    typeof s.refresco === 'string' && s.refresco !== '' &&
    typeof s.venceEn === 'number' && Number.isFinite(s.venceEn) &&
    typeof s.staffId === 'number'
}

/** `true` cuando al token de acceso le quedan menos de `margen` segundos. */
export function porVencer (sesion: Sesion, margenSegundos: number, ahora = Date.now()): boolean {
  return sesion.venceEn - margenSegundos <= Math.floor(ahora / 1000)
}

/**
 * Comparacion en tiempo constante de dos tokens.
 *
 * Se usa para decidir si otra peticion ya refresco: comparar secretos con `===` filtra su contenido
 * por el tiempo de comparacion.
 */
export function mismoToken (a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)

  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/**
 * Convierte el par de tokens de la API en la sesion que se guarda.
 *
 * `expires_in` viene en segundos relativos; se guarda como epoch absoluto para no tener que recordar
 * cuando llego la respuesta.
 *
 * @param staffId De quien es la sesion. Se pasa aparte porque `/auth/refresh` devuelve los tokens
 *                **sin** el bloque `staff`, a diferencia de login y 2fa: al refrescar se conserva el
 *                que ya tenia la sesion.
 */
export function sesionDesdeTokens (par: ParDeTokens, staffId: number, ahora = Date.now()): Sesion {
  return {
    acceso: par.access_token,
    refresco: par.refresh_token,
    venceEn: Math.floor(ahora / 1000) + par.expires_in,
    staffId
  }
}
