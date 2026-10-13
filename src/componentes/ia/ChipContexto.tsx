import { X } from 'lucide-react'
import type { ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'

interface PropsChipContexto {
  /** Lo que se manda como contexto: «Tareas», «Meeting Paper #12»… */
  etiqueta: string
  /** Si el contexto está quitado: en vez del chip, un botón para volver a añadirlo. */
  quitado: boolean
  onQuitar: () => void
  onRestablecer: () => void
}

/**
 * El contexto de pantalla que viaja con la pregunta, a la vista y con salida: quien no quiere que el
 * agente sepa dónde está parado lo quita con la X.
 */
export function ChipContexto ({ etiqueta, quitado, onQuitar, onRestablecer }: PropsChipContexto): ReactElement {
  if (quitado) {
    return <Boton tamano="chico" variante="sutil" className="self-start" onClick={onRestablecer}>Añadir contexto: {etiqueta}</Boton>
  }

  return (
    <p className="border-linea bg-superficie-hundida text-texto-tenue rounded-control inline-flex items-center gap-1 self-start border py-0.5 pl-2.5 pr-1 text-xs">
      <span>Contexto: <span className="text-texto font-medium">{etiqueta}</span></span>
      <button
        type="button"
        onClick={onQuitar}
        aria-label={`Quitar el contexto: ${etiqueta}`}
        className="hover:bg-hover hover:text-texto rounded-chico focus-visible:outline-acento flex size-6 items-center justify-center focus-visible:outline-2"
      >
        <X aria-hidden="true" className="size-3.5" />
      </button>
    </p>
  )
}
