import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import {
  MAXIMO_SALAS_POR_BOLETO,
  salaCorrespondeAlSujeto,
  type SujetoDeBoleto
} from '../../dominio/en-vivo.ts'

/**
 * Boleto de acceso al servicio de «Ops en vivo».
 *
 * El navegador no puede mandar cookies entre orígenes ni conoce ningún secreto, así que el BFF de
 * Next (que sí tiene la sesión) valida las salas contra el board y le entrega un boleto firmado y
 * de vida corta; el servicio solo comprueba la firma. Formato: `base64url(JSON) + "." +
 * base64url(HMAC-SHA256)`. Se firma con `EN_VIVO_BOLETO_SECRETO`, que vive solo en el `.env` de
 * ops-v2: nunca se importa desde un componente de cliente.
 */

/** Vida de un boleto, en segundos. */
export const TTL_DE_BOLETO_SEGUNDOS = 120

/** Largo mínimo del secreto del boleto. */
export const LARGO_MINIMO_DE_SECRETO_DE_BOLETO = 32

const VERSION_DE_BOLETO = 1
const MAXIMO_CARACTERES = 3000

export interface PayloadDeBoleto {
  v: 1
  suj: SujetoDeBoleto
  /** `staffid`, id del contacto, o 0 para una pantalla. */
  id: number
  salas: string[]
  /** Documento colaborativo que autoriza (`acta:{id}`), o `null`. */
  doc: string | null
  /** Espacio al que pertenece el documento, o `null`. */
  esp: number | null
  /**
   * Si la persona puede escribir en el documento. `false` abre la conexión en solo lectura. Un boleto
   * sin el campo (anterior a esta versión) cuenta como `true`: la verificación lo normaliza.
   */
  esc: boolean
  /** Vencimiento, en segundos Unix. */
  exp: number
  /** Identificador único, 16 hex. */
  jti: string
}

export interface DatosDeBoleto {
  suj: SujetoDeBoleto
  id: number
  salas: string[]
  doc?: string | null
  esp?: number | null
  /** Por defecto `true`; `false` para quien puede leer el documento pero no editarlo. */
  escritura?: boolean
}

function ahoraEnSegundos (): number {
  return Math.floor(Date.now() / 1000)
}

function exigirSecreto (secreto: string): void {
  if (typeof secreto !== 'string' || secreto.length < LARGO_MINIMO_DE_SECRETO_DE_BOLETO) {
    throw new Error(`El secreto del boleto requiere al menos ${LARGO_MINIMO_DE_SECRETO_DE_BOLETO} caracteres.`)
  }
}

function firmaDe (secreto: string, parteDelPayload: string): Buffer {
  return createHmac('sha256', secreto).update(parteDelPayload).digest()
}

/**
 * Emite un boleto.
 *
 * @param datos quién es y qué salas y documento autoriza
 * @param secreto `EN_VIVO_BOLETO_SECRETO`
 * @param ahora segundos Unix; por defecto el reloj actual
 * @returns el boleto y su vencimiento
 * @throws Error si el secreto es corto, hay más de 20 salas o una sala no corresponde al sujeto
 */
export function emitirBoleto (
  datos: DatosDeBoleto,
  secreto: string,
  ahora: number = ahoraEnSegundos()
): { boleto: string, exp: number } {
  exigirSecreto(secreto)

  if (datos.salas.length > MAXIMO_SALAS_POR_BOLETO) throw new Error('Un boleto admite hasta 20 salas.')
  if (!datos.salas.every((sala) => salaCorrespondeAlSujeto(datos.suj, datos.id, sala))) {
    throw new Error('Hay una sala que no corresponde al sujeto del boleto.')
  }

  const exp = ahora + TTL_DE_BOLETO_SEGUNDOS
  const payload: PayloadDeBoleto = {
    v: VERSION_DE_BOLETO,
    suj: datos.suj,
    id: datos.id,
    salas: [...new Set(datos.salas)],
    doc: datos.doc ?? null,
    esp: datos.esp ?? null,
    esc: datos.escritura ?? true,
    exp,
    jti: randomBytes(8).toString('hex')
  }
  const parte = Buffer.from(JSON.stringify(payload)).toString('base64url')

  return { boleto: `${parte}.${firmaDe(secreto, parte).toString('base64url')}`, exp }
}

function leerPayload (parte: string): PayloadDeBoleto | null {
  try {
    const valor: unknown = JSON.parse(Buffer.from(parte, 'base64url').toString('utf8'))

    return esPayloadValido(valor) ? { ...valor, esc: valor.esc !== false } : null
  } catch {
    return null
  }
}

function esPayloadValido (valor: unknown): valor is Omit<PayloadDeBoleto, 'esc'> & { esc?: boolean } {
  if (typeof valor !== 'object' || valor === null) return false

  const p = valor as Record<string, unknown>

  return p.v === VERSION_DE_BOLETO &&
    (p.suj === 'staff' || p.suj === 'contacto' || p.suj === 'pantalla') &&
    typeof p.id === 'number' && Number.isSafeInteger(p.id) && p.id >= 0 &&
    Array.isArray(p.salas) && p.salas.length <= MAXIMO_SALAS_POR_BOLETO &&
    p.salas.every((sala) => typeof sala === 'string') &&
    (p.doc === null || typeof p.doc === 'string') &&
    (p.esp === null || (typeof p.esp === 'number' && Number.isSafeInteger(p.esp))) &&
    (p.esc === undefined || typeof p.esc === 'boolean') &&
    typeof p.exp === 'number' && Number.isFinite(p.exp) &&
    typeof p.jti === 'string' && /^[0-9a-f]{16}$/.test(p.jti)
}

/**
 * Verifica un boleto.
 *
 * Rechaza (con `null`, sin lanzar) un texto mal formado, una firma que no coincide, una versión
 * distinta de 1, un vencimiento pasado, más de 20 salas y salas que no corresponden al sujeto.
 *
 * @param texto el boleto tal como lo mandó el navegador
 * @param secreto `EN_VIVO_BOLETO_SECRETO`
 * @param ahora segundos Unix; por defecto el reloj actual
 * @returns el payload, o `null` si no es válido
 */
export function verificarBoleto (
  texto: unknown,
  secreto: string,
  ahora: number = ahoraEnSegundos()
): PayloadDeBoleto | null {
  if (typeof texto !== 'string' || texto.length > MAXIMO_CARACTERES) return null
  if (typeof secreto !== 'string' || secreto.length < LARGO_MINIMO_DE_SECRETO_DE_BOLETO) return null

  const partes = texto.split('.')

  if (partes.length !== 2) return null

  const [parte, firma] = partes as [string, string]
  const esperada = firmaDe(secreto, parte)
  const recibida = Buffer.from(firma, 'base64url')

  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null

  const payload = leerPayload(parte)

  if (payload === null || payload.exp <= ahora) return null
  if (!payload.salas.every((sala) => salaCorrespondeAlSujeto(payload.suj, payload.id, sala))) return null

  return payload
}
