import { emitirBoleto } from './boleto.ts'
import { falloDeBoleto, type ResultadoDeBoleto } from './resultado-de-boleto.ts'

/**
 * Decisión del boleto de un contacto del portal (`POST /api/en-vivo/boleto-portal`).
 *
 * Pura: la ruta resuelve la sesión y lee `/portal/me` con el token del contacto, y aquí solo se
 * decide qué boleto sale. El contacto nunca pide salas: su única sala, `cliente:{client_id}`, sale de
 * su propia ficha del portal. Import relativo con extensión `.ts`.
 */

/** Lo que se necesita de `/portal/me` para decidir. */
export interface YoParaBoletoDePortal {
  /** Id del contacto. */
  id: number
  /** Cliente al que pertenece el contacto; falta o es inválido en una ficha rota. */
  client_id?: number | null
  /** `wiwo_en_vivo_portal` y la fila del cliente, ya combinadas por la API. */
  en_vivo?: boolean
}

export interface EntradaDeBoletoDePortal {
  /** `/portal/me`, o `null` si no hay sesión de contacto. */
  yo: YoParaBoletoDePortal | null
  /** Base pública del servicio (`NEXT_PUBLIC_EN_VIVO_URL`), `''` si no hay. */
  url: string
  /** `EN_VIVO_BOLETO_SECRETO`, o `null` si falta o es corto. */
  secreto: string | null
}

function esIdValido (valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isSafeInteger(valor) && valor > 0
}

/**
 * Decide si un contacto recibe boleto y lo emite.
 *
 * - sin sesión: 401 `unauthenticated`;
 * - sin URL, sin secreto o con `en_vivo` apagado para su cliente: 503 `en_vivo_apagado`;
 * - sin `client_id` válido (o sin id propio): 403 `sala_no_permitida`;
 * - todo bien: 200 `{data:{boleto, expira_en, url}}` con la sala `cliente:{client_id}` y nada más.
 *
 * @param entrada la ficha del contacto y la configuración
 * @returns el estado y el cuerpo de la respuesta
 */
export function resolverBoletoDePortal (entrada: EntradaDeBoletoDePortal): ResultadoDeBoleto {
  const { yo, url, secreto } = entrada

  if (yo === null) return falloDeBoleto(401, 'unauthenticated')
  if (yo.en_vivo !== true || url === '' || secreto === null) return falloDeBoleto(503, 'en_vivo_apagado')
  if (!esIdValido(yo.client_id) || !esIdValido(yo.id)) return falloDeBoleto(403, 'sala_no_permitida')

  const { boleto, exp } = emitirBoleto({ suj: 'contacto', id: yo.id, salas: [`cliente:${yo.client_id}`] }, secreto)

  return { estado: 200, cuerpo: { data: { boleto, expira_en: exp, url } } }
}
