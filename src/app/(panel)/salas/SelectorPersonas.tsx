'use client'

import { useState } from 'react'
import { UserPlus, X } from 'lucide-react'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { CLASES_CONTROL } from '@/componentes/formularios/Entrada'
import { ChevronSelector, CLASES_DISPARADOR } from '@/componentes/formularios/Selector'
import {
  ContenidoMenu, DisparadorMenu, ItemMenuMarcable, MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import { filtrarPersonas } from '@/dominio/salas'
import { cn } from '@/lib/clases'
import type { PersonaDeSala } from '@/datos/recursos'

interface PropsSelectorPersonas {
  personas: PersonaDeSala[]
  elegidas: number[]
  onCambiar: (ids: number[]) => void
  id?: string
}

/**
 * Elige quienes del equipo van a la reunion.
 *
 * Menu con marcas y no un `Select`: se eligen varias, y el `Select` de Radix es de una sola opcion.
 * Es el mismo control que usa el filtro múltiple de las tablas, así que se ve y se maneja igual.
 *
 * **El buscador no es opcional**: la instalación tiene más de 180 personas, y una lista de 180 filas
 * sin filtrar no es un control, es un obstáculo. Sus teclas se frenan con `stopPropagation` porque
 * Radix implementa "tipear para saltar a una opción" en el menú, y sin eso cada letra que se escribe
 * mueve el foco a otra fila en vez de escribirse.
 *
 * Las elegidas se muestran como chips debajo, con su avatar: el resumen "3 personas" obliga a abrir
 * el menú para saber quiénes son, y quien revisa una reserva ajena necesita justamente eso.
 */
export function SelectorPersonas ({ personas, elegidas, onCambiar, id }: PropsSelectorPersonas) {
  const [busqueda, setBusqueda] = useState('')

  const visibles = filtrarPersonas(personas, busqueda)
  const elegidasEnOrden = personas.filter((persona) => elegidas.includes(persona.id))

  /** Agrega o saca a una persona de la lista. */
  function alternar (personaId: number): void {
    onCambiar(
      elegidas.includes(personaId)
        ? elegidas.filter((elegida) => elegida !== personaId)
        : [...elegidas, personaId]
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <MenuContextual onOpenChange={(abierto) => { if (!abierto) setBusqueda('') }}>
        <DisparadorMenu
          id={id}
          className={cn(CLASES_DISPARADOR, elegidas.length === 0 && 'text-texto-sutil')}
        >
          <span className="flex min-w-0 items-center gap-2">
            <UserPlus size={14} aria-hidden="true" className="shrink-0" />
            <span className="truncate">
              {elegidas.length === 0
                ? 'Agregar personas'
                : `${elegidas.length} ${elegidas.length === 1 ? 'persona' : 'personas'}`}
            </span>
          </span>
          <ChevronSelector />
        </DisparadorMenu>

        <ContenidoMenu align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
          <div className="p-1">
            <input
              className={cn(CLASES_CONTROL, 'h-8 text-sm')}
              placeholder="Buscar por nombre…"
              value={busqueda}
              aria-label="Buscar una persona"
              onChange={(evento) => setBusqueda(evento.target.value)}
              onKeyDown={(evento) => evento.stopPropagation()}
            />
          </div>

          {/* La lista scrollea dentro del menú: con 180 filas, un menú del alto del contenido tapa
              la pantalla entera y deja el diálogo inalcanzable. */}
          <div className="max-h-64 overflow-y-auto">
            {visibles.length === 0
              ? <p className="text-texto-sutil px-2.5 py-3 text-center text-xs">Nadie con ese nombre.</p>
              : visibles.map((persona) => (
                <ItemMenuMarcable
                  key={persona.id}
                  checked={elegidas.includes(persona.id)}
                  onCheckedChange={() => alternar(persona.id)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar nombre={persona.full_name} imagen={persona.profile_image_url} tamano="chico" />
                    <span className="truncate">{persona.full_name}</span>
                  </span>
                </ItemMenuMarcable>
                ))}
          </div>
        </ContenidoMenu>
      </MenuContextual>

      {elegidasEnOrden.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {elegidasEnOrden.map((persona) => (
            <li key={persona.id}>
              <button
                type="button"
                onClick={() => alternar(persona.id)}
                aria-label={`Sacar a ${persona.full_name}`}
                className={cn(
                  'bg-relleno-neutro text-relleno-neutro-contenido rounded-control',
                  'flex items-center gap-1.5 py-0.5 pl-0.5 pr-2 text-xs',
                  'transition-[filter] duration-150 hover:brightness-95'
                )}
              >
                <Avatar nombre={persona.full_name} imagen={persona.profile_image_url} tamano="chico" />
                <span className="max-w-40 truncate">{persona.full_name}</span>
                <X size={12} aria-hidden="true" className="shrink-0 opacity-70" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
