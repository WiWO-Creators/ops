import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

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
  return twMerge(clsx(valores))
}
