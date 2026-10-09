import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Traspaso del login de Google de Chrome a la app nativa.
 *
 * Google no deja entrar desde un WebView, así que la app abre `/colab?app=<reto>` en una pestaña de
 * Chrome. Ahí el botón de Google funciona y entrega su ID token, pero la sesión no se abre en Chrome:
 * el token se sella en un código que vuelve a la app por `wiwoops://sesion?codigo=…`, y la app lo
 * canjea dentro del WebView (`POST /api/sesion` con `traspaso` y `verifier`). La sesión nace donde se
 * va a usar, por la misma puerta que el botón de siempre, segundo factor incluido.
 *
 * Qué protege a ese código en el camino:
 * - Va cifrado y autenticado (AES-256-GCM) con una clave derivada de `SESION_CLAVE`, distinta de la de
 *   la cookie: el ID token no viaja legible por la URL ni queda en el historial de Chrome.
 * - Solo lo canjea quien tenga el `verifier` del reto (PKCE S256), que nunca salió de la app. Otra app
 *   que se apropie del esquema `wiwoops://` recibe un código que no puede usar.
 * - Vence a los `VIDA_TRASPASO_SEGUNDOS`. No hay registro de canjes: dentro de esa ventana, quien tenga
 *   el código Y el verifier podría usarlo dos veces, y eso ya es tener el teléfono.
 *
 * Sin dependencias de Next, para que el runner de Node lo pruebe tal cual.
 */

const ALGORITMO = 'aes-256-gcm'
const BYTES_IV = 12
const BYTES_TAG = 16
const INFO_CLAVE = 'ops-traspaso-google-v1'

/** Reto y verifier PKCE: base64url sin relleno de 43 caracteres (32 bytes). */
export const PATRON_PKCE = /^[A-Za-z0-9_-]{43}$/

/** El código sellado: base64url, acotado para no aceptar cualquier cosa por la URL. */
export const PATRON_CODIGO_TRASPASO = /^[A-Za-z0-9_-]{40,6000}$/

interface Contenido {
  /** ID token de Google. */
  c: string
  /** Reto PKCE de la app. */
  r: string
  /** Epoch en segundos en que vence. */
  e: number
}

/**
 * Deriva la clave del traspaso a partir de la clave de sesión.
 *
 * @param claveSesion los 32 bytes de `SESION_CLAVE`
 * @returns 32 bytes que solo sirven para sellar traspasos
 */
export function claveTraspaso (claveSesion: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', claveSesion, Buffer.alloc(0), INFO_CLAVE, 32))
}

/**
 * Calcula el reto S256 de un verifier: base64url(sha256(verifier)).
 *
 * @param verifier el verifier en base64url
 * @returns el reto
 */
export function retoDe (verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url')
}

/**
 * Sella el ID token de Google junto al reto de la app.
 *
 * @param credencial el ID token que entregó Google
 * @param reto el reto PKCE que trajo la app en la URL
 * @param clave la clave de `claveTraspaso()`
 * @param vidaSegundos cuánto vive el código
 * @param ahora epoch en milisegundos (inyectable para las pruebas)
 * @returns el código en base64url
 * @throws RangeError si la credencial está vacía o el reto no tiene la forma PKCE
 */
export function sellarTraspaso (
  credencial: string,
  reto: string,
  clave: Buffer,
  vidaSegundos: number,
  ahora = Date.now()
): string {
  if (credencial.trim() === '') throw new RangeError('Falta la credencial')
  if (!PATRON_PKCE.test(reto)) throw new RangeError('El reto no es válido')

  const contenido: Contenido = { c: credencial, r: reto, e: Math.floor(ahora / 1000) + vidaSegundos }
  const iv = randomBytes(BYTES_IV)
  const cifrador = createCipheriv(ALGORITMO, clave, iv)
  const cifrado = Buffer.concat([cifrador.update(JSON.stringify(contenido), 'utf8'), cifrador.final()])

  return Buffer.concat([iv, cifrador.getAuthTag(), cifrado]).toString('base64url')
}

/**
 * Abre un código de traspaso y devuelve el ID token si el verifier corresponde y no venció.
 *
 * @param codigo lo que la app recibió por `wiwoops://sesion`
 * @param verifier el verifier que la app guardó al abrir Chrome
 * @param clave la clave de `claveTraspaso()`
 * @param ahora epoch en milisegundos (inyectable para las pruebas)
 * @returns el ID token, o `null` si el código está manipulado, vencido o es de otro verifier. Nunca
 *          lanza: un código inválido es un login que no ocurre, no un error del servidor.
 */
export function abrirTraspaso (codigo: string, verifier: string, clave: Buffer, ahora = Date.now()): string | null {
  if (!PATRON_CODIGO_TRASPASO.test(codigo) || !PATRON_PKCE.test(verifier)) return null

  const contenido = descifrar(codigo, clave)

  if (contenido === null || contenido.e < Math.floor(ahora / 1000)) return null

  const esperado = Buffer.from(contenido.r)
  const recibido = Buffer.from(retoDe(verifier))

  if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) return null

  return contenido.c
}

/**
 * Descifra y valida la forma del contenido.
 *
 * @returns el contenido, o `null` si el tag no cuadra o no es nuestro
 */
function descifrar (codigo: string, clave: Buffer): Contenido | null {
  try {
    const crudo = Buffer.from(codigo, 'base64url')

    if (crudo.length <= BYTES_IV + BYTES_TAG) return null

    const descifrador = createDecipheriv(ALGORITMO, clave, crudo.subarray(0, BYTES_IV))
    descifrador.setAuthTag(crudo.subarray(BYTES_IV, BYTES_IV + BYTES_TAG))

    const plano = Buffer.concat([
      descifrador.update(crudo.subarray(BYTES_IV + BYTES_TAG)),
      descifrador.final()
    ]).toString('utf8')
    const dato = JSON.parse(plano) as Record<string, unknown>

    return typeof dato.c === 'string' && dato.c !== '' &&
      typeof dato.r === 'string' && PATRON_PKCE.test(dato.r) &&
      typeof dato.e === 'number' && Number.isFinite(dato.e)
      ? { c: dato.c, r: dato.r, e: dato.e }
      : null
  } catch {
    return null
  }
}
