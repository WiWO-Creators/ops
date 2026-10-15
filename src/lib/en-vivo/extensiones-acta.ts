import StarterKit from '@tiptap/starter-kit'
import type { Extensions } from '@tiptap/core'

/**
 * El esquema del Meeting Paper en edición conjunta.
 *
 * Lo comparten el editor del navegador (`EditorDeActa`) y el servicio de «Ops en vivo»: el servicio
 * convierte el HTML del board a documento Yjs y de vuelta con ESTA lista, y si el editor usara otra,
 * los nodos que una no conoce se perderían en silencio al pasar de una a otra. Cualquier extensión
 * que se agregue al editor tiene que agregarse aquí.
 *
 * - `undoRedo: false` (salvo `conHistorial`): con Yjs el deshacer lo da la propia colaboración; dos
 *   pilas de historial se pisarían.
 * - `link`: `javascript:` sobrevive a cualquier parseo de HTML, así que se limitan los protocolos.
 *
 * Sin `Placeholder`: es solo presentación y no cambia el esquema.
 *
 * @param opciones `conHistorial`: deja el deshacer/rehacer propio de TipTap, para el editor de
 *        siempre (sin Yjs). No cambia el esquema, así que no afecta lo que comparten editor y servicio
 * @returns las extensiones del esquema del acta
 */
export function extensionesDeActa ({ conHistorial = false }: { conHistorial?: boolean } = {}): Extensions {
  return [
    StarterKit.configure({
      link: {
        openOnClick: false,
        protocols: ['http', 'https', 'mailto']
      },
      ...(conHistorial ? {} : { undoRedo: false as const })
    })
  ]
}
