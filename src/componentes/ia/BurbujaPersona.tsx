import type { ReactElement } from 'react'
import { cn } from '@/lib/clases'

/**
 * La burbuja de la persona: alineada a la derecha, sin citas y sin estados.
 *
 * @param texto lo que escribió la persona
 * @param comoItem si va como `<li>` propio de una lista (consulta) o como párrafo dentro de otro item (agente)
 * @param className clases extra para el párrafo
 */
export function BurbujaPersona ({ texto, comoItem = false, className }: { texto: string, comoItem?: boolean, className?: string }): ReactElement {
  const burbuja = (
    <p className={cn('bg-relleno-neutro text-relleno-neutro-contenido rounded-tarjeta max-w-[85%] whitespace-pre-wrap wrap-anywhere px-3 py-2 text-sm', className)}>
      {texto}
    </p>
  )

  return comoItem ? <li className="animate-aparecer flex justify-end">{burbuja}</li> : burbuja
}
