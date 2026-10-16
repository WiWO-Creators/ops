import { Plus } from 'lucide-react'
import type { ReactElement } from 'react'
import type { ChipSugerido } from '@/dominio/sugerencias-tarea'
import { cn } from '@/lib/clases'

interface PropsSugerenciasDeCampo {
  /** Nombre del campo, para el grupo que anuncia el lector de pantalla. Ej: «Asignados». */
  campo: string
  chips: ChipSugerido[]
  /** Se hizo clic en un chip: el formulario aplica el valor y lo registra como aceptado. */
  onAceptar: (chip: ChipSugerido) => void
  deshabilitado?: boolean
}

/**
 * «Sugeridos: + Ana, + Luis» bajo un campo del formulario de Tarea.
 *
 * Nunca aplica nada solo: cada chip es un botón y el valor entra al campo con el clic. Sin chips no
 * pinta nada —ni el rótulo—, así un Espacio sin historial o con la función apagada deja el
 * formulario exactamente como estaba.
 *
 * @param campo nombre del campo, para el nombre accesible del grupo
 * @param chips las sugerencias que quedan pendientes en ese campo
 * @param onAceptar qué hacer al aceptar una
 * @param deshabilitado bloquea los botones mientras se envía el formulario
 */
export function SugerenciasDeCampo ({ campo, chips, onAceptar, deshabilitado = false }: PropsSugerenciasDeCampo): ReactElement | null {
  if (chips.length === 0) return null

  return (
    <div role="group" aria-label={`Sugeridos para ${campo}`} className="flex flex-wrap items-center gap-1.5">
      <span aria-hidden="true" className="text-texto-sutil text-xs">Sugeridos:</span>
      {chips.map((chip) => (
        <button
          key={`${chip.campo}:${chip.valor}`}
          type="button"
          disabled={deshabilitado}
          title={chip.ayuda}
          aria-label={`Agregar ${chip.texto}. ${chip.ayuda}`}
          onClick={() => { onAceptar(chip) }}
          className={cn(
            'rounded-control border-linea text-texto-tenue inline-flex h-6 max-w-full items-center gap-1 border px-2 text-xs font-medium',
            'transition-colors duration-rapida ease-neo hover:bg-hover hover:text-texto',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          <Plus size={12} strokeWidth={2} aria-hidden="true" className="shrink-0" />
          <span className="truncate">{chip.texto}</span>
        </button>
      ))}
    </div>
  )
}
