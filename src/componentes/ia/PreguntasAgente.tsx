'use client'

import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { cn } from '@/lib/clases'
import { preguntaPulsable, respuestaDePreguntas, type PreguntaAgente, type PreguntaPulsable } from '@/dominio/ia-ejecucion'
import { TextoChat } from './TextoChat'

interface PropsPreguntasAgente {
  /** Las preguntas de la ejecución que espera datos. */
  preguntas: PreguntaAgente[]
  /** Bloquea los botones mientras se envía o hay un error de seguimiento. */
  deshabilitado: boolean
  /** Manda la respuesta como `reanudar`. */
  onResponder: (respuesta: string) => void
}

/** Clases de una opción: ancho completo, alto táctil y texto que puede partirse. */
const CLASE_OPCION = 'h-auto min-h-11 w-full justify-start whitespace-normal py-2 text-left'

/**
 * Las preguntas del agente cuando faltan datos, con opciones pulsables.
 *
 * - Una sola pregunta pulsable: elegir una opción responde en el acto.
 * - Varias: cada opción se marca y un botón envía todas las respuestas juntas, una por línea.
 * - Aquí solo hay botones: si la pregunta admite texto libre, se escribe en el compositor principal,
 *   cuyo placeholder ya pide los datos. Una pregunta sin `id` o sin opciones se degrada a la vista de
 *   lista de siempre.
 *
 * @param props preguntas, estado de bloqueo y manejador de respuesta
 */
export function PreguntasAgente ({ preguntas, deshabilitado, onResponder }: PropsPreguntasAgente): ReactElement {
  const [elegidas, setElegidas] = useState<Record<string, string>>({})
  const pulsables = preguntas.map(preguntaPulsable)
  const cantidad = pulsables.filter(p => p !== null).length
  const inmediato = cantidad === 1 && preguntas.length === 1

  const respuestaDe = (p: PreguntaPulsable): string => elegidas[p.id] ?? ''
  const completas = cantidad > 0 && cantidad === preguntas.length && pulsables.every(p => p !== null && respuestaDe(p) !== '')

  /** Envía las respuestas de todas las preguntas pulsables. */
  function enviarTodas (): void {
    const respuestas = pulsables.flatMap(p => p === null ? [] : [{ pregunta: p.pregunta, respuesta: respuestaDe(p) }])
    onResponder(respuestaDePreguntas(respuestas))
  }

  return (
    <div className="space-y-4">
      {preguntas.map((pregunta, indice) => {
        const pulsable = pulsables[indice] ?? null
        if (pulsable === null) {
          return (
            <div key={indice} className="space-y-2">
              <TextoChat texto={pregunta.pregunta} className="font-medium" />
              {pregunta.opciones && <ul className="text-texto-tenue list-disc pl-5">{pregunta.opciones.map(o => <li key={o}><TextoChat texto={o} /></li>)}</ul>}
            </div>
          )
        }
        return (
          <div key={pulsable.id} role="group" aria-label={pulsable.pregunta} className="space-y-2">
            <TextoChat texto={pulsable.pregunta} className="font-medium" />
            <ul className="flex flex-col gap-1.5">
              {pulsable.opciones.map(opcion => {
                const marcada = !inmediato && elegidas[pulsable.id] === opcion
                return (
                  <li key={opcion}>
                    <Boton
                      className={cn(CLASE_OPCION, marcada && 'border-acento bg-acento-suave')}
                      aria-pressed={inmediato ? undefined : marcada}
                      disabled={deshabilitado}
                      onClick={() => {
                        if (inmediato) onResponder(opcion)
                        else setElegidas(e => ({ ...e, [pulsable.id]: opcion }))
                      }}
                    >
                      {opcion}
                    </Boton>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
      {cantidad > 0 && !inmediato && (
        <Boton variante="primario" className="min-h-11" disabled={deshabilitado || !completas} onClick={enviarTodas}>Responder y continuar</Boton>
      )}
    </div>
  )
}
