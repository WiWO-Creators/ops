/**
 * Modos especiales de la interfaz (Halloween, y los que vengan): un estilo temporal de todo Ops que
 * un superadministrador programa con un rango de dias.
 *
 * Es la unica fuente de los modos que existen: el selector de Administracion, el color de la barra
 * del sistema y la validacion de lo que contesta `GET /public/modo` salen de `MODOS`. Agregar un modo
 * es una entrada aca, su hoja de estilos en `estilos/modos/` y su decoracion; el backend lleva la
 * misma lista en el `enum` de `wiwo_modo_especial` (`Escritura\Ajuste::EDITABLES`).
 *
 * Sin React ni Next: lo ejecutan tambien las pruebas de Node.
 */

/** Los modos que existen. `colorBarra` es el literal de `--superficie` del modo, en claro y oscuro. */
export const MODOS = {
  halloween: {
    nombre: 'Halloween',
    colorBarra: { claro: '#F7F0E6', oscuro: '#15101C' }
  }
} as const

export type ClaveDeModo = keyof typeof MODOS

/** El valor de `wiwo_modo_especial` cuando no hay modo programado. */
export const SIN_MODO = 'ninguno'

/** Lo que dice `GET /public/modo` cuando hay un modo vigente hoy. */
export interface ModoVigente {
  clave: ClaveDeModo
  desde: string
  hasta: string
}

export type EstadoDelModo = 'apagado' | 'programado' | 'vigente' | 'vencido'

/**
 * Dice si un valor es la clave de un modo que existe.
 *
 * @param valor lo que sea que haya llegado
 * @returns `true` si es una clave de `MODOS`
 */
export function esClaveDeModo (valor: unknown): valor is ClaveDeModo {
  return typeof valor === 'string' && Object.hasOwn(MODOS, valor)
}

/**
 * Lee con desconfianza el `data` de `GET /public/modo`.
 *
 * Un modo que el frontend no conoce vale `null`: pintar un modo sin hoja de estilos dejaria la
 * pagina igual pero con una decoracion a medias.
 *
 * @param datos el `data` del sobre
 * @returns el modo vigente, o `null` si no hay o no se entiende
 */
export function leerModoVigente (datos: unknown): ModoVigente | null {
  if (typeof datos !== 'object' || datos === null) return null

  const { clave, desde, hasta } = datos as Record<string, unknown>
  const esDia = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

  if (!esClaveDeModo(clave) || !esDia(desde) || !esDia(hasta)) return null

  return { clave, desde, hasta }
}

/**
 * El dia de una fecha en la zona del navegador, como `YYYY-MM-DD`.
 *
 * @param fecha instante a convertir
 * @returns el dia local
 */
export function diaLocal (fecha: Date): string {
  const dos = (n: number): string => String(n).padStart(2, '0')

  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`
}

/**
 * En que punto esta lo programado, para decirselo a quien administra.
 *
 * @param modo valor de `wiwo_modo_especial`
 * @param desde primer dia, o vacio
 * @param hasta ultimo dia (inclusive), o vacio
 * @param hoy dia de hoy, `YYYY-MM-DD`
 * @returns `apagado` sin modo o sin fechas; `programado`, `vigente` o `vencido` segun el dia
 */
export function estadoDelModo (modo: string, desde: string, hasta: string, hoy: string): EstadoDelModo {
  if (!esClaveDeModo(modo) || desde === '' || hasta === '') return 'apagado'
  if (hoy < desde) return 'programado'
  if (hoy > hasta) return 'vencido'

  return 'vigente'
}
