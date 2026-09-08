import 'server-only'

import { cache } from 'react'
import { RUTA_DE_ASIGNABLES } from './asignables.ts'
import { pedir, pedirOpcional, pedirPortal } from './servidor.ts'
import type { Lookups, PersonaAsignable } from './recursos.ts'

/**
 * Carga de los catalogos configurables de Perfex.
 *
 * Nada de esto es un enum fijo: los estados de Proceso y de Espacio, los roles y los departamentos se
 * administran desde el panel, asi que codificarlos en el frontend garantiza que se rompan la primera
 * vez que alguien agregue una etapa.
 *
 * `cache` de React lo memoiza **por peticion**: una pantalla que pinte la tabla y el tablero pide
 * `lookups` una sola vez.
 *
 * La lectura de estas listas vive en `catalogos.ts`, que no depende de Next y por eso se puede probar.
 */
export const cargarLookups = cache(async (): Promise<Lookups> => {
  // El equipo va en la misma tanda y no en serie: es un segundo viaje, no una segunda espera. Sale
  // de `/staff/asignables` —no de `/staff`, que exige `staff.view` y le contesta 403 a casi todo el
  // equipo— y con `pedirOpcional` porque un catalogo de filtros no puede tumbar una pantalla.
  const [lookups, equipo] = await Promise.all([
    pedir<Lookups>('/lookups'),
    pedirOpcional<PersonaAsignable[]>(`/${RUTA_DE_ASIGNABLES}`)
  ])

  return { ...lookups.data, staff: (equipo.datos ?? []).map((persona) => ({ id: persona.id, name: persona.full_name })) }
})

/**
 * Los catalogos que el portal del cliente puede ver.
 *
 * Es un endpoint aparte y no el mismo con otro token: al contacto no le corresponde el catalogo de
 * personas del equipo ni el de roles, y la API enumera lo que si sale. Aca solo se lo pide con la
 * sesion del portal.
 */
export const cargarLookupsDelPortal = cache(async (): Promise<Lookups> => {
  const { data } = await pedirPortal<Lookups>('/portal/lookups')

  return data
})

export { columnasDelTablero, listaDe, nombreDe, opcionesDeFiltros } from './catalogos.ts'
