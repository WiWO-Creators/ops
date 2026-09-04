/**
 * Enlaces al panel clasico (Perfex).
 *
 * Toda pantalla nueva de Ops tiene que ofrecer la salida al panel viejo mientras la migracion no
 * termine: hay operaciones que todavia solo viven alli. La base **no se hardcodea** —cada
 * instalacion tiene su dominio— y viaja en `NEXT_PUBLIC_BOARD_URL`, que es publica a proposito:
 * el enlace se pinta en el navegador.
 *
 * Sin la variable, `urlClasica` devuelve `null` y el enlace **no se dibuja**. Un enlace que lleva a
 * un 404 es peor que ninguno: promete una salida que no existe.
 */

/** Ruta de Perfex de cada entidad que hoy tiene pantalla nueva en Ops. */
const RUTAS = {
  espacio: 'admin/projects/view',
  proceso: 'admin/tasks/view',
  /** Ficha del Proyecto en el area de clientes de Perfex, que es lo que ve un contacto. */
  'espacio-cliente': 'clients/project'
} as const

export type EntidadClasica = keyof typeof RUTAS

/**
 * URL de una entidad en el panel clasico.
 *
 * @param entidad Que se abre alla.
 * @param id Id de la entidad, el mismo que usa la API.
 * @returns La URL absoluta, o `null` si falta la variable de entorno o el id no sirve.
 */
export function urlClasica (entidad: EntidadClasica, id: number): string | null {
  const base = process.env.NEXT_PUBLIC_BOARD_URL

  if (typeof base !== 'string' || base.trim() === '') return null
  if (!Number.isInteger(id) || id <= 0) return null

  return `${base.trim().replace(/\/+$/, '')}/${RUTAS[entidad]}/${id}`
}
