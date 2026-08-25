import 'server-only'

import { cache } from 'react'
import { pedir } from './servidor.ts'
import type { Lookups } from './recursos.ts'

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
  const { data } = await pedir<Lookups>('/lookups')

  return data
})

export { columnasDelTablero, listaDe, nombreDe } from './catalogos.ts'
