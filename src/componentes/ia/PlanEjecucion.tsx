import { Check, CircleAlert, ClipboardList, LoaderCircle } from 'lucide-react'
import type { ReactElement } from 'react'
import type { Paso, Plan } from '@/dominio/ia-ejecucion'
import { TextoChat } from './TextoChat'

/** Presenta los pasos aprobables en orden, con sus datos, supuestos y resultados completos. */
export function PlanEjecucion ({ plan }: { plan: Plan }): ReactElement {
  const completados = plan.pasos.filter(p => ['completada', 'ejecutada'].includes(p.estado)).length
  const resumenRepetido = plan.pasos.length === 1 && plan.resumen.trim() === plan.pasos[0]?.descripcion.trim()
  return (
    <div className="border-linea rounded-xl border">
      <div className="border-linea flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h3 className="text-texto flex items-center gap-2 text-base font-semibold">
          <ClipboardList aria-hidden="true" className="size-4 shrink-0" />Plan de trabajo
        </h3>
        <span className="text-texto-tenue text-sm tabular-nums">
          {completados > 0 ? `${completados} de ${plan.pasos.length} completados` : `${plan.pasos.length} ${plan.pasos.length === 1 ? 'paso' : 'pasos'}`}
        </span>
      </div>
      {plan.resumen.trim() && !resumenRepetido && <TextoChat texto={plan.resumen} className="px-4 pt-4" />}
      <ol aria-label="Pasos del plan" className="divide-linea divide-y px-4">
        {plan.pasos.map((paso, indice) => <PasoDelPlan key={paso.id} paso={paso} numero={indice + 1} />)}
      </ol>
      {plan.pasos.length === 0 && <p className="text-texto-tenue px-4 py-4 text-sm">El detalle de los pasos todavía no está disponible.</p>}
    </div>
  )
}

/** Distingue la operación de sus condiciones y del resultado sin ocultar datos aprobables. */
function PasoDelPlan ({ paso, numero }: { paso: Paso, numero: number }): ReactElement {
  const hecho = ['completada', 'ejecutada'].includes(paso.estado)
  const fallido = paso.estado === 'error'
  const activo = paso.estado === 'ejecutando'
  const etiqueta = hecho ? 'Hecho' : fallido ? 'Error' : activo ? 'En curso' : paso.estado === 'cancelada' ? 'Cancelado' : paso.estado === 'pendiente' ? 'Pendiente' : paso.estado
  const Icono = hecho ? Check : fallido ? CircleAlert : activo ? LoaderCircle : null
  return (
    <li className="flex min-w-0 gap-3 py-4">
      <span className="bg-relleno-neutro text-texto mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums" aria-hidden="true">
        {Icono ? <Icono className="size-3.5" /> : numero}
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="space-y-1">
          <TextoChat texto={paso.descripcion} className="font-semibold" />
          <p className={`text-xs font-medium ${fallido ? 'text-texto-peligro' : hecho ? 'text-texto-exito' : 'text-texto-tenue'}`}>{etiqueta}</p>
        </div>
        {paso.detalle && paso.detalle.length > 0 && <div className="space-y-2">{paso.detalle.map((texto, i) => <TextoChat key={i} texto={texto} className="text-texto-tenue" />)}</div>}
        {paso.supuestos && paso.supuestos.length > 0 && (
          <div className="space-y-1">
            <p className="text-texto text-sm font-medium">Supuestos para revisar</p>
            <ul className="text-texto-tenue list-disc space-y-1 pl-4">{paso.supuestos.map((texto, i) => <li key={i}><TextoChat texto={texto} /></li>)}</ul>
          </div>
        )}
        {paso.resultado?.resumen && <TextoChat texto={paso.resultado.resumen} />}
        {paso.error?.mensaje && <TextoChat texto={paso.error.mensaje} className="text-texto-peligro" />}
      </div>
    </li>
  )
}
