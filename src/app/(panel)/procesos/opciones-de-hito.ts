import 'server-only'

import { opcionesDeFiltroDeHito, TOPE_DE_HITOS } from '@/componentes/proyecto/hitos'
import { pedirOpcional } from '@/datos/servidor'
import type { Hito } from '@/datos/recursos'
import type { OpcionFiltro } from '@/definiciones/tipos'

/**
 * Opciones del filtro por Hito de la vista de Procesos, para tabla y tablero.
 *
 * **Un hito pertenece a un Espacio**, y esta vista es transversal: no hay un catalogo global de hitos
 * ni un `GET /milestones` que lo devuelva —la API solo los expone bajo `GET /projects/{id}/milestones`—.
 * Asi que el catalogo se resuelve contra el Espacio que la persona haya elegido en el filtro de al
 * lado: sin Espacio, la lista sale vacia y `ControlesTabla` no dibuja el desplegable, que es lo
 * honesto mientras no se sepa de que Espacio son los hitos que habria que ofrecer.
 *
 * Se resuelve en el servidor y no en el navegador porque el estado de la vista vive en la URL: al
 * elegir un Espacio, Next vuelve a renderizar la pagina con el `searchParams` nuevo y estas opciones
 * bajan ya hechas, sin una peticion mas desde el cliente ni un filtro que aparece tarde.
 *
 * Vive aparte de las dos paginas porque las dos lo necesitan igual, y una copia que se desincronice
 * deja el tablero filtrando distinto que la tabla.
 *
 * `pedirOpcional` y no `pedir`: quien no tenga acceso a ese Espacio recibe un 403, y eso tiene que
 * dejar el filtro sin opciones, no tumbar el listado entero.
 *
 * @param espacioId Valores del filtro `project_id` tal como vienen del estado de la consulta.
 * @returns Las opciones del desplegable —"Sin hito" primero— o vacio si no hay un Espacio elegido.
 */
export async function opcionesDeHito (espacioId: string[] | undefined): Promise<OpcionFiltro[]> {
  const elegido = espacioId?.[0]

  // El filtro de Espacio es de un solo valor, pero la URL la escribe cualquiera: un `project_id` que
  // no sea un entero se descarta en vez de viajar a la API y volver como 422.
  if (elegido === undefined || !/^\d+$/.test(elegido)) return []

  const hitos = await pedirOpcional<Hito[]>(`/projects/${elegido}/milestones?per_page=${TOPE_DE_HITOS}`)

  return hitos.datos === null ? [] : opcionesDeFiltroDeHito(hitos.datos)
}
