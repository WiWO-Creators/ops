/**
 * El recorte de la cartera de Focals —texto, filtro y orden— tal como viaja en la URL.
 *
 * Vive en un `.ts` y fuera del hook para poder probarlo con `node --test`: la URL se edita a mano y
 * lo que decide qué valor se acepta y cuál cae al de por defecto es justo lo que no se ve fallar.
 */

import { FILTROS, ORDENES, type FiltroDeCartera, type OrdenDeCartera } from './cartera.ts'

/** Tope del texto del buscador: una cuenta, un focal o un Proyecto no se nombran con más. */
export const LARGO_MAXIMO_DE_BUSQUEDA = 100

/** Cuánto silencio hace falta al teclear antes de volcar el texto a la URL. */
export const RETRASO_DE_BUSQUEDA_MS = 250

/** Lo que quien mira pidió ver: el texto, el tramo o la condición, y el criterio de orden. */
export interface RecorteDeCartera {
  buscar: string
  filtro: FiltroDeCartera
  orden: OrdenDeCartera
}

const FILTRO_POR_DEFECTO: FiltroDeCartera = 'todas'
const ORDEN_POR_DEFECTO: OrdenDeCartera = 'peor'

/**
 * Un valor leído de la URL, validado contra los que la pantalla conoce.
 *
 * @param valor lo que trae la URL, o `null` si no está puesto
 * @param validos los valores que la pantalla acepta
 * @param porDefecto el que se usa cuando `valor` no es ninguno de los válidos
 */
function comoValorValido<V extends string> (valor: string | null, validos: readonly V[], porDefecto: V): V {
  return validos.includes(valor as V) ? (valor as V) : porDefecto
}

/**
 * Traduce los parámetros de la URL al recorte.
 *
 * Un valor viejo o inventado cae al de por defecto en vez de romper la pantalla, el texto se corta
 * al tope y `sin_focal` cae a `todas` en la cartera propia: ahí no se dibuja esa ficha, y dejar el
 * filtro puesto mostraría una lista vacía sin forma de quitarlo.
 *
 * @param params los parámetros de la URL
 * @param mostrarFocal si la pantalla es la cartera entera, la única con cuentas sin focal que ver
 * @returns el recorte vigente
 */
export function leerRecorte (params: URLSearchParams, mostrarFocal: boolean): RecorteDeCartera {
  const filtro = comoValorValido(params.get('filtro'), FILTROS, FILTRO_POR_DEFECTO)

  return {
    buscar: (params.get('buscar') ?? '').slice(0, LARGO_MAXIMO_DE_BUSQUEDA),
    filtro: filtro === 'sin_focal' && !mostrarFocal ? FILTRO_POR_DEFECTO : filtro,
    orden: comoValorValido(params.get('orden'), ORDENES, ORDEN_POR_DEFECTO)
  }
}

/**
 * Serializa el recorte a query string, sin `?`; lo que vale el valor por defecto no se escribe.
 *
 * @param recorte el estado a escribir en la URL
 * @returns la query, vacía si el recorte no recorta nada
 */
export function construirRecorte (recorte: RecorteDeCartera): string {
  const params = new URLSearchParams()

  if (recorte.buscar !== '') params.set('buscar', recorte.buscar)
  if (recorte.filtro !== FILTRO_POR_DEFECTO) params.set('filtro', recorte.filtro)
  if (recorte.orden !== ORDEN_POR_DEFECTO) params.set('orden', recorte.orden)

  return params.toString()
}
