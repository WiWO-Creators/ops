'use client'

import { Paperclip, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactElement } from 'react'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { formatearTamano } from '@/dominio/drive-explorador'
import { esImagenSubible, nombreDeCaptura } from '@/dominio/imagenes-ricas'
import { cn } from '@/lib/clases'
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
 *
 * === ARRASTRAR Y PEGAR ===
 *
 * Ademas del boton, vale **soltar archivos sobre el formulario** y **pegar** (una captura del
 * portapapeles, o archivos copiados del explorador). Los oidores cuelgan del `<form>` que contiene al
 * componente, no de el: el area de soltar es todo el formulario. Dos reglas evitan pisar al editor de
 * texto: una imagen soltada o pegada DENTRO del editor es una imagen incrustada en el texto —el editor
 * la toma y marca el evento como atendido—, y un pegado con texto es texto. Lo demas —un PDF soltado
 * sobre el editor, una captura pegada en el asunto— se adjunta. Sin esto, soltar un PDF fuera de un
 * area de soltar hace que el navegador abra el archivo y se pierda lo escrito.
 */
export function ArchivosParaAdjuntar ({ archivos, onCambiar, deshabilitado = false }: Props): ReactElement {
  const selector = useRef<HTMLInputElement>(null)
  const raiz = useRef<HTMLDivElement>(null)
  const idLimites = useId()
  const [rechazados, setRechazados] = useState<string[]>([])
  const [arrastrando, setArrastrando] = useState(false)
  const llena = archivos.length >= MAXIMO_ADJUNTOS_DE_TICKET

  // Los oidores se montan una vez y leen lo ultimo por ref: si no, cada tecla del formulario los
  // quitaria y volveria a poner.
  const estado = useRef({ archivos, onCambiar, deshabilitado })

  useEffect(() => {
    estado.current = { archivos, onCambiar, deshabilitado }
  })

  useEffect(() => {
    const formulario = raiz.current?.closest('form')

    if (formulario === null || formulario === undefined) return

    /** Suma lo recibido a lo elegido y explica lo que no entro. */
    function recibir (recibidos: File[]): void {
      const { archivos: actuales, onCambiar: cambiar } = estado.current
      const resultado = agregarAdjuntosDeTicket(actuales, recibidos.map(conNombreDeCaptura))

      cambiar(resultado.lista)
      setRechazados(resultado.rechazados)
    }

    const traeArchivos = (evento: DragEvent): boolean => Array.from(evento.dataTransfer?.types ?? []).includes('Files')

    function alPasar (evento: ClipboardEvent): void {
      const { deshabilitado: bloqueado } = estado.current
      const recibidos = Array.from(evento.clipboardData?.files ?? [])
      const hayTexto = (evento.clipboardData?.getData('text/plain') ?? '').trim() !== ''
      const enEditor = evento.target instanceof Element && evento.target.closest('.texto-rico-editor') !== null
      const todasImagenes = recibidos.length > 0 && recibidos.every(esImagenSubible)

      // Una imagen pegada en el editor es del editor; y un pegado con texto es texto.
      if (bloqueado || recibidos.length === 0 || hayTexto || evento.defaultPrevented || (enEditor && todasImagenes)) return

      evento.preventDefault()
      recibir(recibidos)
    }

    function alArrastrar (evento: DragEvent): void {
      if (estado.current.deshabilitado || !traeArchivos(evento)) return

      // Sin `preventDefault` el navegador no deja soltar y, al soltar, abre el archivo.
      evento.preventDefault()
      setArrastrando(true)
    }

    function alSalir (evento: DragEvent): void {
      if (evento.relatedTarget instanceof Node && formulario?.contains(evento.relatedTarget) === true) return

      setArrastrando(false)
    }

    function alSoltar (evento: DragEvent): void {
      setArrastrando(false)

      // El editor ya tomo las imagenes que le tocaban.
      if (evento.defaultPrevented || estado.current.deshabilitado || !traeArchivos(evento)) return

      evento.preventDefault()
      recibir(Array.from(evento.dataTransfer?.files ?? []))
    }

    formulario.addEventListener('paste', alPasar)
    formulario.addEventListener('dragover', alArrastrar)
    formulario.addEventListener('dragleave', alSalir)
    formulario.addEventListener('drop', alSoltar)

    return () => {
      formulario.removeEventListener('paste', alPasar)
      formulario.removeEventListener('dragover', alArrastrar)
      formulario.removeEventListener('dragleave', alSalir)
      formulario.removeEventListener('drop', alSoltar)
    }
  }, [])

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
    <div
      ref={raiz}
      className={cn(
        'flex flex-col gap-2 rounded-control transition-colors duration-rapida',
        arrastrando && 'bg-hover outline-acento outline-2 outline-dashed outline-offset-4'
      )}
    >
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
        <span id={idLimites} className="text-texto-sutil text-xs">
          {descripcionDeLosLimites()} También puedes arrastrarlos o pegarlos.
        </span>
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

/**
 * Le da nombre propio a una captura pegada, que los navegadores llaman `image.png`.
 *
 * @param archivo lo recibido
 * @returns el mismo archivo, o una copia con el nombre `captura-AAAAMMDD-HHMMSS.ext` si venia de la plantilla
 */
function conNombreDeCaptura (archivo: File): File {
  const nombre = nombreDeCaptura(archivo)

  return nombre === archivo.name ? archivo : new File([archivo], nombre, { type: archivo.type, lastModified: archivo.lastModified })
}
