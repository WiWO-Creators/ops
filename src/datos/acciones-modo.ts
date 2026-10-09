'use server'

import { updateTag } from 'next/cache'
import { ETIQUETA_MODO_ESPECIAL } from './modo-especial'

/**
 * Descarta la lectura cacheada del modo especial para que el cambio recien guardado se vea ya y no
 * dentro de un minuto. Solo invalida cache: no lee ni escribe nada.
 */
export async function revalidarModoEspecial (): Promise<void> {
  updateTag(ETIQUETA_MODO_ESPECIAL)
}
