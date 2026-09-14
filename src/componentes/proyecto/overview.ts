import type { CampoPersonalizado, Etiqueta, GraficoHoras } from '@/datos/recursos'

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
 * Tiempo registrado del resumen, con lo podable en opcional.
 *
 * `muestra_finanzas` y los importes son del contrato del equipo: el del contacto manda el total y
 * nada mas, porque las tarifas del equipo no son asunto del cliente. Clave ausente = bloque que no
 * se dibuja, nunca un cero inventado.
 */
export interface TiempoRegistradoDeResumen {
  total_seconds: number
  muestra_finanzas?: boolean
  billable_seconds?: number
  billed_seconds?: number
  unbilled_seconds?: number
  billable_amount?: number
  billed_amount?: number
  unbilled_amount?: number
}

/**
 * Lo minimo que la pestaña Descripcion y los totales de Tiempos leen del resumen del Proyecto.
 *
 * Se declara lo que se usa y no `ResumenEspacio`: el mismo dibujo lo monta el equipo con
 * `GET /projects/{id}/overview` y el cliente con `GET /portal/projects/{id}/overview`, y el segundo
 * manda **menos claves**. La regla es una sola y no tiene ninguna rama por sujeto: **la clave
 * ausente no se dibuja**.
 *
 * `ResumenEspacio` lo satisface: todo lo que aca es opcional, alli es obligatorio.
 */
export interface ResumenDeProyecto {
  progress: number
  tasks: { total: number, open: number, completed: number, completed_percent: number }
  /** `null` cuando el proyecto no tiene fecha de entrega: no hay plazo que contar. */
  days: { total: number, left: number, left_percent: number } | null
  /** Ausente cuando el sujeto no puede ver el tiempo registrado (`view_task_total_logged_time`). */
  logged_time?: TiempoRegistradoDeResumen
  /** Ausente en el contrato del contacto: produccion no usa el modulo de ventas. */
  expenses?: { total: number, billable: number, billed: number, unbilled: number }
  /** Solo lo manda el contrato del contacto, que no tiene pestaña de Hitos con contadores arriba. */
  milestones?: { total: number, overdue: number }
  estimated_hours?: number | null
  currency?: { symbol: string } | null
  /** Bloque de importes del contrato del contacto (`view_finance_overview`). */
  finance?: { project_cost?: number | null, estimated_hours?: number | null, currency?: { symbol: string } | null }
}

/**
 * Decide si la pantalla puede pintar los bloques de dinero.
 *
 * Es la regla del panel: sin `create projects` o con facturacion de costo fijo, los importes vienen
 * en cero y pintarlos mostraria "$0" donde en realidad no hay dato. El contrato del contacto ni
 * siquiera manda `logged_time` cuando no corresponde, y entonces tampoco hay finanzas que pintar.
 *
 * @param resumen la respuesta de `/overview`, de cualquiera de los dos contratos
 * @returns `true` si el backend habilito las finanzas para quien mira
 */
export function muestraFinanzas (resumen: ResumenDeProyecto): boolean {
  return resumen.logged_time?.muestra_finanzas === true
}

/**
 * Horas estimadas del Proyecto segun el resumen.
 *
 * Los dos contratos las mandan en sitios distintos —el del equipo en la raiz, el del contacto dentro
 * de `finance`, que solo viaja con `view_finance_overview`—. Se resuelve aca, una vez, para que la
 * metrica no tenga que saber de que sujeto vino el dato.
 *
 * @param resumen la respuesta de `/overview`, de cualquiera de los dos contratos
 * @returns las horas, o `null` cuando ninguno de los dos contratos las mando
 */
export function horasEstimadasDelResumen (resumen: ResumenDeProyecto): number | null {
  return resumen.estimated_hours ?? resumen.finance?.estimated_hours ?? null
}

/**
 * Simbolo de la moneda del resumen, mirando los dos contratos.
 *
 * @param resumen la respuesta de `/overview`, de cualquiera de los dos contratos
 * @returns el simbolo, o `null` cuando no viajo: `formatearImporte` cae al de la instalacion
 */
export function simboloDelResumen (resumen: ResumenDeProyecto): string | null {
  return resumen.currency?.symbol ?? resumen.finance?.currency?.symbol ?? null
}

/**
 * Texto de los dias restantes.
 *
 * @param days el bloque `days` del resumen, que es `null` cuando el proyecto no tiene fecha de entrega
 * @returns `"12 / 27"` con los dias restantes sobre el total, `"Vencido"` si el plazo ya paso, o el
 *          guion largo cuando no hay plazo que contar
 */
export function textoDeDias (days: ResumenDeProyecto['days']): string {
  if (days === null) return '—'
  if (days.left <= 0) return 'Vencido'

  return `${days.left} / ${days.total}`
}

/**
 * El mismo plazo, en la frase del bloque que lo acompaña con su barra.
 *
 * La unidad va aca y no pegada a `textoDeDias` en la plantilla: un proyecto vencido se leia
 * "Vencido días", que no es castellano, y la tarjeta de arriba necesita el texto sin unidad.
 *
 * @param days el bloque `days` del resumen
 * @returns `"12 / 27 días"`, `"Vencido"`, o el guion largo cuando no hay plazo que contar
 */
export function textoDelPlazo (days: ResumenDeProyecto['days']): string {
  const texto = textoDeDias(days)

  return days === null || days.left <= 0 ? texto : `${texto} días`
}

/**
 * Lo minimo del Proyecto que pinta la ficha de la pestaña Descripcion.
 *
 * Se declara lo que se usa y no `Espacio`: la misma ficha la abren el equipo, con
 * `GET /projects/{id}`, y el cliente, con `GET /portal/projects/{id}`, y el segundo manda menos
 * claves. Todo lo podable es opcional y vale la misma regla que el resumen: **la clave ausente no se
 * dibuja**, que no es lo mismo que un valor vacio.
 */
export interface ProyectoDeFicha {
  id: number
  description: string | null
  start_date: string | null
  deadline: string | null
  date_finished: string | null
  /** Ausente mientras el contrato no la publique. */
  project_created?: string | null
  estimated_hours?: number | null
  /** Ausente en el contrato del contacto: las etiquetas son vocabulario interno. */
  tags?: Etiqueta[]
  /** Ausente en el contrato del contacto: los campos personalizados son vocabulario interno. */
  custom_fields?: CampoPersonalizado[]
  /**
   * Como factura el Proyecto (1 costo fijo, 2 por hora). Ausente en el contrato del contacto, que
   * publica el importe que corresponda y no la regla con la que se calcula.
   */
  billing_type?: number
  /** Solo con permiso de importes. Ausente = "no corresponde", no "cero". */
  project_cost?: number | null
  project_rate_per_hour?: number | null
}

/** Los dos importes de la ficha, ya resueltos. `null` = esa fila no se dibuja. */
export interface MontosDeLaFicha {
  costo: number | null
  tarifa: number | null
}

/**
 * Que importes le corresponde ver a quien mira la ficha del Proyecto.
 *
 * Es la regla del panel —costo total si factura por costo fijo, tarifa si factura por hora— escrita
 * una sola vez y sin preguntar por el sujeto. Cuando el contrato **no publica** `billing_type`, como
 * el del contacto, manda lo que llego: la API ya decidio que importes emitir, y esconder uno que
 * mando seria un segundo filtro sobre una decision que ya se tomo del otro lado.
 *
 * @param proyecto el Proyecto, de cualquiera de los dos contratos
 * @param puedeVerMontos si quien mira tiene permiso de importes; sin el no se muestra ninguno
 * @returns los dos importes, con `null` en el que no corresponda
 */
export function montosDeLaFicha (proyecto: ProyectoDeFicha, puedeVerMontos: boolean): MontosDeLaFicha {
  if (!puedeVerMontos) return { costo: null, tarifa: null }

  const porCostoFijo = proyecto.billing_type === undefined || proyecto.billing_type === 1
  const porHora = proyecto.billing_type === undefined || proyecto.billing_type === 2

  return {
    costo: porCostoFijo ? proyecto.project_cost ?? null : null,
    tarifa: porHora ? proyecto.project_rate_per_hour ?? null : null
  }
}
