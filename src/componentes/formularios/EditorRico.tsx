'use client'

import dynamic from 'next/dynamic'
import type { CSSProperties, ReactElement } from 'react'
import { EditorRicoMarcador } from './EditorRicoMarcador'
import type { PropsEditorRico } from './EditorRicoInterno'

/**
 * El editor de texto enriquecido, cargado bajo demanda.
 *
 * === POR QUE `next/dynamic` ===
 *
 * Tiptap pesa ~100 KB. Un `import` estatico lo mete en el chunk de cada pantalla que tenga un cuadro
 * de texto —tickets, tareas, comentarios—, y lo paga quien nunca escribe nada. Con
 * `dynamic(..., { ssr: false })` el bundle se baja al montar el campo. Mientras tanto se dibuja un
 * area de texto deshabilitada del mismo alto (`EditorRicoMarcador`), para que la pagina no salte.
 *
 * `ssr: false` tampoco es opcional: Tiptap necesita el DOM, y prerrenderizarlo rompe la hidratacion.
 *
 * === COMO SE USA ===
 *
 * Dentro de `Campo`, con el cableado que entrega su funcion hija:
 *
 * ```tsx
 * <Campo etiqueta="Mensaje" error={error}>
 *   {(campo) => <EditorRico etiqueta="Mensaje" onCambio={setHtml} {...campo} />}
 * </Campo>
 * ```
 *
 * Es no controlado a proposito: `valorInicial` se lee una sola vez. Para vaciarlo despues de enviar,
 * se remonta cambiando su `key`.
 */
const EditorRicoInterno = dynamic(
  async () => (await import('./EditorRicoInterno')).EditorRicoInterno,
  { ssr: false, loading: () => <EditorRicoMarcador /> }
)

export type { HerramientaRica, PropsEditorRico } from './EditorRicoInterno'

export function EditorRico (props: PropsEditorRico): ReactElement {
  const estilo = { '--filas-rico': props.filasMinimas ?? 4 } as CSSProperties

  return (
    <div style={estilo} className="w-full">
      <EditorRicoInterno {...props} />
    </div>
  )
}
