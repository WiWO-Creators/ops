'use client'

import { Paperclip } from 'lucide-react'
import { memo, type ReactElement } from 'react'
import type { MensajeDeTicket } from '@/dominio/ticket-vista'

/** Los adjuntos de un mensaje, para bajar. Solo lectura: subir queda fuera de esta pantalla. */
export const Adjuntos = memo(function Adjuntos ({ adjuntos }: { adjuntos: MensajeDeTicket['adjuntos'] }): ReactElement {
  return (
    <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="Adjuntos">
      {adjuntos.map((adjunto) => (
        <li key={adjunto.id} className="min-w-0">
          {adjunto.ruta === null
            ? (
              <span className="border-linea-suave rounded-control text-texto-sutil inline-flex max-w-64 items-center gap-1.5 border px-2 py-1 text-xs">
                <Paperclip size={12} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                <span className="truncate">{adjunto.nombre}</span>
              </span>
              )
            : (
              <a
                href={adjunto.ruta}
                download={adjunto.nombre}
                aria-label={`Descargar ${adjunto.nombre}`}
                className="border-linea rounded-control text-texto hover:bg-hover hover:text-acento inline-flex max-w-64 items-center gap-1.5 border px-2 py-1 text-xs transition-colors duration-rapida ease-neo"
              >
                <Paperclip size={12} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                <span className="truncate">{adjunto.nombre}</span>
              </a>
              )}
        </li>
      ))}
    </ul>
  )
})
