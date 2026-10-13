'use client'

import { Check, CircleAlert, ClipboardList, LoaderCircle, Pencil, Trash2 } from 'lucide-react'
import { useRef, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/clases'
import { hayPasoDestructivo, riesgoDePaso, type Paso, type Plan, type RiesgoPaso } from '@/dominio/ia-ejecucion'
import { TextoChat } from './TextoChat'
import { useAnimacionPasoActivo } from './useAnimacionPasoActivo'

interface PropsPlanEjecucion {
  plan: Plan
  /**
   * Confirmar y Cancelar. Van en una barra fija al pie del plan: con un plan largo siguen a la vista
   * sin hacer scroll hasta el final. Si el plan tiene un paso destructivo, la barra lo avisa.
   */
  acciones?: ReactNode
}

/** Cómo se distingue cada riesgo: el color nunca va solo, siempre lo acompaña icono y texto. */
const ESTILO_RIESGO: Record<Exclude<RiesgoPaso, 'lectura'>, { marcador: string, texto: string, etiqueta: string, Icono: typeof Trash2 }> = {
  destructiva: { marcador: 'bg-superficie-peligro text-texto-peligro', texto: 'text-texto-peligro', etiqueta: 'Elimina o quita', Icono: Trash2 },
  escritura: { marcador: 'bg-acento-suave text-texto', texto: 'text-texto-tenue', etiqueta: 'Modifica datos', Icono: Pencil }
}

/** Presenta los pasos aprobables en orden, con sus datos, supuestos y resultados completos. */
export function PlanEjecucion ({ plan, acciones }: PropsPlanEjecucion): ReactElement {
  const completados = plan.pasos.filter(p => ['completada', 'ejecutada'].includes(p.estado)).length
  const resumenRepetido = plan.pasos.length === 1 && plan.resumen.trim() === plan.pasos[0]?.descripcion.trim()
  return (
    <div className="border-linea rounded-tarjeta border">
      <div className="border-linea flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h3 className="text-texto flex items-center gap-2 text-base font-semibold">
          <ClipboardList aria-hidden="true" className="size-4 shrink-0" />Plan de trabajo
        </h3>
        <span className="text-texto-tenue text-sm tabular-nums">
          {completados > 0 ? `${completados} de ${plan.pasos.length} completados` : `${plan.pasos.length} ${plan.pasos.length === 1 ? 'paso' : 'pasos'}`}
        </span>
      </div>
      {plan.resumen.trim() && !resumenRepetido && <TextoChat texto={plan.resumen} className="px-4 pt-4" />}
      {/* Los pasos scrollean dentro del plan (tope de alto): así la barra fija nunca los tapa y siguen a la
          vista. Es enfocable para poder recorrerlos con el teclado. */}
      <ol aria-label="Pasos del plan" tabIndex={0} className="divide-linea focus-visible:outline-acento max-h-[min(18rem,40dvh)] divide-y overflow-y-auto px-4 focus-visible:outline-2 focus-visible:-outline-offset-2">
        {plan.pasos.map((paso, indice) => <PasoDelPlan key={paso.id} paso={paso} numero={indice + 1} />)}
      </ol>
      {plan.pasos.length === 0 && <p className="text-texto-tenue px-4 py-4 text-sm">El detalle de los pasos todavía no está disponible.</p>}
      {acciones !== undefined && (
        <div className="border-linea bg-superficie-hundida rounded-b-tarjeta sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-4 py-3">
          {hayPasoDestructivo(plan)
            ? (
              <p className="text-texto-peligro flex min-w-0 flex-1 basis-48 items-center gap-2 text-xs font-medium">
                <Trash2 aria-hidden="true" className="size-4 shrink-0" />Elimina o quita datos: revísalo antes de confirmar.
              </p>
              )
            : <span className="flex-1" />}
          <div className="flex flex-wrap items-center justify-end gap-2 [&>button]:min-h-11 [&>button]:whitespace-normal">{acciones}</div>
        </div>
      )}
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
  const riesgo = riesgoDePaso(paso)
  const estilo = riesgo === null || riesgo === 'lectura' ? null : ESTILO_RIESGO[riesgo]
  const halo = useRef<HTMLSpanElement>(null)
  useAnimacionPasoActivo(halo, activo)
  return (
    <li className="flex min-w-0 gap-3 py-4" aria-current={activo ? 'step' : undefined}>
      <span className={cn('relative mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums', estilo?.marcador ?? 'bg-relleno-neutro text-texto')} aria-hidden="true">
        {activo && <span ref={halo} className="bg-acento absolute inset-0 rounded-full opacity-60" />}
        <span className="relative flex items-center justify-center">{Icono ? <Icono className="size-3.5" /> : numero}</span>
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="space-y-1">
          <TextoChat texto={paso.descripcion} className="font-semibold" />
          <p className={`text-xs font-medium ${fallido ? 'text-texto-peligro' : hecho ? 'text-texto-exito' : 'text-texto-tenue'}`}>{etiqueta}</p>
          {estilo && (
            <p className={cn('flex items-center gap-1.5 text-xs font-semibold', estilo.texto)}>
              <estilo.Icono aria-hidden="true" className="size-3.5 shrink-0" />{estilo.etiqueta}
            </p>
          )}
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
