import { mergeAttributes, Node } from '@tiptap/react'
import { esSrcDeImagenRica, MAXIMO_DE_ALT } from '@/dominio/imagenes-ricas'

/**
 * El nodo `<img>` del editor de texto enriquecido.
 *
 * Es propio y no `@tiptap/extension-image`: aquella acepta cualquier `src` (incluido `data:` y
 * dominios externos) y trae redimensionado y atributos que la API descarta. Esta solo reconoce la
 * ruta propia de las imagenes del texto (`esSrcDeImagenRica`) y conserva `src` y `alt`; una imagen
 * pegada desde otra pagina con cualquier otro `src` no entra al documento, que es la misma regla del
 * saneador de la API. Una imagen subida por el editor se inserta con el `src` que devolvio la API.
 *
 * Es de linea (`inline`) y atomica, como en un correo: va dentro de un parrafo, se selecciona y se
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
