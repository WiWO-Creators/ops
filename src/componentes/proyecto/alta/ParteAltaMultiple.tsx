import type { ReactElement } from 'react'
import { GLOSARIO } from '@/dominio/glosario'
import type { ResumenParcial } from './modelo'

/**
 * El parte del alta multiple: que paso en cada Espacio, con nombre. Sin esto, "se crearon 3 de 5"
 * obliga a abrir los cinco para saber cuales faltan.
 */
export function ParteAltaMultiple ({ parcial }: { parcial: ResumenParcial }): ReactElement {
  return (
    <div role="alert" className="border-linea rounded-medio flex flex-col gap-1.5 border p-3">
      <p className="text-texto text-sm font-medium">
        La tarea se creó en {parcial.hechos.filter((hecho) => hecho.ok).length} de {parcial.hechos.length} {GLOSARIO.espacio.plural.toLowerCase()}.
      </p>
      <ul className="flex flex-col gap-1">
        {parcial.hechos.map((hecho) => (
          <li key={hecho.espacioId} className={hecho.ok ? 'text-texto-sutil text-xs' : 'text-texto-peligro text-xs'}>
            <span className="font-medium">{hecho.nombre}:</span> {hecho.detalle}
          </li>
        ))}
      </ul>
      {parcial.pendientes.length > 0 && (
        <p className="text-texto-sutil text-xs">
          Los que fallaron quedaron seleccionados: corrige lo que haga falta y vuelve a crear.
          Los que ya se crearon no se repiten.
        </p>
      )}
    </div>
  )
}
