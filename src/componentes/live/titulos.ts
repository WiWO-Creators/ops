import type { AlcanceDeLive } from '@/dominio/live'

/**
 * El titulo del tablero segun hasta donde ve quien mira.
 *
 * `subordinados` es la rama del organigrama —la gente que depende de esta persona, directa o por
 * debajo—, `area` es la regla vieja del cargo Director. Las filas son las mismas que la API ya
 * filtro; esto solo las nombra. Lo comparten la lista (`PanelEquipo`) y las tarjetas
 * (`TarjetasDelEquipo`): las dos vistas son el mismo tablero y no pueden llamarse distinto.
 */
export const TITULO_POR_ALCANCE: Record<AlcanceDeLive, string> = {
  todo: 'El equipo, ahora',
  subordinados: 'Mi gente, ahora',
  area: 'Mi área, ahora',
  propio: 'Mi jornada, ahora'
}
