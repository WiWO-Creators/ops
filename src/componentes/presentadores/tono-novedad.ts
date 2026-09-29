import type { TonoInsignia } from '@/componentes/presentadores/Insignia'
import type { TipoNovedad } from '@/dominio/novedades'

/** Tono de la insignia de cada tipo de novedad: lo nuevo resalta, los arreglos avisan. */
export const TONO_NOVEDAD: Record<TipoNovedad, TonoInsignia> = {
  nuevo: 'exito',
  mejora: 'acento',
  arreglo: 'aviso'
}
