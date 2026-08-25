/**
 * Formatos compartidos por las pestañas del detalle de Proyecto.
 *
 * Sin React ni `fetch`: son funciones puras, y por eso `pruebas/proyecto.test.js` las puede recorrer.
 * Las importan tambien las definiciones de recurso, que corren bajo el runner de Node.
 */

/**
 * Formatea segundos como `HH:MM`, sin dias.
 *
 * Replica `Format::secondsToTime` del panel: 30 horas se muestran `30:05`, no `1d 6:05`. Cambiarlo
 * haria que dos pantallas del mismo sistema informaran el mismo dato de forma distinta.
 *
 * @param segundos total de segundos; lo negativo o no finito se trata como cero
 * @returns el texto `HH:MM`, con dos digitos en cada parte
 */
export function segundosAHoraMinuto (segundos: number): string {
  const seguro = Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos) : 0
  const horas = Math.floor(seguro / 3600)
  const minutos = Math.floor((seguro - horas * 3600) / 60)

  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`
}

/**
 * Formatea un importe con su simbolo de moneda.
 *
 * El simbolo llega como dato del proyecto (`UF`, `$`, `USD`): no se asume ninguno, porque la
 * instalacion tiene monedas configurables y mostrar la equivocada es peor que no mostrar ninguna.
 *
 * @param valor el importe; `null` o no finito devuelven el guion largo
 * @param simbolo simbolo de la moneda, o `null` si no vino
 * @returns el importe con dos decimales y su simbolo delante, o `—`
 */
export function formatearImporte (valor: number | null | undefined, simbolo: string | null = null): string {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return '—'

  const numero = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(valor)

  return simbolo === null || simbolo === '' ? numero : `${simbolo} ${numero}`
}

/**
 * Convierte a texto plano lo que la API devuelve con saltos de linea en HTML.
 *
 * El feed de actividad y las notas guardan el contenido con `nl2br` aplicado en el panel, asi que
 * llegan con `<br />` literal. **No se interpreta como HTML**: se traduce a saltos de linea, que es
 * lo unico que ese marcado significa, y asi el contenido de un usuario nunca se inyecta en la pagina.
 *
 * @param valor el texto tal como llega, o `null`
 * @returns el texto con saltos de linea de verdad, o cadena vacia
 */
export function textoPlano (valor: string | null | undefined): string {
  if (typeof valor !== 'string') return ''

  return valor.replace(/<br\s*\/?>/gi, '\n').trim()
}
