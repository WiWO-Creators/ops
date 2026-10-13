import { Trash2 } from 'lucide-react'
import type { ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'

interface PropsBotonEliminarChat {
  /** Por qué no se puede ahora; va en el tooltip, no en un párrafo fijo. */
  motivoDeshabilitado?: string
  onClick: () => void
}

/**
 * «Eliminar chat» como icono discreto, para la barra superior de la pestaña del Proyecto. En el
 * panel flotante no existe: ahí lo hace «Nueva conversación», en la cabecera.
 *
 * El tooltip va en el contenedor porque un botón deshabilitado no recibe el puntero en todos los
 * navegadores.
 */
export function BotonEliminarChat ({ motivoDeshabilitado, onClick }: PropsBotonEliminarChat): ReactElement {
  const titulo = motivoDeshabilitado ?? 'Eliminar chat'
  return (
    <div className="flex justify-end">
      <span title={titulo} className="inline-flex">
        <Boton soloIcono variante="sutil" tamano="chico" aria-label="Eliminar chat" title={titulo} disabled={motivoDeshabilitado !== undefined} onClick={onClick}>
          <Trash2 aria-hidden="true" className="size-4" />
        </Boton>
      </span>
    </div>
  )
}
