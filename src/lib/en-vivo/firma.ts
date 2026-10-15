import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Firma HMAC entre el board y el servicio de «Ops en vivo», en los dos sentidos.
 *
 * Cada petición lleva tres cabeceras: la marca de tiempo, un nonce y `v1=` + el HMAC-SHA256 de
 * `marca \n nonce \n METODO \n ruta \n sha256(cuerpo)`. La ruta es la canónica: relativa a la base
 * del receptor, sin query ni barra inicial (`interno/eventos`, `en-vivo/actas/12`), de modo que un
 * proxy que cambie el prefijo no invalida la firma.
 *
 * Replay: el servicio guarda los nonces vistos durante {@link TTL_DE_NONCE_SEGUNDOS} en
 * {@link AlmacenDeNonces}. El board no guarda ninguno, solo aplica la ventana; su única escritura
 * (`PUT en-vivo/actas/{id}`) es idempotente por `revision`, así que repetirla da 409.
 *
 * Solo imports de Node: la usan el servicio y el servidor de Next, nunca el navegador.
 */

export const CABECERA_MARCA = 'x-envivo-marca'
export const CABECERA_NONCE = 'x-envivo-nonce'
export const CABECERA_FIRMA = 'x-envivo-firma'

/** Diferencia máxima, en segundos, entre la marca de la petición y el reloj de quien la recibe. */
export const VENTANA_DE_FIRMA_SEGUNDOS = 60

/** Cuánto recuerda el servicio un nonce: el doble de la ventana, para cubrirla entera. */
export const TTL_DE_NONCE_SEGUNDOS = 120

/** Largo mínimo del secreto compartido. */
export const LARGO_MINIMO_DE_SECRETO = 32

const VERSION_DE_FIRMA = 'v1='
const NONCE_VALIDO = /^[0-9a-f]{32}$/

export interface CabecerasFirmadas {
  [CABECERA_MARCA]: string
  [CABECERA_NONCE]: string
  [CABECERA_FIRMA]: string
}

export type ResultadoDeFirma = 'ok' | 'sin_cabeceras' | 'fuera_de_ventana' | 'nonce_invalido' | 'firma_invalida'

/**
 * Deja la ruta en su forma canónica: sin query, sin fragmento y sin barras al principio ni al final.
 *
 * @param ruta la ruta tal como llegó o se va a llamar
 * @returns la ruta que entra en la firma
 */
export function rutaCanonica (ruta: string): string {
  return ruta.split(/[?#]/)[0]!.replace(/^\/+/, '').replace(/\/+$/, '')
}

function huellaDelCuerpo (cuerpo: string | Uint8Array): string {
  return createHash('sha256').update(cuerpo).digest('hex')
}

function calcularFirma (
  secreto: string,
  marca: string,
  nonce: string,
  metodo: string,
  ruta: string,
  cuerpo: string | Uint8Array
): string {
  const mensaje = `${marca}\n${nonce}\n${metodo.toUpperCase()}\n${rutaCanonica(ruta)}\n${huellaDelCuerpo(cuerpo)}`

  return VERSION_DE_FIRMA + createHmac('sha256', secreto).update(mensaje).digest('hex')
}

function exigirSecreto (secreto: string): void {
  if (typeof secreto !== 'string' || secreto.length < LARGO_MINIMO_DE_SECRETO) {
    throw new Error(`El secreto de firma requiere al menos ${LARGO_MINIMO_DE_SECRETO} caracteres.`)
  }
}

/**
 * Firma una petición saliente.
 *
 * @param secreto `EN_VIVO_SECRETO`, de 32 caracteres o más
 * @param metodo el método HTTP
 * @param ruta la ruta relativa a la base del receptor
 * @param cuerpo el cuerpo crudo exactamente como se va a enviar (vacío si no hay)
 * @param ahora segundos Unix; por defecto el reloj actual
 * @returns las tres cabeceras a enviar
 * @throws Error si el secreto es demasiado corto
 */
export function firmar (
  secreto: string,
  metodo: string,
  ruta: string,
  cuerpo: string | Uint8Array = '',
  ahora: number = Math.floor(Date.now() / 1000)
): CabecerasFirmadas {
  exigirSecreto(secreto)

  const marca = String(ahora)
  const nonce = randomBytes(16).toString('hex')

  return {
    [CABECERA_MARCA]: marca,
    [CABECERA_NONCE]: nonce,
    [CABECERA_FIRMA]: calcularFirma(secreto, marca, nonce, metodo, ruta, cuerpo)
  }
}

function iguales (a: string, b: string): boolean {
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)

  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB)
}

/**
 * Comprueba la firma de una petición entrante. No registra nonces: eso es de {@link AlmacenDeNonces}.
 *
 * @param secreto `EN_VIVO_SECRETO`
 * @param metodo el método HTTP recibido
 * @param ruta la ruta recibida, relativa a la base propia
 * @param cuerpo el cuerpo crudo recibido
 * @param cabeceras marca, nonce y firma tal como llegaron (pueden faltar)
 * @param ahora segundos Unix; por defecto el reloj actual
 * @returns `'ok'` o el motivo del rechazo
 */
export function verificarFirma (
  secreto: string,
  metodo: string,
  ruta: string,
  cuerpo: string | Uint8Array,
  cabeceras: { marca?: string | null, nonce?: string | null, firma?: string | null },
  ahora: number = Math.floor(Date.now() / 1000)
): ResultadoDeFirma {
  const { marca, nonce, firma } = cabeceras

  if (typeof secreto !== 'string' || secreto.length < LARGO_MINIMO_DE_SECRETO) return 'firma_invalida'
  if (!marca || !nonce || !firma) return 'sin_cabeceras'
  if (!/^\d{1,12}$/.test(marca) || Math.abs(ahora - Number(marca)) > VENTANA_DE_FIRMA_SEGUNDOS) return 'fuera_de_ventana'
  if (!NONCE_VALIDO.test(nonce)) return 'nonce_invalido'

  return iguales(firma, calcularFirma(secreto, marca, nonce, metodo, ruta, cuerpo)) ? 'ok' : 'firma_invalida'
}

/** Memoria de nonces vistos, con vencimiento, contra la repetición de una petición firmada. */
export class AlmacenDeNonces {
  #vistos = new Map<string, number>()
  #ttlMs: number

  /**
   * @param ttlSegundos cuánto se recuerda un nonce
   */
  constructor (ttlSegundos: number = TTL_DE_NONCE_SEGUNDOS) {
    this.#ttlMs = ttlSegundos * 1000
  }

  /**
   * Anota un nonce y dice si era nuevo. Barre los vencidos al pasar.
   *
   * @param nonce el nonce de la petición ya verificada
   * @param ahoraMs marca en milisegundos; por defecto el reloj actual
   * @returns `true` la primera vez; `false` si ya se había visto dentro del TTL
   */
  registrar (nonce: string, ahoraMs: number = Date.now()): boolean {
    for (const [clave, vence] of this.#vistos) {
      if (vence > ahoraMs) break
      this.#vistos.delete(clave)
    }

    if (this.#vistos.has(nonce)) return false

    this.#vistos.set(nonce, ahoraMs + this.#ttlMs)

    return true
  }

  /** Cantidad de nonces recordados. */
  get tamano (): number {
    return this.#vistos.size
  }
}
