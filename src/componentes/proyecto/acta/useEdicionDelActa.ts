'use client'

import { useState } from 'react'
import { useAviso } from '@/componentes/estado/useAviso'
import { GLOSARIO } from '@/dominio/glosario'

interface OpcionesDeEdicion {
  /** Lo que se esta viendo: el editor arranca y se descarta siempre contra esto. */
  htmlActivo: string
  /** El `date_updated` del acta a la vista ahora: la version contra la que se escribe al abrir el editor. */
  revisionActual: string | null
  /** Escribe sobre el acta original o la traduccion activa. Ver `useIdiomaDelActa`. */
  escribirEnLoVisible: (cuerpo: Record<string, string>) => Promise<string | null>
  setError: (mensaje: string | null) => void
}

export interface EdicionDelActa {
  editando: boolean
  html: string
  /**
   * El documento con el que se abrió el editor. Es lo que se le pasa como `htmlInicial`, y no
   * `htmlActivo`: si el acta se recarga mientras se corrige (el Orbe la cambió, o la revalidación al
   * volver a la pestaña), el editor no puede reemplazar lo que la persona lleva escrito.
   */
  htmlBase: string
  /** El `date_updated` que tenía el acta al abrir el editor; el guardado lo manda como `revision`. */
  revisionBase: string | null
  /** Hay correcciones sin guardar: salir sin guardar se pregunta antes. */
  sucio: boolean
  guardando: boolean
  corregir: () => void
  descartar: () => void
  cambiar: (siguiente: string) => void
  guardar: () => Promise<void>
  /** Una reescritura de la IA se aplicó en esta edición: el historial rotula la versión como `ia`. */
  marcarIa: () => void
}

/**
 * La correccion del documento visible: abrir el editor, seguir lo escrito, descartarlo o guardarlo.
 *
 * @param opciones el documento visible, su version, como escribirlo y como avisar errores
 * @returns el estado del editor y sus acciones
 */
export function useEdicionDelActa ({ htmlActivo, revisionActual, escribirEnLoVisible, setError }: OpcionesDeEdicion): EdicionDelActa {
  const [editando, setEditando] = useState(false)
  const [html, setHtml] = useState(htmlActivo)
  const [htmlBase, setHtmlBase] = useState(htmlActivo)
  const [revisionBase, setRevisionBase] = useState<string | null>(revisionActual)
  const [sucio, setSucio] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [huboIa, setHuboIa] = useState(false)
  const aviso = useAviso()

  /**
   * Abre el editor con lo que se esta viendo. Sin esto, abrir "Corregir" sobre la traduccion al
   * chino cargaria el español y guardarlo lo escribiria encima de la traduccion.
   */
  function corregir (): void {
    setHtml(htmlActivo)
    setHtmlBase(htmlActivo)
    setRevisionBase(revisionActual)
    setHuboIa(false)
    setEditando(true)
  }

  /** Cierra el editor y tira lo escrito. */
  function descartar (): void {
    setHtml(htmlActivo)
    setHtmlBase(htmlActivo)
    setRevisionBase(revisionActual)
    setSucio(false)
    setHuboIa(false)
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
   *
   * Manda como `revision` la version con la que se abrio el editor, no la que haya a la vista al
   * guardar: si el acta cambio entremedio (el Orbe u otra persona), la API contesta 409 en vez de
   * que lo escrito sobre el texto viejo pise el cambio.
   */
  async function guardar (): Promise<void> {
    setGuardando(true)
    setError(null)

    const fallo = await escribirEnLoVisible({
      content: html,
      ...(huboIa ? { origen: 'ia' } : {}),
      ...(revisionBase === null ? {} : { revision: revisionBase })
    })

    setGuardando(false)

    if (fallo !== null) {
      setError(fallo)

      return
    }

    setSucio(false)
    setHuboIa(false)
    setEditando(false)
    aviso.exito(`Correcciones del ${GLOSARIO.acta.singular} guardadas.`)
  }

  /** Marca que la IA cambió algo en esta edición. */
  function marcarIa (): void {
    setHuboIa(true)
  }

  return { editando, html, htmlBase, revisionBase, sucio, guardando, corregir, descartar, cambiar, guardar, marcarIa }
}
