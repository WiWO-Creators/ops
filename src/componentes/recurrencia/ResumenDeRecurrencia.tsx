'use client'

import { Repeat2 } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { fraseDeRegla, textoDeFinDeRegla } from '@/dominio/recurrencia'
import { formatearFecha } from '@/lib/fechas'
import type { Proceso } from '@/datos/recursos'
import { EditorDeRegla } from './EditorDeRegla'

/** Lo que el resumen lee de la Tarea: la regla guardada, tal como la trae `GET /tasks/{id}`. */
type TareaRecurrente = Pick<Proceso, 'id' | 'name' | 'start_date' | 'repeat_every' | 'recurring_type' | 'cycles' |
'recurring_until' | 'skip_weekdays' | 'recurring_paused' | 'recurring_paused_at'>

/**
 * La recurrencia de una Tarea, de lectura, en su ficha: cada cuanto, que dias no, como termina y si
 * esta pausada. Con permiso de edicion, "Editar recurrencia" abre el mismo editor que el listado de
 * recurrentes, sin pasar por el formulario completo de la Tarea.
 *
 * @param tarea la Tarea recurrente
 * @param puedeEditar si se ofrece editar la regla
 * @param onCambiada se llama tras guardar, para que la ficha se vuelva a pedir
 */
export function ResumenDeRecurrencia ({ tarea, puedeEditar, onCambiada }: {
  tarea: TareaRecurrente
  puedeEditar: boolean
  onCambiada: () => void
}): ReactElement {
  const [editando, setEditando] = useState(false)
  const pausada = tarea.recurring_paused === true
  const frase = fraseDeRegla(tarea.repeat_every, tarea.recurring_type, tarea.skip_weekdays ?? [])

  return (
    <section aria-labelledby={`recurrencia-${tarea.id}`} className="border-linea bg-superficie-elevada rounded-tarjeta flex flex-wrap items-start gap-3 border p-3">
      <Repeat2 size={16} aria-hidden="true" className="text-texto-sutil mt-0.5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h4 id={`recurrencia-${tarea.id}`} className="text-texto-tenue flex items-center gap-2 text-sm font-semibold">
          Recurrencia
          {pausada && <Insignia tamano="chico">Pausada</Insignia>}
        </h4>
        <p className="text-texto text-sm">{frase ?? 'Sin frecuencia: vuelve a guardar la recurrencia.'}</p>
        <p className="text-texto-sutil text-xs">
          {textoDeFinDeRegla(tarea.cycles, tarea.recurring_until, (fecha) => formatearFecha(fecha))}
          {pausada && tarea.recurring_paused_at != null && ` · Pausada desde el ${formatearFecha(tarea.recurring_paused_at)}`}
        </p>
      </div>
      {puedeEditar && (
        <Boton variante="secundario" tamano="chico" onClick={() => { setEditando(true) }}>
          Editar recurrencia
        </Boton>
      )}

      <EditorDeRegla
        tarea={editando ? { ...tarea, paused: pausada } : null}
        onCerrar={() => { setEditando(false) }}
        onGuardada={onCambiada}
      />
    </section>
  )
}
