import type { Ajustes, TipoDeAjuste } from '../datos/recursos.ts'

/**
 * Reglas del login con Google del equipo, sin nada de React ni de Next.
 *
 * Vive aparte de la pantalla porque es lo unico de esta feature que merece prueba: quien puede
 * entrar depende de una lista de dominios, y una validacion floja ahi no rompe la pantalla —deja
 * pasar gente—. Node puede ejecutar este archivo tal cual (`pruebas/acceso.test.js`), que es la
 * razon por la que no importa nada del framework.
 */

/**
 * Las tres claves del grupo `acceso` de `Escritura\Ajuste::EDITABLES`.
 *
 * Enumeradas aca y no sueltas por la pantalla: son el contrato con la API —una clave mal escrita es
 * un 422 con `no_editable`, no un campo que se ignora— y asi hay un solo lugar donde corregirlas si
 * el backend las renombra.
 */
export const AJUSTES_GOOGLE = {
  habilitado: 'wiwo_google_login_enabled',
  dominios: 'wiwo_google_login_domains',
  clienteId: 'wiwo_google_client_id'
} as const

/**
 * Un dominio plausible, no un dominio valido.
 *
 * La comprobacion de verdad la hace Google al validar el token: lo unico que se puede afirmar desde
 * el navegador es que esto tiene forma de dominio. Rechaza lo que casi siempre es un error de quien
 * escribe —pegar un correo entero, un espacio de mas, un `https://` adelante, un dominio sin punto—
 * antes de que llegue a la lista y le abra la puerta a nadie.
 *
 * No acepta comodines (`*.wiwo.me`): el backend compara el dominio del correo con la lista tal cual,
 * asi que un comodin no autorizaria nada y solo pareceria que si.
 */
export function esDominioPlausible (valor: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(valor)
}

/**
 * Deja un dominio en la forma en la que se compara y se guarda: sin espacios y en minusculas.
 *
 * Los dominios no distinguen mayusculas, asi que `WiWO.me` y `wiwo.me` son el mismo y guardar los
 * dos seria una lista con un duplicado que nadie ve.
 */
export function normalizarDominio (valor: string): string {
  return valor.trim().toLowerCase()
}

/**
 * Lee la lista separada por coma que guarda la API y la vuelve una lista de dominios.
 *
 * Tolera el espacio despues de la coma y las comas de mas: el valor puede venir escrito a mano desde
 * el panel clasico, y perder un dominio por un espacio dejaria gente afuera sin explicacion.
 */
export function dominiosDesdeTexto (valor: string | null): string[] {
  if (valor === null) return []

  return valor.split(',').map(normalizarDominio).filter((dominio) => dominio !== '')
}

/** Serializa la lista a lo que espera la API: dominios separados por coma, sin espacios. */
export function dominiosATexto (dominios: string[]): string {
  return dominios.join(',')
}

/**
 * Por que no se puede agregar este dominio a la lista, o `null` si se puede.
 *
 * Devuelve el motivo y no un booleano porque los tres casos —vacio, mal escrito, repetido— piden
 * mensajes distintos, y «dominio invalido» para un duplicado manda a corregir lo que estaba bien.
 */
export function motivoParaRechazarDominio (candidato: string, actuales: string[]): string | null {
  const dominio = normalizarDominio(candidato)

  if (dominio === '') return 'Escribí un dominio.'
  if (!esDominioPlausible(dominio)) {
    return 'Eso no parece un dominio. Va solo la parte de después del arroba, con al menos un punto: wiwo.me'
  }
  if (actuales.includes(dominio)) return 'Ese dominio ya está en la lista.'

  return null
}

/**
 * Un ajuste editable, o `null` si la API todavia no lo publica.
 *
 * `null` no es un caso raro: mientras el backend no despliegue las tres opciones nuevas, `editable`
 * no las trae y la pantalla tiene que decirlo en vez de dibujar un formulario que no se puede
 * guardar. Tambien filtra por `type`, porque un cambio de tipo del otro lado —de `texto` a `enum`,
 * por ejemplo— haria que el control dibujado ya no corresponda al dominio real del campo.
 */
function ajusteDe (ajustes: Ajustes, nombre: string, tipo: TipoDeAjuste): { value: unknown } | null {
  const ajuste = ajustes.editable[nombre]

  return ajuste !== undefined && ajuste.type === tipo ? ajuste : null
}

/** `true` si la API publica las tres opciones del login con Google con el tipo esperado. */
export function tieneAjustesDeGoogle (ajustes: Ajustes): boolean {
  return ajusteDe(ajustes, AJUSTES_GOOGLE.habilitado, 'bool') !== null &&
    ajusteDe(ajustes, AJUSTES_GOOGLE.dominios, 'texto') !== null &&
    ajusteDe(ajustes, AJUSTES_GOOGLE.clienteId, 'texto') !== null
}

/**
 * Valor de un ajuste `bool`.
 *
 * La API ya devuelve booleano de verdad y no el `"0"` que guarda MySQL, pero el `value` del tipo es
 * la union de los cinco tipos posibles: sin este estrechamiento habria que castear en la pantalla, y
 * un `"0"` casteado a booleano es `true`.
 */
export function ajusteBool (ajustes: Ajustes, nombre: string): boolean {
  const ajuste = ajusteDe(ajustes, nombre, 'bool')

  return ajuste !== null && ajuste.value === true
}

/** Valor de un ajuste `texto`. Vacio tambien cuando la opcion aun no tiene fila en `tbloptions`. */
export function ajusteTexto (ajustes: Ajustes, nombre: string): string {
  const ajuste = ajusteDe(ajustes, nombre, 'texto')

  return typeof ajuste?.value === 'string' ? ajuste.value : ''
}
