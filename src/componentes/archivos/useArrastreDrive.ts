'use client'

import { useCallback, useRef, useState, type DragEvent } from 'react'
import { motivoParaNoSoltar, type ArrastreDrive, type DestinoDrive } from '@/dominio/drive-explorador'
import type { MigaDrive } from '@/datos/recursos'

/** Lo que una superficie necesita para recibir un arrastre: una fila, una rama del árbol o una miga. */
export interface PropsDestino {
  onDragEnter: (evento: DragEvent<HTMLElement>) => void
  onDragOver: (evento: DragEvent<HTMLElement>) => void
  onDragLeave: (evento: DragEvent<HTMLElement>) => void
  onDrop: (evento: DragEvent<HTMLElement>) => void
  'data-destino-activo'?: 'true'
}

export interface ArrastreDriveApi {
  /** Lo que se está arrastrando desde la vista, o `null`. Un arrastre de archivos del escritorio no cuenta. */
  arrastre: ArrastreDrive | null
  /** El id de la carpeta resaltada como destino, o `null`. */
  resaltado: string | null
  iniciar: (evento: DragEvent<HTMLElement>, ids: readonly string[], padreId: string, etiqueta: string) => void
  terminar: () => void
  /** Las props que convierten una superficie en destino de `destino`. */
  destino: (destino: DestinoDrive, nombre: string) => PropsDestino
}

interface Opciones {
  /** Se soltaron items de la vista sobre un destino válido. */
  onMover: (ids: readonly string[], padreId: string, destino: MigaDrive) => void
  /** Se soltaron archivos del escritorio sobre una carpeta. */
  onSubir: (archivos: File[], destino: MigaDrive) => void
}

/** Si lo que viene arrastrado son archivos del sistema operativo y no items de la vista. */
function traeArchivos (evento: DragEvent<HTMLElement>): boolean {
  return Array.from(evento.dataTransfer.types).includes('Files')
}

/**
 * Arma la imagen que acompaña al puntero: una píldora con cuántos elementos se llevan.
 *
 * Sin esto el navegador arrastra una captura de la fila de origen, que con varios seleccionados
 * miente: muestra uno y se llevan tres. Se crea, se usa y se retira en el mismo tick.
 */
function imagenDeArrastre (evento: DragEvent<HTMLElement>, etiqueta: string): void {
  const pildora = document.createElement('div')
  pildora.textContent = etiqueta
  pildora.className = 'bg-acento text-acento-contenido rounded-control fixed -left-[999px] top-0 px-3 py-1.5 text-sm font-semibold shadow-2'
  document.body.appendChild(pildora)
  evento.dataTransfer.setDragImage(pildora, 12, 16)
  setTimeout(() => { pildora.remove() }, 0)
}

/**
 * El arrastre y la suelta del explorador, con la API nativa de HTML5.
 *
 * Nativa y no una librería porque la mitad del trabajo —soltar archivos del escritorio— solo existe
 * en la API nativa: una librería de arrastre dentro de la página no ve lo que viene de afuera, y
 * habría que tener dos mecanismos para el mismo gesto. En pantallas táctiles no hay arrastre nativo;
 * ahí el camino es el menú (Mover a…), que es el mismo traslado.
 *
 * Un destino inválido no llama a `preventDefault`: el navegador muestra el cursor de "no se puede" y
 * la superficie no se resalta, sin que haga falta pintar un estado de error.
 */
export function useArrastreDrive ({ onMover, onSubir }: Opciones): ArrastreDriveApi {
  const [arrastre, setArrastre] = useState<ArrastreDrive | null>(null)
  const [resaltado, setResaltado] = useState<string | null>(null)
  const actual = useRef<ArrastreDrive | null>(null)

  const iniciar = useCallback((evento: DragEvent<HTMLElement>, ids: readonly string[], padreId: string, etiqueta: string) => {
    const nuevo = { ids: [...ids], padreId }
    actual.current = nuevo
    setArrastre(nuevo)
    evento.dataTransfer.effectAllowed = 'move'
    // Firefox no arranca un arrastre sin datos. El texto sirve además si se suelta en otra aplicación.
    evento.dataTransfer.setData('text/plain', etiqueta)
    imagenDeArrastre(evento, etiqueta)
  }, [])

  const terminar = useCallback(() => {
    actual.current = null
    setArrastre(null)
    setResaltado(null)
  }, [])

  const destino = useCallback((candidato: DestinoDrive, nombre: string): PropsDestino => {
    /** Si esta superficie acepta lo que viene: items válidos, o archivos donde se pueda escribir. */
    const acepta = (evento: DragEvent<HTMLElement>): boolean => {
      if (actual.current !== null) return motivoParaNoSoltar(candidato, actual.current) === null
      return traeArchivos(evento) && candidato.canWrite !== false
    }

    const alPasar = (evento: DragEvent<HTMLElement>): void => {
      // La superficie más interna decide: una fila dentro de la vista no deja que la vista resalte.
      evento.stopPropagation()
      if (!acepta(evento)) {
        evento.dataTransfer.dropEffect = 'none'
        return
      }
      evento.preventDefault()
      evento.dataTransfer.dropEffect = actual.current !== null ? 'move' : 'copy'
      setResaltado(candidato.id)
    }

    return {
      onDragEnter: alPasar,
      onDragOver: alPasar,
      onDragLeave: (evento) => {
        // Pasar a un hijo de la misma superficie también dispara `dragleave`: eso no es salir.
        if (evento.relatedTarget instanceof Node && evento.currentTarget.contains(evento.relatedTarget)) return
        setResaltado((antes) => (antes === candidato.id ? null : antes))
      },
      onDrop: (evento) => {
        evento.stopPropagation()
        if (!acepta(evento)) return
        evento.preventDefault()

        const llevado = actual.current
        const miga = { id: candidato.id, name: nombre }
        if (llevado !== null) onMover(llevado.ids, llevado.padreId, miga)
        else onSubir(Array.from(evento.dataTransfer.files), miga)

        actual.current = null
        setArrastre(null)
        setResaltado(null)
      },
      ...(resaltado === candidato.id ? { 'data-destino-activo': 'true' as const } : {})
    }
  }, [onMover, onSubir, resaltado])

  return { arrastre, resaltado, iniciar, terminar, destino }
}
