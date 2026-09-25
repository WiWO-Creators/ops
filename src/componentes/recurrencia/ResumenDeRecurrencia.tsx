'use client'

import { Repeat2 } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { fraseDeRegla, textoDeFinDeRegla } from '@/dominio/recurrencia'
import { formatearFecha } from '@/lib/fechas'
import type { Proceso } from '@/datos/recursos'
import { EditorDeRegla } from './EditorDeRegla'
import { HistorialDeCopias } from './HistorialDeCopias'

/** Lo que el resumen lee de la Tarea: la regla guardada, tal como la trae `GET /tasks/{id}`. */
type TareaRecurrente = Pick<Proceso, 'id' | 'name' | 'start_date' | 'repeat_every' | 'recurring_type' | 'cycles' |
'recurring_until' | 'skip_weekdays' | 'recurring_paused' | 'recurring_paused_at' | 'recurring_copies_count'>

/**
 * La recurrencia de una Tarea, de lectura, en su ficha: cada cuanto, que dias no, como termina y si
 * esta pausada. Con permiso de edicion, "Editar recurrencia" abre el mismo editor que el listado de
 * recurrentes, sin pasar por el formulario completo de la Tarea.
 *
 * Tambien es la constancia de lo que genero: cuantas copias, y "Ver copias" abre su historial.
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
  const [viendoCopias, setViendoCopias] = useState(false)
  const copias = tarea.recurring_copies_count
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
        {copias !== undefined && (
          <p className="text-texto-tenue text-xs">
            {copias === 0 ? 'Todavía no generó copias' : copias === 1 ? '1 copia generada' : `${copias} copias generadas`}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Boton variante="sutil" tamano="chico" onClick={() => { setViendoCopias(true) }}>
          Ver copias
        </Boton>
        {puedeEditar && (
          <Boton variante="secundario" tamano="chico" onClick={() => { setEditando(true) }}>
            Editar recurrencia
          </Boton>
        )}
      </div>

      <EditorDeRegla
        tarea={editando ? { ...tarea, paused: pausada } : null}
        onCerrar={() => { setEditando(false) }}
        onGuardada={onCambiada}
      />
      <HistorialDeCopias regla={viendoCopias ? { id: tarea.id, name: tarea.name } : null} onCerrar={() => { setViendoCopias(false) }} />
    </section>
  )
}
