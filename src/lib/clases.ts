import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * Tamaños de texto propios del `@theme` de `globals.css` que `tailwind-merge` no conoce.
 *
 * Sin declararlos, toma `text-titulo` por un COLOR: contra un `text-texto` al lado borraba uno de
 * los dos, y el titulo salia a 14px sin que nada fallara. `pruebas/clases.test.js` falla si
 * `globals.css` suma un `--text-*` que no esta aca.
 */
export const TAMANOS_DE_TEXTO = ['micro', 'menor', 'titulo', 'subtitulo', 'cifra', 'seccion', 'pantalla', 'heroe'] as const

/** Capas de `z-index` con nombre de `globals.css` (`--z-index-*`). */
export const CAPAS_Z = ['flotante', 'superposicion', 'aviso', 'telon', 'bienvenida'] as const

const unirClases = extendTailwindMerge({
  extend: {
    theme: { text: [...TAMANOS_DE_TEXTO] },
    classGroups: { z: [{ z: [...CAPAS_Z] }] }
  }
})

/**
 * Une clases condicionales resolviendo los conflictos de Tailwind.
 *
 * `clsx` arma la lista y `twMerge` deja la ultima utilidad de cada familia: sin el, pasarle
 * `className="p-6"` a un componente que ya trae `p-4` deja las dos y gana la que el CSS tenga mas
 * abajo, que no es la que quien llama espera.
 *
 * @param valores clases, condicionales o arrays
 * @returns la cadena de clases final
 */
export function cn (...valores: ClassValue[]): string {
  return unirClases(clsx(valores))
}
