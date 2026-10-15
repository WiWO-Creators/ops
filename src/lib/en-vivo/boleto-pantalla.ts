import { esCodigoDePantalla } from '../../dominio/codigo-de-pantalla.ts'
import { emitirBoleto } from './boleto.ts'
import { falloDeBoleto, type ResultadoDeBoleto } from './resultado-de-boleto.ts'

/**
 * Decisión del boleto de una pantalla de oficina (`POST /api/pantalla/{codigo}/boleto`).
 *
 * Es pura y recibe la lectura de la API ya inyectada, para probarla sin Next ni red. La ruta solo
 * aporta el `fetch` a `/public/display/{codigo}` y traduce el resultado a una respuesta HTTP.
 * Importa solo con rutas relativas y extensión `.ts`.
 */

/** Lo que la ruta necesita saber de la lectura de `GET /public/display/{codigo}`. */
export interface LecturaDePantalla {
  /** Código HTTP de la API. */
  estado: number
  /** `meta.en_vivo` del paquete; `false` si falta (API anterior o apagado). */
  enVivo: boolean
}

export interface EntradaDeBoletoDePantalla {
  codigo: string
  /** Base pública del servicio (`NEXT_PUBLIC_EN_VIVO_URL`), `''` si no hay. */
  url: string
  /** `EN_VIVO_BOLETO_SECRETO`, o `null` si falta o es corto. */
  secreto: string | null
  /** Lee la pantalla en la API; puede lanzar si la API no contesta. */
  leerPantalla: (codigo: string) => Promise<LecturaDePantalla>
}

/** Una pantalla no tiene persona detrás: su boleto lleva id 0. */
const ID_DE_PANTALLA = 0

/** La única sala que puede nombrar un boleto de pantalla. */
const SALA_DE_PANTALLAS = 'pantallas'

/**
 * Decide si una pantalla recibe boleto y lo emite.
 *
 * - código con forma inválida o pantalla inexistente (404 de la API): 404 `not_found`, sin distinguir;
 * - la API no contesta o falla: 503 `upstream_down`;
 * - sin URL, sin secreto o con `meta.en_vivo` apagado: 503 `en_vivo_apagado`;
 * - todo bien: 200 `{data:{boleto, expira_en, url}}` con la sala `pantallas` y nada más.
 *
 * @param entrada el código, la configuración y la lectura de la API
 * @returns el estado y el cuerpo de la respuesta
 */
export async function resolverBoletoDePantalla (entrada: EntradaDeBoletoDePantalla): Promise<ResultadoDeBoleto> {
  const { codigo, url, secreto, leerPantalla } = entrada

  if (!esCodigoDePantalla(codigo)) return falloDeBoleto(404, 'not_found')

  let lectura: LecturaDePantalla

  try {
    lectura = await leerPantalla(codigo)
  } catch {
    return falloDeBoleto(503, 'upstream_down')
  }

  if (lectura.estado === 404) return falloDeBoleto(404, 'not_found')
  if (lectura.estado !== 200) return falloDeBoleto(503, 'upstream_down')
  if (!lectura.enVivo || url === '' || secreto === null) return falloDeBoleto(503, 'en_vivo_apagado')

  const { boleto, exp } = emitirBoleto({ suj: 'pantalla', id: ID_DE_PANTALLA, salas: [SALA_DE_PANTALLAS] }, secreto)

  return { estado: 200, cuerpo: { data: { boleto, expira_en: exp, url } } }
}
