'use client'

import dynamic from 'next/dynamic'
import type { ReactElement } from 'react'
import { EditorRicoMarcador } from '@/componentes/formularios/EditorRicoMarcador'
import type { PropsEditorRicoConjunto } from './EditorRicoConjuntoInterno'

/**
 * El editor de texto enriquecido en edición conjunta, cargado bajo demanda.
 *
 * Mismo criterio que `EditorRico`: Yjs y el proveedor de Hocuspocus pesan, y quien nunca activa la
 * edición conjunta no tiene por qué pagarlos. Solo se baja cuando una pantalla lo monta, que lo hace
 * únicamente con la edición conjunta de textos encendida (`config.textos`).
 *
 * Es no controlado, igual que `EditorRico`: `valorInicial` solo se usa si la edición conjunta no abre
 * y se sigue con el editor de siempre. Para cambiar el contenido desde fuera, `reemplazo`.
 *
 * @param props las de `EditorRico` más el documento (`tarea` o `ticket-borrador`) que se edita
 */
const EditorRicoConjuntoInterno = dynamic(
  async () => (await import('./EditorRicoConjuntoInterno')).EditorRicoConjuntoInterno,
  { ssr: false, loading: () => <EditorRicoMarcador /> }
)

export type { DocumentoDeTexto, PropsEditorRicoConjunto } from './EditorRicoConjuntoInterno'

export function EditorRicoConjunto (props: PropsEditorRicoConjunto): ReactElement {
  return <EditorRicoConjuntoInterno {...props} />
}
