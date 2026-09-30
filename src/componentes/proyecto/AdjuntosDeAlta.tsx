'use client'

import { useRef, type ChangeEvent, type ReactElement } from 'react'
import { Paperclip, X } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { agregarAdjuntos } from '@/dominio/adjuntos-alta'
import { formatearTamano } from '@/dominio/drive-explorador'

interface Props {
  archivos: File[]
  onCambiar: (archivos: File[]) => void
  /** Avisa por qué un archivo no entró. */
  onRechazados: (motivos: string[]) => void
  deshabilitado?: boolean
}

/**
 * Los archivos sueltos de una Tarea que todavía no existe, junto a su descripción.
 *
 * No sube nada: los deja en el formulario y el alta los manda a la carpeta de Drive de la Tarea en
 * cuanto esta se crea. Por eso el control es solo elegir y quitar.
 */
export function AdjuntosDeAlta ({ archivos, onCambiar, onRechazados, deshabilitado = false }: Props): ReactElement {
  const selector = useRef<HTMLInputElement>(null)

  function alElegir (evento: ChangeEvent<HTMLInputElement>): void {
    const elegidos = Array.from(evento.target.files ?? [])
    evento.target.value = ''
    if (elegidos.length === 0) return

    const { lista, rechazados } = agregarAdjuntos(archivos, elegidos)
    onCambiar(lista)
    onRechazados(rechazados)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={selector} type="file" multiple hidden aria-label="Elegir archivos para adjuntar" onChange={alElegir} />
        <Boton tamano="chico" disabled={deshabilitado} onClick={() => { selector.current?.click() }}>
          <Paperclip className="size-3.5" aria-hidden="true" />
          Adjuntar archivos
        </Boton>
        <span className="text-texto-sutil text-xs">Se guardan en la carpeta de Drive de la tarea.</span>
      </div>

      {archivos.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Archivos por adjuntar">
          {archivos.map((archivo, indice) => (
            <li key={`${archivo.name}-${archivo.size}-${archivo.lastModified}`} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{archivo.name} <span className="text-texto-sutil text-xs">{formatearTamano(archivo.size)}</span></span>
              <button
                type="button"
                disabled={deshabilitado}
                aria-label={`Quitar ${archivo.name}`}
                className="text-texto-tenue hover:text-texto-peligro rounded-control inline-flex size-7 shrink-0 items-center justify-center"
                onClick={() => { onCambiar(archivos.filter((_, i) => i !== indice)) }}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
