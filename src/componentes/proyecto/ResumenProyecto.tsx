import { GLOSARIO } from '@/dominio/glosario'
import { diasHasta, LOCALE } from '@/lib/fechas'
import { SIN_DATO } from '@/lib/presentacion'
import type { Espacio } from '@/datos/recursos'

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
      <span className="text-texto-sutil text-xs antetitulo">
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

  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(valor)}${sufijo}`
}

/**
 * Texto de la metrica de plazo: los dias que faltan, o el aviso de que ya paso.
 *
 * Exportada porque el portal del cliente pinta la misma metrica: el plazo que ve el cliente y el que
 * ve quien lo atiende tienen que contar los dias igual.
 *
 * @param entrega fecha de entrega `YYYY-MM-DD`, o `null`
 * @returns los dias que faltan, "Vencido", o el guion cuando no hay fecha
 */
export function textoPlazo (entrega: string | null): string {
  const dias = diasHasta(entrega)
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
