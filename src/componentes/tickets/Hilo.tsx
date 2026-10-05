'use client'

import { ArrowDown } from 'lucide-react'
import { memo, useRef, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { EnlacePersona } from '@/componentes/presentadores/EnlacePersona'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import type { MensajeDeTicket } from '@/dominio/ticket-vista'
import { cn } from '@/lib/clases'
import { Adjuntos } from './Adjuntos'
import { useSeguimientoDelHilo } from './useSeguimientoDelHilo'

/**
 * La conversacion, del mensaje que abrio el ticket a la ultima respuesta.
 *
 * El lado se marca con relleno y una insignia, no con la alineacion: en un modal ancho, alternar
 * izquierda y derecha deja la mitad del texto lejos del ojo. El mensaje del equipo lleva el tono de
 * acento suave porque es el que casi siempre se busca al volver a un ticket.
 *
 * `aria-live="polite"` sobre la lista: lo que llega por el hilo en vivo se anuncia sin interrumpir.
 *
 * Al abrir lleva la vista al ultimo mensaje; si llegan otros mientras se lee mas arriba, no mueve
 * nada y ofrece «Nuevos mensajes» (ver `useSeguimientoDelHilo`).
 */
export const Hilo = memo(function Hilo ({ mensajes }: { mensajes: MensajeDeTicket[] }): ReactElement {
  const lista = useRef<HTMLOListElement>(null)
  const { hayNuevos, irAlUltimo } = useSeguimientoDelHilo(lista, mensajes.length)

  return (
    <section className="flex flex-col gap-3" aria-label="Conversación">
      <h4 className="text-texto-tenue text-sm font-semibold">Conversación</h4>

      <ol ref={lista} className="flex flex-col gap-3" aria-live="polite" aria-relevant="additions">
        {mensajes.map((mensaje) => (
          <li
            key={mensaje.clave}
            className={cn(
              'rounded-tarjeta flex gap-3 border p-3',
              mensaje.lado === 'equipo'
                ? 'border-linea bg-superficie-elevada shadow-1'
                : 'border-linea-suave bg-transparent'
            )}
          >
            {mensaje.autorStaffId === undefined
              ? <Avatar nombre={mensaje.autor} imagen={null} />
              : <EnlacePersona id={mensaje.autorStaffId} nombre={mensaje.autor} mostrarNombre={false} />}

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-texto text-sm font-medium">{mensaje.autor}</span>
                <Insignia tamano="chico" tono={mensaje.lado === 'equipo' ? 'acento' : 'neutro'}>
                  {mensaje.lado === 'equipo' ? 'Equipo' : 'Cliente'}
                </Insignia>
                <Fecha valor={mensaje.fecha} conHora className="text-texto-sutil text-xs" />
              </span>

              {mensaje.texto.trim() === ''
                ? <p className="text-texto-sutil text-sm">Sin texto.</p>
                : <p className="text-texto text-sm break-words whitespace-pre-line text-pretty">{mensaje.texto}</p>}

              {mensaje.adjuntos.length > 0 && <Adjuntos adjuntos={mensaje.adjuntos} />}
            </div>
          </li>
        ))}
      </ol>

      {hayNuevos && (
        // Pegado al borde inferior del panel mientras el hilo se recorre: es lo que se ve al leer
        // mas arriba, que es justo cuando hace falta.
        <div className="sticky bottom-3 z-10 flex justify-center">
          <Boton variante="primario" tamano="chico" onClick={irAlUltimo}>
            Nuevos mensajes
            <ArrowDown size={14} strokeWidth={2} aria-hidden="true" />
          </Boton>
        </div>
      )}
    </section>
  )
})
