'use client'

import { useMemo } from 'react'
import { UserPlus } from 'lucide-react'
import { SelectorBuscableMultiple } from '@/componentes/formularios/SelectorBuscableMultiple'
import type { StaffReferencia } from '@/datos/tipos'

interface PropsSelectorPersonas {
  personas: StaffReferencia[]
  elegidas: number[]
  onCambiar: (ids: number[]) => void
  id?: string
}

/**
 * Elige a varias personas del equipo: los asistentes de una reunion, los asignados de una Tarea.
 *
 * Es `SelectorBuscableMultiple` con avatar: la instalación tiene más de 180 personas, y quien revisa
 * una reserva ajena necesita ver quiénes son sin abrir el menú.
 */
export function SelectorPersonas ({ personas, elegidas, onCambiar, id }: PropsSelectorPersonas) {
  const opciones = useMemo(
    () => personas.map((persona) => ({ id: persona.id, nombre: persona.full_name, imagen: persona.profile_image_url })),
    [personas]
  )

  return (
    <SelectorBuscableMultiple
      id={id}
      opciones={opciones}
      elegidos={elegidas}
      onCambiar={onCambiar}
      icono={UserPlus}
      resumen={(lista) => lista.length === 0
        ? 'Agregar personas'
        : `${lista.length} ${lista.length === 1 ? 'persona' : 'personas'}`}
      placeholder="Buscar una persona…"
      sinResultados="Nadie con ese nombre."
      etiquetaSacar={(nombre) => `Sacar a ${nombre}`}
    />
  )
}
