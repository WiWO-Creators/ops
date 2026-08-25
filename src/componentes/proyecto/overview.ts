import type { GraficoHoras, ResumenEspacio } from '@/datos/recursos'

/**
 * Logica pura de la pestaña Descripcion: escala del grafico de horas y lectura del resumen.
 *
 * Sin React ni `fetch`: entrada -> salida, para que `pruebas/proyecto.test.js` la pueda recorrer.
 * Sin imports de valor: el runner de Node no resuelve el alias `@/` fuera de `import type`.
 */

/** Periodos del selector, con su etiqueta visible. El orden es el del panel. */
export const PERIODOS_GRAFICO = [
  { valor: 'esta_semana', etiqueta: 'Esta semana' },
  { valor: 'semana_pasada', etiqueta: 'Semana pasada' },
  { valor: 'este_mes', etiqueta: 'Este mes' },
  { valor: 'mes_pasado', etiqueta: 'Mes pasado' }
] as const

/**
 * El valor mas alto del grafico, que define la escala vertical.
 *
 * Las series se apilan por dia, asi que la escala la marca el **total del dia**, no el maximo de una
 * serie suelta: escalar por serie haria que dos dias con el mismo total se dibujaran de alto distinto.
 *
 * @param grafico la respuesta de `/overview/chart`
 * @returns el total mas alto, o `0` si no hay ningun valor positivo
 */
export function maximoDelGrafico (grafico: GraficoHoras): number {
  let maximo = 0

  for (let i = 0; i < grafico.etiquetas.length; i += 1) {
    let total = 0

    for (const serie of grafico.series) {
      const valor = serie.valores[i]
      if (typeof valor === 'number' && Number.isFinite(valor) && valor > 0) total += valor
    }

    if (total > maximo) maximo = total
  }

  return maximo
}

/**
 * Alto de un tramo de barra, en porcentaje de la altura del grafico.
 *
 * @param valor horas decimales del tramo
 * @param maximo la escala devuelta por `maximoDelGrafico`
 * @returns el porcentaje, o `0` cuando no hay escala (grafico sin datos) o el valor no es util
 */
export function altoDeTramo (valor: number | undefined, maximo: number): number {
  if (maximo <= 0) return 0
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) return 0

  return Math.min(100, (valor / maximo) * 100)
}

/**
 * Decide si la pantalla puede pintar los bloques de dinero.
 *
 * Es la regla del panel: sin `create projects` o con facturacion de costo fijo, los importes vienen
 * en cero y pintarlos mostraria "$0" donde en realidad no hay dato.
 *
 * @param resumen la respuesta de `/overview`
 * @returns `true` si el backend habilito las finanzas para quien mira
 */
export function muestraFinanzas (resumen: ResumenEspacio): boolean {
  return resumen.logged_time.muestra_finanzas
}

/**
 * Texto de los dias restantes.
 *
 * @param days el bloque `days` del resumen, que es `null` cuando el proyecto no tiene fecha de entrega
 * @returns `"12 / 27"` con los dias restantes sobre el total, `"Vencido"` si el plazo ya paso, o el
 *          guion largo cuando no hay plazo que contar
 */
export function textoDeDias (days: ResumenEspacio['days']): string {
  if (days === null) return '—'
  if (days.left <= 0) return 'Vencido'

  return `${days.left} / ${days.total}`
}
