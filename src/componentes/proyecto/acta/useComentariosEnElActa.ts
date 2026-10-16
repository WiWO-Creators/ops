'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import type { ComentariosDelEditor, ControlDeComentarios } from './comentariosDelEditor'

/** Un fragmento ya marcado en el texto cuyo primer comentario todavía no se envía. */
export interface ComentarioPendiente {
  ancla: string
  /** El texto marcado, para que quien escribe vea a qué le comenta. */
  cita: string
}

export interface ComentariosEnElActa {
  abierto: boolean
  pendiente: ComentarioPendiente | null
  /** La ancla del hilo que se tocó en el texto: el panel lo trae a la vista. */
  elegida: string | null
  /** Las operaciones del editor abierto, o `null` si no hay (lectura). */
  control: ControlDeComentarios | null
  abrir: () => void
  /** Cierra el panel; un comentario sin enviar se descarta junto con su marca. */
  cerrar: () => void
  /** El primer comentario se envió: la marca se queda y el hilo ya existe. */
  resolverPendiente: () => void
  /** Se descarta el comentario sin enviar y se quita su marca del texto. */
  descartarPendiente: () => void
  /** Quita del texto la marca de un hilo, si hay un editor abierto. */
  quitarMarca: (ancla: string) => void
  /** Lo que se le pasa al editor; `undefined` si los comentarios no están activos. */
  paraElEditor: ComentariosDelEditor | undefined
}

/**
 * El estado de la interfaz de comentarios del Meeting Paper: si el panel está abierto, qué fragmento
 * espera su primer comentario y qué hilo se tocó en el texto.
 *
 * Un fragmento «pendiente» ya está marcado en el texto (el hilo se ata a él por la ancla) pero el
 * hilo todavía no existe en el board. Si la persona cierra el panel o pide otro fragmento sin
 * enviarlo, la marca se quita: una marca sin hilo sería un subrayado que no lleva a nada.
 *
 * @param activo los comentarios están encendidos y esta persona puede usarlos
 * @returns el estado, sus acciones y el contrato que recibe el editor
 */
export function useComentariosEnElActa (activo: boolean): ComentariosEnElActa {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, setPendiente] = useState<ComentarioPendiente | null>(null)
  const [elegida, setElegida] = useState<string | null>(null)
  // Dos copias del mismo control: la referencia sirve a los manejadores (siempre ven el de ahora sin
  // cambiar de identidad) y el estado a quien dibuja (citar el texto comentado).
  const [control, setControl] = useState<ControlDeComentarios | null>(null)
  const controlActual = useRef<ControlDeComentarios | null>(null)
  const pendienteActual = useRef<ComentarioPendiente | null>(null)

  const fijarPendiente = useCallback((siguiente: ComentarioPendiente | null) => {
    pendienteActual.current = siguiente
    setPendiente(siguiente)
  }, [])

  const quitarMarca = useCallback((ancla: string) => { controlActual.current?.quitar(ancla) }, [])

  const descartarPendiente = useCallback(() => {
    if (pendienteActual.current !== null) quitarMarca(pendienteActual.current.ancla)
    fijarPendiente(null)
  }, [fijarPendiente, quitarMarca])

  const abrir = useCallback(() => { setAbierto(true) }, [])

  const cerrar = useCallback(() => {
    descartarPendiente()
    setElegida(null)
    setAbierto(false)
  }, [descartarPendiente])

  const resolverPendiente = useCallback(() => { fijarPendiente(null) }, [fijarPendiente])

  const paraElEditor = useMemo<ComentariosDelEditor | undefined>(() => {
    if (!activo) return undefined

    return {
      onComentar: (ancla, cita) => {
        descartarPendiente()
        setElegida(null)
        fijarPendiente({ ancla, cita })
        setAbierto(true)
      },
      onElegir: (ancla) => {
        setElegida(ancla)
        setAbierto(true)
      },
      onControl: (siguiente) => {
        controlActual.current = siguiente
        setControl(siguiente)
      }
    }
  }, [activo, descartarPendiente, fijarPendiente])

  return {
    abierto, pendiente, elegida, control, abrir, cerrar, resolverPendiente, descartarPendiente, quitarMarca, paraElEditor
  }
}
