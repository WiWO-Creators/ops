'use client'

import { Avatar } from '@/componentes/presentadores/Avatar'
import { Insignia } from '@/componentes/presentadores/Insignia'
import type { PersonaConectada } from '@/datos/auditoria'
import { cn } from '@/lib/clases'
import { haceCuanto } from './presentacion'

/** Fila de persona: identidad y actividad legibles, tiempo discreto y alerta de suplantación intacta. */
export function PersonaActiva ({ persona, compacta = false }: { persona: PersonaConectada, compacta?: boolean }) {
  return (
    <li data-persona-id={persona.staff.id} className={cn(
      'grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2.5 gap-y-1 py-3',
      !compacta && 'sm:grid-cols-[auto_minmax(0,1fr)_auto]',
      persona.impersonated_by !== null && 'bg-superficie-peligro rounded-control px-2'
    )}>
      <Avatar nombre={persona.staff.full_name} imagen={persona.staff.profile_image_url} tamano="medio" />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-texto break-words text-sm font-medium [overflow-wrap:anywhere]">{persona.staff.full_name}</span>
        <span className="text-texto-tenue text-pretty break-words text-xs leading-relaxed [overflow-wrap:anywhere]" title={persona.location}>
          {persona.activity}
        </span>
        {persona.action !== null && persona.context?.task == null && (
          <span className="text-texto-sutil text-pretty break-words text-xs">{persona.location}</span>
        )}
        {persona.impersonated_by !== null && (
          <Insignia tono="peligro" tamano="chico" className="self-start whitespace-normal">
            Suplantada por {persona.impersonated_by.full_name}
          </Insignia>
        )}
      </div>
      <span className={cn("text-texto-sutil col-start-2 text-xs tabular-nums", !compacta && "sm:col-start-3 sm:pt-0.5")}>
        {haceCuanto(persona.seconds_ago)}
      </span>
    </li>
  )
}
