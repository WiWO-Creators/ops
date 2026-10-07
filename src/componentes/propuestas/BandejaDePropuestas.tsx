'use client'

import { Link2, Plug } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { Vacio } from '@/componentes/estado/Estados'
import { TarjetaPropuestaIA } from '@/componentes/ia/TarjetaPropuestaIA'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { aAccionIA, type PropuestaExterna } from '@/dominio/propuestas'
import type { AccionIA } from '@/dominio/ia'
import type { FiltroDePropuestas } from '@/datos/propuestas'

/**
 * La bandeja: una tarjeta por propuesta, con el sistema de origen a la vista.
 *
 * La decisión la toma `TarjetaPropuestaIA`, la misma del chat: manda solo `{ decision }` a
 * `POST /ia/acciones/{id}` y pinta lo que el servidor devuelve. Acá solo se reemplaza la propuesta por
 * su versión resuelta; lo que se confirmó queda en la lista (en «Por responder» sale al recargar).
 */
export function BandejaDePropuestas ({ inicial, filtro }: { inicial: PropuestaExterna[], filtro: FiltroDePropuestas }): ReactElement {
  const [resueltas, setResueltas] = useState<Record<number, AccionIA>>({})

  if (inicial.length === 0) {
    return (
      <Vacio
        titulo={filtro === 'pendiente' ? 'No tienes propuestas por responder' : 'Aún no hay propuestas'}
        descripcion="Cuando otro sistema de WiWO te deje algo preparado, lo verás aquí para confirmarlo o rechazarlo."
      />
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {inicial.map((propuesta) => (
        <li key={propuesta.id} className="border-linea bg-superficie-elevada flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-texto-tenue inline-flex items-center gap-1.5 text-sm">
              <Plug size={14} aria-hidden="true" />
              <strong className="text-texto font-medium">{propuesta.origin.name}</strong>
            </span>
            <span className="text-texto-sutil text-xs">
              Recibida <Fecha valor={propuesta.created_at} conHora />
            </span>
          </div>

          <TarjetaPropuestaIA
            accion={resueltas[propuesta.id] ?? aAccionIA(propuesta)}
            onResuelta={(accion) => { setResueltas((previas) => ({ ...previas, [propuesta.id]: accion })) }}
          />

          {propuesta.link !== null && propuesta.link.url !== '' && (
            <a
              href={propuesta.link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-acento inline-flex items-center gap-1.5 text-sm underline"
            >
              <Link2 size={14} aria-hidden="true" />
              Ver en {propuesta.origin.name} ↗
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}
