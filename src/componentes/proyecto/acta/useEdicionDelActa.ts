'use client'

import { useState } from 'react'
import { useAviso } from '@/componentes/estado/useAviso'
import { GLOSARIO } from '@/dominio/glosario'

interface OpcionesDeEdicion {
  /** Lo que se esta viendo: el editor arranca y se descarta siempre contra esto. */
  htmlActivo: string
  /** Escribe sobre el acta original o la traduccion activa. Ver `useIdiomaDelActa`. */
  escribirEnLoVisible: (cuerpo: Record<string, string>) => Promise<string | null>
  setError: (mensaje: string | null) => void
}

export interface EdicionDelActa {
  editando: boolean
  html: string
  /** Hay correcciones sin guardar: salir sin guardar se pregunta antes. */
  sucio: boolean
  guardando: boolean
  corregir: () => void
  descartar: () => void
  cambiar: (siguiente: string) => void
  guardar: () => Promise<void>
}

/**
 * La correccion del documento visible: abrir el editor, seguir lo escrito, descartarlo o guardarlo.
 *
 * @param opciones el documento visible, como escribirlo y como avisar errores
 * @returns el estado del editor y sus acciones
 */
export function useEdicionDelActa ({ htmlActivo, escribirEnLoVisible, setError }: OpcionesDeEdicion): EdicionDelActa {
  const [editando, setEditando] = useState(false)
  const [html, setHtml] = useState(htmlActivo)
  const [sucio, setSucio] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const aviso = useAviso()

  /**
   * Abre el editor con lo que se esta viendo. Sin esto, abrir "Corregir" sobre la traduccion al
   * chino cargaria el español y guardarlo lo escribiria encima de la traduccion.
   */
  function corregir (): void {
    setHtml(htmlActivo)
    setEditando(true)
  }

  /** Cierra el editor y tira lo escrito. */
  function descartar (): void {
    setHtml(htmlActivo)
    setSucio(false)
    setEditando(false)
  }

  /** Sigue lo que se escribe en el editor. */
  function cambiar (siguiente: string): void {
    setHtml(siguiente)
    setSucio(true)
  }

  /**
   * Guarda las correcciones sobre lo que se esta viendo: el acta original o la traduccion activa.
   *
   * La traduccion corregida NO se vuelve a traducir: lo que se guarda es lo que la persona escribio.
   */
  async function guardar (): Promise<void> {
    setGuardando(true)
    setError(null)

    const fallo = await escribirEnLoVisible({ content: html })

    setGuardando(false)

    if (fallo !== null) {
      setError(fallo)

      return
    }

    setSucio(false)
    setEditando(false)
    aviso.exito(`Correcciones del ${GLOSARIO.acta.singular} guardadas.`)
  }

  return { editando, html, sucio, guardando, corregir, descartar, cambiar, guardar }
}
