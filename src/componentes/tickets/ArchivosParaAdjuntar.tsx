'use client'

import { Paperclip, X } from 'lucide-react'
import { useId, useRef, useState, type ChangeEvent, type ReactElement } from 'react'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { formatearTamano } from '@/dominio/drive-explorador'
import {
  MAXIMO_ADJUNTOS_DE_TICKET,
  agregarAdjuntosDeTicket,
  atributoAccept,
  descripcionDeLosLimites
} from '@/dominio/ticket-adjuntos'

interface Props {
  archivos: File[]
  onCambiar: (archivos: File[]) => void
  /** `true` mientras se envia: no se puede cambiar lo que ya esta saliendo. */
  deshabilitado?: boolean
}

/**
 * Los archivos que acompanan a un mensaje de ticket, elegidos pero todavia sin enviar.
 *
 * No sube nada: los deja en el formulario y el envio los manda **junto con el mensaje** en el mismo
 * `multipart/form-data`. Por eso solo se elige y se quita, y lo que no cumple el tope (cantidad,
 * tamano o tipo) se explica aca mismo, con el nombre del archivo, en vez de esperar al rechazo del
 * servidor.
 *
 * Los archivos viven en el estado del formulario y **no se guardan en el borrador**: `sessionStorage`
 * guarda texto, y un archivo elegido se vuelve a elegir.
 */
export function ArchivosParaAdjuntar ({ archivos, onCambiar, deshabilitado = false }: Props): ReactElement {
  const selector = useRef<HTMLInputElement>(null)
  const idLimites = useId()
  const [rechazados, setRechazados] = useState<string[]>([])
  const llena = archivos.length >= MAXIMO_ADJUNTOS_DE_TICKET

  function alElegir (evento: ChangeEvent<HTMLInputElement>): void {
    const elegidos = Array.from(evento.target.files ?? [])

    // Se limpia para que elegir el mismo archivo otra vez (despues de quitarlo) dispare el cambio.
    evento.target.value = ''
    if (elegidos.length === 0) return

    const resultado = agregarAdjuntosDeTicket(archivos, elegidos)

    onCambiar(resultado.lista)
    setRechazados(resultado.rechazados)
  }

  function quitar (indice: number): void {
    onCambiar(archivos.filter((_, i) => i !== indice))
    setRechazados([])
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={selector}
          type="file"
          multiple
          hidden
          accept={atributoAccept()}
          aria-label="Elegir archivos para adjuntar"
          onChange={alElegir}
        />
        <Boton
          type="button"
          tamano="chico"
          disabled={deshabilitado || llena}
          aria-describedby={idLimites}
          onClick={() => { selector.current?.click() }}
        >
          <Paperclip className="size-3.5" aria-hidden="true" />
          Adjuntar archivos
        </Boton>
        <span id={idLimites} className="text-texto-sutil text-xs">{descripcionDeLosLimites()}</span>
      </div>

      {rechazados.length > 0 && (
        <ul className="flex flex-col gap-0.5" aria-label="Archivos que no se adjuntaron">
          {rechazados.map((motivo) => (
            <li key={motivo}><AvisoEnLinea variante="error" mensaje={motivo} /></li>
          ))}
        </ul>
      )}

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
                onClick={() => { quitar(indice) }}
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
