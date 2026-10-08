import { Link2 } from 'lucide-react'
import type { ReactElement } from 'react'
import { leerVinculos } from '@/dominio/propuestas'

/**
 * «Vinculada con Metriq ↗»: de qué sistema de WiWO salió la Tarea.
 *
 * Una línea por vínculo. Solo es enlace cuando la dirección es https (`leerVinculos` descarta el
 * resto): una dirección que viene de otro sistema no puede ser `javascript:` ni `http:`. Sin vínculos
 * —o con una API que todavía no manda el campo— no pinta nada.
 *
 * @param vinculos el campo `vinculos` de la Tarea, sin tipar
 */
export function VinculoDeTarea ({ vinculos }: { vinculos: unknown }): ReactElement | null {
  const lista = leerVinculos(vinculos)

  if (lista.length === 0) return null

  return (
    <ul className="flex flex-col gap-0.5">
      {lista.map((vinculo) => (
        <li key={`${vinculo.system}:${vinculo.external_id}`} className="text-texto-tenue inline-flex items-center gap-1.5 text-sm">
          <Link2 size={14} aria-hidden="true" />
          {vinculo.url === null
            ? <span>Vinculada con {vinculo.system}</span>
            : (
              <a href={vinculo.url} target="_blank" rel="noopener noreferrer" className="text-acento underline">
                Vinculada con {vinculo.system} ↗
              </a>
              )}
        </li>
      ))}
    </ul>
  )
}
