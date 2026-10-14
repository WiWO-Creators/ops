/**
 * Recarga automatica cuando la pestana quedo con el JavaScript de un deploy anterior.
 *
 * Despues de publicar, los archivos con hash de la version vieja desaparecen del servidor. Una
 * pestana que llevaba horas abierta pide uno de ellos al navegar, falla con `ChunkLoadError` y deja
 * la vista rota hasta que alguien recarga a mano. Recargar una vez trae la version nueva.
 *
 * La guardia existe por el caso contrario: si el chunk falla por otra causa (una red cortada, un
 * archivo realmente ausente), recargar en cada fallo seria un bucle infinito. Se recuerda en
 * `sessionStorage` cuando fue la ultima recarga y no se repite dentro de {@link VENTANA_DE_RECARGA_MS}.
 */

/** Donde se anota la hora de la ultima recarga automatica. */
export const CLAVE_RECARGA_POR_DESPLIEGUE = 'ops:recarga-por-despliegue'

/** Tiempo durante el cual una recarga ya hecha impide otra. Pasado este margen, un deploy nuevo vuelve a poder recargar. */
export const VENTANA_DE_RECARGA_MS = 10 * 60 * 1000

/** Lo minimo que se usa del almacenamiento de sesion, para poder probarlo con uno falso. */
export type AlmacenDeRecarga = Pick<Storage, 'getItem' | 'setItem'>

/**
 * Decide si toca recargar y, de ser asi, lo deja anotado.
 *
 * Con el almacenamiento inaccesible —modo privado, datos bloqueados— devuelve `false`: sin guardia no
 * se puede garantizar que sea una sola vez, y una vista rota es mejor que un bucle de recargas.
 *
 * @param almacen el `sessionStorage`, o `null` si no esta disponible
 * @param ahora la hora actual en milisegundos
 * @returns `true` si hay que recargar ahora
 */
export function reservarRecarga (almacen: AlmacenDeRecarga | null, ahora: number): boolean {
  if (almacen === null) return false

  try {
    const previa = Number(almacen.getItem(CLAVE_RECARGA_POR_DESPLIEGUE))

    if (Number.isFinite(previa) && previa > 0 && ahora - previa < VENTANA_DE_RECARGA_MS) return false

    almacen.setItem(CLAVE_RECARGA_POR_DESPLIEGUE, String(ahora))

    return true
  } catch {
    return false
  }
}

/**
 * Recarga la pagina una sola vez ante un chunk que ya no existe.
 *
 * Seguro en el servidor: sin `window` no hace nada.
 *
 * @returns `true` si lanzo la recarga, `false` si ya se habia recargado o no hay donde anotarlo
 */
export function recargarPorDespliegue (): boolean {
  if (typeof window === 'undefined') return false

  let almacen: Storage | null = null

  try {
    almacen = window.sessionStorage
  } catch {
    almacen = null
  }

  if (!reservarRecarga(almacen, Date.now())) return false

  window.location.reload()

  return true
}
