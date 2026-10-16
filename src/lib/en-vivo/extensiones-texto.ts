import { mergeAttributes, Node } from '@tiptap/core'
import type { Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { esSrcDeImagenRica, MAXIMO_DE_ALT } from '../../dominio/imagenes-ricas.ts'

/**
 * El esquema del texto enriquecido interno (`EditorRicoInterno`): descripción de tarea, respuesta de
 * ticket, comentarios.
 *
 * Lo comparten el editor del navegador y el servicio de «Ops en vivo» (adaptadores `tarea` y
 * `ticket-borrador`): el servicio convierte el HTML del board a documento Yjs y de vuelta con ESTA
 * lista, y si el editor usara otra, los nodos que una no conoce se perderían en silencio al pasar de
 * una a otra. Cualquier extensión que se agregue al editor tiene que agregarse aquí.
 *
 * El esquema coincide con lo único que `dominio/texto-rico.ts` sabe dibujar: párrafos, títulos 2 y 3,
 * listas, negrita, cursiva, subrayado, tachado, enlaces, citas e imágenes propias. Sin código, bloque
 * de código ni línea horizontal. Solo importa módulos con ruta relativa y extensión `.ts`: lo carga
 * Node directamente.
 */

/**
 * El nodo `<img>` del texto enriquecido.
 *
 * Es propio y no `@tiptap/extension-image`: aquella acepta cualquier `src` (incluido `data:` y
 * dominios externos) y trae redimensionado y atributos que la API descarta. Esta solo reconoce la
 * ruta propia de las imágenes del texto (`esSrcDeImagenRica`) y conserva `src` y `alt`; una imagen
 * pegada desde otra página con cualquier otro `src` no entra al documento, que es la misma regla del
 * saneador de la API. Una imagen subida por el editor se inserta con el `src` que devolvió la API.
 *
 * Es de línea (`inline`) y atómica, como en un correo: va dentro de un párrafo, se selecciona y se
 * borra entera, y se arrastra para moverla.
 */
export const ImagenRica = Node.create({
  name: 'imagenRica',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes () {
    return {
      src: { default: null },
      alt: { default: '' }
    }
  },

  parseHTML () {
    return [{
      tag: 'img[src]',
      getAttrs: (elemento) => {
        const src = elemento.getAttribute('src')

        return esSrcDeImagenRica(src)
          ? { src, alt: (elemento.getAttribute('alt') ?? '').slice(0, MAXIMO_DE_ALT) }
          : false
      }
    }]
  },

  renderHTML ({ HTMLAttributes }) {
    return ['img', mergeAttributes({ src: HTMLAttributes.src, alt: HTMLAttributes.alt ?? '' })]
  }
})

/**
 * Las extensiones del texto enriquecido interno.
 *
 * - `link`: `javascript:` sobrevive a cualquier parseo de HTML, así que se limitan los protocolos.
 * - `undoRedo: false` en edición conjunta (`conHistorial: false`): con Yjs el deshacer lo da la propia
 *   colaboración, y dos pilas de historial se pisarían. No cambia el esquema.
 *
 * Sin `Placeholder`: es solo presentación y no cambia el esquema; el editor lo agrega por su cuenta.
 *
 * @param opciones `conHistorial`: deja el deshacer/rehacer propio de TipTap (por omisión, sí)
 * @returns las extensiones del esquema
 */
export function extensionesDeTexto ({ conHistorial = true }: { conHistorial?: boolean } = {}): Extensions {
  return [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      horizontalRule: false,
      heading: { levels: [2, 3] },
      link: {
        openOnClick: false,
        protocols: ['http', 'https', 'mailto']
      },
      ...(conHistorial ? {} : { undoRedo: false as const })
    }),
    ImagenRica
  ]
}
