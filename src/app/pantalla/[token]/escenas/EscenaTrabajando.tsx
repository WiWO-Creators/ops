import type { ReactNode } from 'react'
import type { PersonaTrabajando } from '@/datos/pantalla-area'
import { Cara, Corriendo, Nada, Ocultos, TituloDeEscena } from './piezas'

/**
 * Quien tiene jornada abierta ahora mismo, con cuanto lleva.
 *
 * El contador mide la JORNADA, no el tiempo medido: son cosas distintas y la pantalla no las mezcla.
 * Cuanto se midio contra que es la escena siguiente.
 *
 * No aparece quien no abrio jornada. La escena contesta "quien esta trabajando ahora", y una lista de
 * gente que no esta trabajando no contesta eso; el total del equipo ya viaja en la portada.
 */
export function EscenaTrabajando ({ items, ocultos, ahora, congelado }: {
  items: PersonaTrabajando[]
  ocultos: number
  ahora: number | null
  congelado: boolean
}): ReactNode {
  if (items.length === 0) return <Nada texto="Nadie con jornada abierta" />

  return (
    <div className="flex min-h-0 flex-col">
      <TituloDeEscena>Trabajando ahora</TituloDeEscena>

      <ul className="grid grid-cols-2 gap-[2.5vmin] sm:grid-cols-3 lg:grid-cols-4">
        {items.map((persona) => (
          <li
            key={persona.staff_id}
            className="border-linea bg-superficie-elevada flex items-center gap-[2vmin] rounded-[2vmin] border p-[2vmin]"
          >
            <Cara nombre={persona.name} imagen={persona.avatar} />

            <div className="flex min-w-0 flex-col gap-[0.4vmin]">
              <p className="text-texto truncate text-[3.6vmin] leading-tight font-semibold">
                {persona.name}
              </p>
              {persona.cargo !== null && (
                <p className="text-texto-tenue truncate text-[2.6vmin]">{persona.cargo}</p>
              )}
              <Corriendo
                desde={persona.jornada_started_at}
                ahora={ahora}
                congelado={congelado}
                className="text-acento text-[3.2vmin] font-semibold"
              />
            </div>
          </li>
        ))}
      </ul>

      <Ocultos cuantos={ocultos} />
    </div>
  )
}
