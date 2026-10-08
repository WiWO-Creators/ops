import 'server-only'

import { baseApi, esperaDeModoEspecial } from './config'
import { leerModoVigente, type ModoVigente } from '@/dominio/modos-especiales'

/** Etiqueta de cache de la lectura; la invalida `revalidarModoEspecial()` al guardar. */
export const ETIQUETA_MODO_ESPECIAL = 'modo-especial'

/** Segundos que la lectura se reutiliza entre paginas antes de volver a preguntar. */
const REVALIDAR_SEGUNDOS = 60

/**
 * El modo especial vigente hoy, o `null` si no hay ninguno.
 *
 * Va sin token porque la pagina de acceso, el portal y las pantallas tambien lo pintan
 * (`GET /public/modo`). Se cachea un minuto y nunca rompe la pagina: sin respuesta, con error o con
 * un modo que este frontend no conoce, la pagina sale como siempre.
 *
 * @returns el modo vigente, o `null`
 */
export async function leerModoEspecial (): Promise<ModoVigente | null> {
  try {
    const respuesta = await fetch(`${baseApi()}/public/modo`, {
      headers: { accept: 'application/json' },
      next: { revalidate: REVALIDAR_SEGUNDOS, tags: [ETIQUETA_MODO_ESPECIAL] },
      signal: AbortSignal.timeout(esperaDeModoEspecial())
    })

    if (!respuesta.ok) return null

    const sobre = await respuesta.json() as { data?: unknown }

    return leerModoVigente(sobre.data)
  } catch {
    // Sin API, sin variable de entorno o con la respuesta rota: la pagina vale mas que el adorno.
    return null
  }
}
