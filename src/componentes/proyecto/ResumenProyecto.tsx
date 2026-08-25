import { GLOSARIO } from '@/dominio/glosario'
import type { Espacio } from '@/datos/recursos'

const SIN_DATO = '—'

export interface PropsMetrica {
  etiqueta: string
  valor: string
}

/**
 * Tarjeta de una metrica: el valor arriba y grande, la etiqueta debajo en versalita.
 *
 * @param etiqueta nombre de la metrica; se muestra en mayusculas
 * @param valor texto ya formateado — nunca un numero crudo, para que el guion sea posible
 */
export function Metrica ({ etiqueta, valor }: PropsMetrica) {
  return (
    <div className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col gap-1 border p-4">
      <span data-numerico className="text-texto text-seccion leading-none font-semibold">{valor}</span>
      <span className="text-texto-sutil text-[0.6875rem] font-medium tracking-[0.08em] uppercase">
        {etiqueta}
      </span>
    </div>
  )
}

/**
 * Formatea un numero que puede no venir.
 *
 * La API devuelve `null` en `estimated_hours` cuando nadie la cargo, y mostrar "0" ahi seria inventar
 * un dato: no es lo mismo "cero horas estimadas" que "sin estimar".
 *
 * @param valor el numero o `null`/`undefined`
 * @param sufijo texto que se pega al valor cuando existe. Ej: ` h`
 * @returns el numero con su sufijo, o el guion largo
 */
export function formatearNumero (valor: number | null | undefined, sufijo = ''): string {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return SIN_DATO

  return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(valor)}${sufijo}`
}

/**
 * Dias que faltan hasta una fecha de entrega, en dias calendario.
 *
 * Se compara por dia y en UTC, igual que `estadoVencimiento`: usar el reloj local haria que la cuenta
 * cambiara a la medianoche del huso equivocado.
 *
 * @param entrega fecha `YYYY-MM-DD` o `null`
 * @param hoy dia de referencia, inyectable para probar
 * @returns los dias restantes, o `null` si no hay fecha o no tiene la forma esperada
 */
function diasRestantes (entrega: string | null | undefined, hoy: Date = new Date()): number | null {
  if (!entrega) return null

  const [anio, mes, dia] = entrega.split('-').map(Number)
  if (anio === undefined || mes === undefined || dia === undefined) return null
  if ([anio, mes, dia].some((n) => !Number.isFinite(n))) return null

  const objetivo = Date.UTC(anio, mes - 1, dia)
  const referencia = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())

  return Math.round((objetivo - referencia) / 86400000)
}

/** Texto de la metrica de plazo: los dias que faltan, o el aviso de que ya paso. */
function textoPlazo (entrega: string | null): string {
  const dias = diasRestantes(entrega)
  if (dias === null) return SIN_DATO
  if (dias < 0) return 'Vencido'

  return `${dias} d`
}

/**
 * Fila de metricas del Proyecto.
 *
 * Las tareas completadas se derivan restando las abiertas del total: la API no manda ese contador y
 * pedir el listado entero solo para contarlo seria una consulta por pantalla.
 *
 * @param proyecto el espacio ya cargado
 * @returns la grilla de tarjetas de metrica
 */
export function ResumenProyecto ({ proyecto }: { proyecto: Espacio }) {
  const { tasks, tasks_open: abiertas, milestones } = proyecto.counts
  const completadas = typeof tasks === 'number' && typeof abiertas === 'number'
    ? Math.max(0, tasks - abiertas)
    : null

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Metrica etiqueta={`${GLOSARIO.proceso.plural} totales`} valor={formatearNumero(tasks)} />
      <Metrica etiqueta={`${GLOSARIO.proceso.plural} abiertas`} valor={formatearNumero(abiertas)} />
      <Metrica etiqueta={`${GLOSARIO.proceso.plural} completadas`} valor={formatearNumero(completadas)} />
      <Metrica etiqueta={GLOSARIO.hito.plural} valor={formatearNumero(milestones)} />
      <Metrica etiqueta="Horas estimadas" valor={formatearNumero(proyecto.estimated_hours, ' h')} />
      <Metrica etiqueta="Plazo restante" valor={textoPlazo(proyecto.deadline)} />
    </div>
  )
}
